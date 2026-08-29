import type { FastifyBaseLogger } from "fastify";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import type { WorkLogReminderState } from "../../src/types/orf";
import { unscopedWorkLogMemberNameList } from "../../src/domain/orfWorkLogs";
import { env } from "../env";
import { db } from "../db/client";
import { objectives, teamMembers, teams, users, workLogEntries, workLogReminderStates } from "../db/schema";
import { publishNotificationEvent } from "../messageSystem/notificationPublisher";
import {
  publishRealtimeWorkLogReminderRequired,
  publishRealtimeWorkLogReminderResolved,
} from "../realtime/realtimeEventBus";

type WorkLogReminderClock = {
  date: string;
  minuteOfDay: number;
};

type WorkLogReminderDebtSnapshot = {
  eligible: boolean;
  missingDates: string[];
  requiredDates: string[];
  windowEndDate: string;
  windowStartDate: string;
};

type WorkLogReminderStateRow = typeof workLogReminderStates.$inferSelect;

const nowIso = () => new Date().toISOString();
const reminderTargetId = (teamId: string, userId: string) => `work-log-debt:${teamId}:${userId}`;

function localReminderClock(now: Date, timeZone: string): WorkLogReminderClock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minuteOfDay: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function addIsoDateDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function dateRangeEndingAt(endDate: string, count: number) {
  return Array.from({ length: count }, (_, index) => addIsoDateDays(endDate, index - count + 1));
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

function reminderStartMinute() {
  return env.ORF_WORK_LOG_REMINDER_HOUR * 60 + env.ORF_WORK_LOG_REMINDER_MINUTE;
}

function reminderEndMinute() {
  return env.ORF_WORK_LOG_REMINDER_END_HOUR * 60 + env.ORF_WORK_LOG_REMINDER_END_MINUTE;
}

function isReminderWindowOpen(clock: WorkLogReminderClock) {
  const start = reminderStartMinute();
  const end = reminderEndMinute();
  return clock.minuteOfDay >= start && clock.minuteOfDay < end;
}

function reminderWindowEndDate(clock: WorkLogReminderClock) {
  return clock.minuteOfDay >= reminderStartMinute() ? clock.date : addIsoDateDays(clock.date, -1);
}

function normalizeDateArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function shouldRemindState(row: Pick<WorkLogReminderStateRow, "missingDates" | "nextRemindAt" | "status">, now: Date) {
  if (row.status !== "active" || normalizeDateArray(row.missingDates).length === 0) return false;
  const clock = localReminderClock(now, env.ORF_WORK_LOG_REMINDER_TIME_ZONE);
  if (!isReminderWindowOpen(clock)) return false;
  return !row.nextRemindAt || new Date(row.nextRemindAt).getTime() <= now.getTime();
}

function toClientReminderState(row: WorkLogReminderStateRow, now: Date, options: { forceRemindNow?: boolean } = {}): WorkLogReminderState {
  const missingDates = normalizeDateArray(row.missingDates);
  return {
    id: reminderTargetId(row.teamId, row.userId),
    status: row.status,
    windowStartDate: row.windowStartDate,
    windowEndDate: row.windowEndDate,
    requiredDates: normalizeDateArray(row.requiredDates),
    missingDates,
    lastRemindedAt: row.lastRemindedAt,
    nextRemindAt: row.nextRemindAt,
    snoozeCount: row.snoozeCount,
    resolvedAt: row.resolvedAt,
    updatedAt: row.updatedAt,
    shouldRemindNow: options.forceRemindNow || shouldRemindState(row, now),
  };
}

function virtualResolvedState(input: { teamId: string; userId: string; snapshot: WorkLogReminderDebtSnapshot; now: string }): WorkLogReminderState {
  return {
    id: reminderTargetId(input.teamId, input.userId),
    status: "resolved",
    windowStartDate: input.snapshot.windowStartDate,
    windowEndDate: input.snapshot.windowEndDate,
    requiredDates: input.snapshot.requiredDates,
    missingDates: [],
    lastRemindedAt: null,
    nextRemindAt: null,
    snoozeCount: 0,
    resolvedAt: input.now,
    updatedAt: input.now,
    shouldRemindNow: false,
  };
}

function virtualDisabledState(input: { teamId: string; userId: string; now: Date }): WorkLogReminderState {
  const clock = localReminderClock(input.now, env.ORF_WORK_LOG_REMINDER_TIME_ZONE);
  const windowEndDate = reminderWindowEndDate(clock);
  const nowValue = input.now.toISOString();
  return {
    id: reminderTargetId(input.teamId, input.userId),
    status: "resolved",
    windowStartDate: windowEndDate,
    windowEndDate,
    requiredDates: [],
    missingDates: [],
    lastRemindedAt: null,
    nextRemindAt: null,
    snoozeCount: 0,
    resolvedAt: nowValue,
    updatedAt: nowValue,
    shouldRemindNow: false,
  };
}

async function getReminderStateRow(teamId: string, userId: string) {
  const [row] = await db
    .select()
    .from(workLogReminderStates)
    .where(and(eq(workLogReminderStates.teamId, teamId), eq(workLogReminderStates.userId, userId)))
    .limit(1);
  return row ?? null;
}

async function isWorkLogReminderEligibleUser(teamId: string, userId: string) {
  const [row] = await db
    .select({ id: users.id })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(
      eq(teamMembers.teamId, teamId),
      eq(users.id, userId),
      eq(users.status, "active"),
      or(
        eq(teamMembers.role, "admin"),
        and(
          eq(teamMembers.role, "member"),
          or(
            inArray(users.name, [...unscopedWorkLogMemberNameList]),
            sql`exists (
              select 1
              from ${objectives}
              where ${objectives.teamId} = ${teamMembers.teamId}
                and ${objectives.challengerUserIds} ? (${users.id})::text
            )`,
          ),
        ),
      ),
    ))
    .limit(1);
  return Boolean(row);
}

