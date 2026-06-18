import type { FastifyBaseLogger } from "fastify";
import { asc } from "drizzle-orm";
import { env } from "../env";
import { db } from "../db/client";
import { teams } from "../db/schema";
import { publishNotificationEvent } from "../notifications/publisher";
import { listWorkLogReminderRecipients, workLogReminderTargetId } from "../repositories/workLogRepository";
import { publishRealtimeSystemBroadcastToUsers } from "../realtime/realtimeEventBus";
import type { SystemBroadcast } from "../../src/types/realtime";

let schedulerStarted = false;

type ReminderLocalTime = {
  date: string;
  hour: number;
  minute: number;
};

function localReminderTime(now: Date, timeZone: string): ReminderLocalTime {
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
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

export function startWorkLogReminderScheduler(log: FastifyBaseLogger) {
  if (schedulerStarted || !env.ORF_WORK_LOG_REMINDER_ENABLED) {
    return () => undefined;
  }

  schedulerStarted = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    const local = localReminderTime(new Date(), env.ORF_WORK_LOG_REMINDER_TIME_ZONE);
    if (local.hour !== env.ORF_WORK_LOG_REMINDER_HOUR || local.minute !== env.ORF_WORK_LOG_REMINDER_MINUTE) {
      return;
    }

    running = true;
    try {
      await sendDailyWorkLogReminders(local.date, log);
    } catch (error) {
      log.warn({ error }, "ORF work log reminder scheduler failed");
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), env.ORF_WORK_LOG_REMINDER_POLL_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    schedulerStarted = false;
  };
}

async function sendDailyWorkLogReminders(workDate: string, log: FastifyBaseLogger) {
  const teamRows = await db.select({ id: teams.id }).from(teams).orderBy(asc(teams.id));
  for (const team of teamRows) {
    const recipients = await listWorkLogReminderRecipients(team.id, workDate);
    if (recipients.length === 0) {
      continue;
    }

    const targetId = workLogReminderTargetId(workDate);
    const targetHref = `/work-logs?date=${encodeURIComponent(workDate)}`;
    const recipientUserIds = recipients.map((recipient) => recipient.id);
    await publishNotificationEvent({
      actorName: "ORF",
      actorUserId: null,
      body: "记录今天围绕目标完成的工作，团队活动流会同步展示。",
      kind: "worklog.reminder",
      metadata: { workDate },
      recipientUserIds,
      targetHref,
      targetId,
      targetType: "workLog",
      teamId: team.id,
      title: "该填写今天的工作日志了",
    });

    const broadcast: SystemBroadcast = {
      id: targetId,
      body: "写下今天围绕目标完成的工作，团队成员会在活动流里看到。",
      createdAt: new Date().toISOString(),
      notificationKind: "worklog.reminder",
      sticky: true,
      targetHref,
      title: "工作日志提醒",
      tone: "workLogReminder",
    };
    publishRealtimeSystemBroadcastToUsers(team.id, recipientUserIds, broadcast);
    log.info({ recipientCount: recipients.length, teamId: team.id, workDate }, "Sent ORF work log reminder");
  }
}
