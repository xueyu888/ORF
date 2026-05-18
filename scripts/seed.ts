import { closeDb, db } from "../server/db/client";
import {
  commentMessages,
  commentThreads,
  evidence,
  feedback,
  feedbackCauseCategories,
  objectives,
  objectiveLoot,
  pointLedger,
  results,
  resultTrendPoints,
  rolePermissions,
  taskChecklistItems,
  tasks,
  teamMembers,
  teams,
  users,
} from "../server/db/schema";
import { permissionStorageResource, permissionStorageStage } from "../server/repositories/permissionRepository";
import { initialOrfState } from "../src/data/initialOrfState";

const team = {
  id: "team-ai-app",
  name: "AI 应用团队",
  createdAt: "2026-04-01",
};
type SeedUser = {
  id: string;
  name: string;
  email: string;
  status: "active";
  createdAt: string;
  lastLoginAt: string | null;
};
const bootstrapAdmin: SeedUser = {
  id: "user-xueyu",
  name: "xueyu",
  email: "xueyu@qq.com",
  status: "active",
  createdAt: "2026-04-01",
  lastLoginAt: "2026-05-05T09:42:00.000Z",
};

function userIdForName(name: string) {
  return `user-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function emailForName(name: string) {
  return `${userIdForName(name).replace(/^user-/, "")}@orf.local`;
}

function collectUserNames() {
  return Array.from(
    new Set([
      ...initialOrfState.objectives.flatMap((item) => item.challengers),
      ...initialOrfState.objectives.flatMap((item) => item.assignedChallengers),
      ...initialOrfState.objectives.flatMap((item) => item.challengeApplications.map((application) => application.applicant)),
      ...initialOrfState.results.map((item) => item.definer ?? ""),
      ...initialOrfState.tasks.map((item) => item.assignee),
      ...initialOrfState.feedback.map((item) => item.owner),
      ...initialOrfState.evidence.map((item) => item.owner),
      ...initialOrfState.comments.map((item) => item.createdBy),
      ...initialOrfState.comments.flatMap((thread) => thread.messages.map((message) => message.author)),
    ]),
  ).filter(Boolean);
}

async function seed() {
  await db.transaction(async (tx) => {
    await tx.delete(commentMessages);
    await tx.delete(commentThreads);
    await tx.delete(pointLedger);
    await tx.delete(objectiveLoot);
    await tx.delete(evidence);
    await tx.delete(feedbackCauseCategories);
    await tx.delete(feedback);
    await tx.delete(taskChecklistItems);
    await tx.delete(tasks);
    await tx.delete(resultTrendPoints);
    await tx.delete(results);
    await tx.delete(objectives);
    await tx.delete(rolePermissions);
    await tx.delete(teamMembers);
    await tx.delete(users);
    await tx.delete(teams);

    await tx.insert(teams).values(team);
    await tx.insert(rolePermissions).values(
      initialOrfState.permissionRules.map((rule) => ({
        teamId: team.id,
        role: rule.role,
        stage: permissionStorageStage,
        resource: permissionStorageResource,
        actions: rule.permissions,
      })),
    );

    const userRows: SeedUser[] = collectUserNames().map((name) => ({
      id: userIdForName(name),
      name,
      email: emailForName(name),
      status: "active",
      createdAt: "2026-04-01",
      lastLoginAt: "2026-05-01T11:06:00.000Z",
    }));
    userRows.push(bootstrapAdmin);

    if (userRows.length > 0) {
      await tx.insert(users).values(userRows);
      await tx.insert(teamMembers).values(userRows.map((user) => ({ teamId: team.id, userId: user.id, role: user.id === bootstrapAdmin.id ? ("admin" as const) : ("member" as const) })));
    }

    await tx.insert(objectives).values(
      initialOrfState.objectives.map((objective) => ({
        id: objective.id,
        teamId: team.id,
        title: objective.title,
        description: objective.description,
        whyItMatters: objective.whyItMatters,
        cycle: objective.cycle,
        stage: objective.stage,
        flowStatus: objective.flowStatus,
        status: objective.status,
        confidence: objective.confidence,
        progress: objective.progress,
        boundary: objective.boundary,
        successDefinition: objective.successDefinition,
        finalDueAt: objective.finalDueAt,
        challengers: objective.challengers,
        assignedChallengers: objective.assignedChallengers,
        challengeApplications: objective.challengeApplications,
        acceptedAt: objective.acceptedAt ?? null,
        confirmationDueAt: objective.confirmationDueAt ?? null,
        confirmedAt: objective.confirmedAt ?? null,
        lootSubmittedAt: objective.lootSubmittedAt ?? null,
        acceptedResult: objective.acceptedResult ?? null,
        completionMultiplier: objective.completionMultiplier ?? null,
        objectiveBasePoints: objective.objectiveBasePoints,
        objectiveSettlementPoints: objective.objectiveSettlementPoints ?? null,
        createdAt: objective.createdAt,
        updatedAt: objective.updatedAt,
        createdBy: bootstrapAdmin.id,
        updatedBy: bootstrapAdmin.id,
      })),
    );

    await tx.insert(results).values(
      initialOrfState.results.map((result) => ({
        id: result.id,
        teamId: team.id,
        objectiveId: result.objectiveId,
        title: result.title,
        description: result.description,
        metricName: result.metricName,
        metricRequirement: result.metricRequirement ?? null,
        statisticalObject: result.statisticalObject ?? null,
        completionStandard: result.completionStandard ?? null,
        sampleSet: result.sampleSet ?? null,
        measurementScope: result.measurementScope ?? null,
        uncertaintyLevel: result.uncertaintyLevel ?? null,
        baseline: result.baseline,
        current: result.current,
        target: result.target,
        unit: result.unit,
        direction: result.direction,
        status: result.status,
        confidence: result.confidence,
        source: result.source ?? "managerDefined",
        definer: result.definer ?? "",
        uncertaintyScore: result.uncertaintyScore,
        acceptedResult: result.acceptedResult,
        reviewCadence: result.reviewCadence,
        sortOrder: initialOrfState.objectives.find((objective) => objective.id === result.objectiveId)?.resultIds.indexOf(result.id) ?? 0,
        createdBy: result.definer ? userIdForName(result.definer) : bootstrapAdmin.id,
        updatedBy: result.definer ? userIdForName(result.definer) : bootstrapAdmin.id,
      })),
    );

    const trendRows = initialOrfState.results.flatMap((result) =>
      result.trend.map((point, index) => ({
        resultId: result.id,
        date: point.date,
        value: point.value,
        sortOrder: index,
      })),
    );
    if (trendRows.length > 0) {
      await tx.insert(resultTrendPoints).values(trendRows);
    }

    await tx.insert(tasks).values(
      initialOrfState.tasks.map((task) => ({
        id: task.id,
        teamId: team.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        assignee: task.assignee,
        linkedObjectiveId: task.linkedObjectiveId,
        linkedResultId: task.linkedResultId,
        feedbackOriginId: task.feedbackOriginId ?? null,
        dueDate: task.dueDate,
        tags: task.tags,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        sortOrder: initialOrfState.tasks.filter((item) => item.linkedResultId === task.linkedResultId).findIndex((item) => item.id === task.id),
        createdBy: userIdForName(task.assignee),
        updatedBy: userIdForName(task.assignee),
      })),
    );

    const checklistRows = initialOrfState.tasks.flatMap((task) =>
      task.checklist.map((item, index) => ({
        id: item.id,
        taskId: task.id,
        label: item.label,
        done: item.done,
        sortOrder: index,
        updatedAt: item.updatedAt ?? task.updatedAt,
      })),
    );
    if (checklistRows.length > 0) {
      await tx.insert(taskChecklistItems).values(checklistRows);
    }

    await tx.insert(feedback).values(
      initialOrfState.feedback.map((item) => ({
        id: item.id,
        teamId: team.id,
        phenomenon: item.phenomenon,
        impact: item.impact,
        linkedObjectiveId: item.linkedObjectiveId,
        linkedResultId: item.linkedResultId,
        suggestedAdjustment: item.suggestedAdjustment,
        source: item.source,
        status: item.status,
        owner: item.owner,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        createdBy: userIdForName(item.owner),
        updatedBy: userIdForName(item.owner),
      })),
    );

    const causeRows = initialOrfState.feedback.flatMap((item) =>
      item.causeCategories.map((category, index) => ({
        feedbackId: item.id,
        category,
        sortOrder: index,
      })),
    );
    if (causeRows.length > 0) {
      await tx.insert(feedbackCauseCategories).values(causeRows);
    }

    await tx.insert(evidence).values(
      initialOrfState.evidence.map((item) => ({
        id: item.id,
        teamId: team.id,
        type: item.type,
        title: item.title,
        summary: item.summary,
        source: item.source,
        date: item.date,
        owner: item.owner,
        linkedResultId: item.linkedResultId,
        linkedFeedbackId: item.linkedFeedbackId ?? null,
        createdBy: userIdForName(item.owner),
        updatedBy: userIdForName(item.owner),
      })),
    );

    if (initialOrfState.comments.length > 0) {
      await tx.insert(commentThreads).values(
        initialOrfState.comments.map((thread) => ({
          id: thread.id,
          teamId: team.id,
          targetType: thread.targetType,
          targetId: thread.targetId,
          targetTitle: thread.targetTitle,
          status: thread.status,
          createdBy: userIdForName(thread.createdBy),
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
        })),
      );
      await tx.insert(commentMessages).values(
        initialOrfState.comments.flatMap((thread) =>
          thread.messages.map((message, index) => ({
            id: message.id,
            threadId: thread.id,
            authorUserId: userIdForName(message.author),
            author: message.author,
            body: message.body,
            createdAt: message.createdAt,
            parentMessageId: message.parentMessageId ?? null,
            replyToMessageId: message.replyToMessageId ?? null,
            replyToAuthor: message.replyToAuthor ?? null,
            sortOrder: index,
          })),
        ),
      );
    }
  });
}

try {
  await seed();
  console.log("Seeded ORF database.");
} finally {
  await closeDb();
}