async function listWorkLogReminderEligibleUsers(teamId: string) {
  return db
    .select({ id: users.id, name: users.name })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(and(
      eq(teamMembers.teamId, teamId),
      eq(users.status, "active"),
      or(
        eq(teamMembers.role, "admin"),
        and(
          eq(teamMembers.role, "member"),
          or(
            inArray(users.name, [...unscopedWorkLogMemberNameList]),
            sql`exists (
              select 1
              from ${objectives}
              where ${objectives.teamId} = ${teamMembers.teamId}
                and ${objectives.challengerUserIds} ? (${users.id})::text
            )`,
          ),
        ),
      ),
    ))
    .orderBy(asc(users.name), asc(users.id));
}

async function computeWorkLogDebtSnapshot(teamId: string, userId: string, now: Date): Promise<WorkLogReminderDebtSnapshot> {
  const clock = localReminderClock(now, env.ORF_WORK_LOG_REMINDER_TIME_ZONE);
  const windowEndDate = reminderWindowEndDate(clock);
  const requiredDates = dateRangeEndingAt(windowEndDate, env.ORF_WORK_LOG_REMINDER_WINDOW_DAYS);
  const eligible = await isWorkLogReminderEligibleUser(teamId, userId);
  if (!eligible || requiredDates.length === 0) {
    return {
      eligible,
      missingDates: [],
      requiredDates,
      windowEndDate,
      windowStartDate: requiredDates[0] ?? windowEndDate,
    };
  }

  const rows = await db
    .select({ workDate: workLogEntries.workDate })
    .from(workLogEntries)
    .where(and(
      eq(workLogEntries.teamId, teamId),
      eq(workLogEntries.authorUserId, userId),
      inArray(workLogEntries.workDate, requiredDates),
    ));
  const filledDates = new Set(rows.map((row) => row.workDate));
  return {
    eligible,
    missingDates: requiredDates.filter((date) => !filledDates.has(date)),
    requiredDates,
    windowEndDate,
    windowStartDate: requiredDates[0] ?? windowEndDate,
  };
}

async function ensureReminderNotification(input: {
  existingEventId?: string | null;
  missingDates: string[];
  teamId: string;
  userId: string;
  windowEndDate: string;
  windowStartDate: string;
}) {
  if (input.existingEventId) return input.existingEventId;

  const count = input.missingDates.length;
  const notifications = await publishNotificationEvent({
    actorName: "ORF",
    actorUserId: null,
    body: `你最近一周有 ${count} 天工作日志未补全，请打开工作日志补齐。`,
    kind: "worklog.reminder",
    metadata: {
      missingCount: String(count),
      windowEndDate: input.windowEndDate,
      windowStartDate: input.windowStartDate,
    },
    recipientUserIds: [input.userId],
    targetHref: `/work-logs?date=${encodeURIComponent(input.missingDates[0] ?? input.windowEndDate)}&view=today`,
    targetId: reminderTargetId(input.teamId, input.userId),
    targetType: "workLog",
    teamId: input.teamId,
    title: "工作日志欠账提醒",
  });

  return notifications[0]?.id ?? null;
}

async function persistResolvedState(input: {
  existing: WorkLogReminderStateRow | null;
  now: string;
  snapshot: WorkLogReminderDebtSnapshot;
  teamId: string;
  userId: string;
}) {
  if (!input.existing) {
    return virtualResolvedState({
      teamId: input.teamId,
      userId: input.userId,
      snapshot: input.snapshot,
      now: input.now,
    });
  }

  await db
    .update(workLogReminderStates)
    .set({
      status: "resolved",
      windowStartDate: input.snapshot.windowStartDate,
      windowEndDate: input.snapshot.windowEndDate,
      requiredDates: input.snapshot.requiredDates,
      missingDates: [],
      nextRemindAt: null,
      resolvedAt: input.now,
      updatedAt: input.now,
    })
    .where(and(eq(workLogReminderStates.teamId, input.teamId), eq(workLogReminderStates.userId, input.userId)));
  const row = await getReminderStateRow(input.teamId, input.userId);
  return row
    ? toClientReminderState(row, new Date(input.now))
    : virtualResolvedState({
        teamId: input.teamId,
        userId: input.userId,
        snapshot: input.snapshot,
        now: input.now,
      });
}

async function persistActiveState(input: {
  existing: WorkLogReminderStateRow | null;
  now: string;
  snapshot: WorkLogReminderDebtSnapshot;
  teamId: string;
  userId: string;
}) {
  const notificationEventId = input.existing?.notificationEventId
    ?? (isReminderWindowOpen(localReminderClock(new Date(input.now), env.ORF_WORK_LOG_REMINDER_TIME_ZONE))
      ? await ensureReminderNotification({
          missingDates: input.snapshot.missingDates,
          teamId: input.teamId,
          userId: input.userId,
          windowEndDate: input.snapshot.windowEndDate,
          windowStartDate: input.snapshot.windowStartDate,
        })
      : null);
  const nextRemindAt =
    input.existing?.status === "active" &&
    input.existing.nextRemindAt &&
    new Date(input.existing.nextRemindAt).getTime() > new Date(input.now).getTime()
      ? input.existing.nextRemindAt
      : input.now;
  const snoozeCount = input.existing?.status === "active" ? input.existing.snoozeCount : 0;

  await db
    .insert(workLogReminderStates)
    .values({
      teamId: input.teamId,
      userId: input.userId,
      status: "active",
      windowStartDate: input.snapshot.windowStartDate,
      windowEndDate: input.snapshot.windowEndDate,
      requiredDates: input.snapshot.requiredDates,
      missingDates: input.snapshot.missingDates,
      lastRemindedAt: input.existing?.lastRemindedAt ?? null,
      nextRemindAt,
      snoozeCount,
      notificationEventId,
      resolvedAt: null,
      createdAt: input.existing?.createdAt ?? input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: [workLogReminderStates.teamId, workLogReminderStates.userId],
      set: {
        status: "active",
        windowStartDate: input.snapshot.windowStartDate,
        windowEndDate: input.snapshot.windowEndDate,
        requiredDates: input.snapshot.requiredDates,
        missingDates: input.snapshot.missingDates,
        nextRemindAt,
        snoozeCount,
        notificationEventId,
        resolvedAt: null,
        updatedAt: input.now,
      },
    });

  const row = await getReminderStateRow(input.teamId, input.userId);
  if (!row) {
    throw new Error("work_log_reminder_state_upsert_failed");
  }
  return toClientReminderState(row, new Date(input.now));
}

export async function reconcileWorkLogReminderState(input: {
  publishRealtime?: boolean;
  teamId: string;
  userId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (!env.ORF_WORK_LOG_REMINDER_ENABLED) {
    return virtualDisabledState({
      teamId: input.teamId,
      userId: input.userId,
      now,
    });
  }

  const nowValue = now.toISOString();
  const [existing, snapshot] = await Promise.all([
    getReminderStateRow(input.teamId, input.userId),
    computeWorkLogDebtSnapshot(input.teamId, input.userId, now),
  ]);
  const nextState =
    snapshot.missingDates.length === 0
      ? await persistResolvedState({
          existing,
          now: nowValue,
          snapshot,
          teamId: input.teamId,
          userId: input.userId,
        })
      : await persistActiveState({
          existing,
          now: nowValue,
          snapshot,
          teamId: input.teamId,
          userId: input.userId,
        });

  if (input.publishRealtime && existing?.status === "active" && nextState.status === "resolved") {
    publishRealtimeWorkLogReminderResolved(input.teamId, input.userId, nextState);
  }

  return nextState;
}

export async function snoozeWorkLogReminderState(input: { teamId: string; userId: string; now?: Date }) {
  const now = input.now ?? new Date();
  const state = await reconcileWorkLogReminderState({ ...input, now });
  if (state.status !== "active") return state;

  const updatedAt = now.toISOString();
  const nextRemindAt = addMinutes(now, env.ORF_WORK_LOG_REMINDER_SNOOZE_MINUTES);
  await db
    .update(workLogReminderStates)
    .set({
      nextRemindAt,
      snoozeCount: state.snoozeCount + 1,
      updatedAt,
    })
    .where(and(eq(workLogReminderStates.teamId, input.teamId), eq(workLogReminderStates.userId, input.userId)));

  const row = await getReminderStateRow(input.teamId, input.userId);
  return row ? toClientReminderState(row, now) : state;
}

async function remindIfDue(input: { state: WorkLogReminderState; teamId: string; userId: string; now: Date }) {
  if (!input.state.shouldRemindNow || input.state.status !== "active") return false;

  const remindedAt = input.now.toISOString();
  const nextRemindAt = addMinutes(input.now, env.ORF_WORK_LOG_REMINDER_SNOOZE_MINUTES);
  await db
    .update(workLogReminderStates)
    .set({
      lastRemindedAt: remindedAt,
      nextRemindAt,
      updatedAt: remindedAt,
    })
    .where(and(eq(workLogReminderStates.teamId, input.teamId), eq(workLogReminderStates.userId, input.userId)));
  const row = await getReminderStateRow(input.teamId, input.userId);
  if (!row) return false;

  publishRealtimeWorkLogReminderRequired(input.teamId, input.userId, toClientReminderState(row, input.now, { forceRemindNow: true }));
  return true;
}

export async function runWorkLogReminderSweep(log: FastifyBaseLogger, now = new Date()) {
  if (!env.ORF_WORK_LOG_REMINDER_ENABLED) return;
  const teamRows = await db.select({ id: teams.id }).from(teams).orderBy(asc(teams.id));
  for (const team of teamRows) {
    const recipients = await listWorkLogReminderEligibleUsers(team.id);
    let reminderCount = 0;
    for (const recipient of recipients) {
      const state = await reconcileWorkLogReminderState({
        publishRealtime: true,
        teamId: team.id,
        userId: recipient.id,
        now,
      });
      if (await remindIfDue({ state, teamId: team.id, userId: recipient.id, now })) {
        reminderCount += 1;
      }
    }
    if (reminderCount > 0) {
      log.info({ reminderCount, teamId: team.id }, "Sent ORF work log debt reminders");
    }
  }
}
