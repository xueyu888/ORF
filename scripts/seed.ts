import { closeDb, db } from "../server/db/client";
import {
  evidence,
  feedback,
  feedbackCauseCategories,
  objectives,
  results,
  resultTrendPoints,
  taskChecklistItems,
  tasks,
  teamMembers,
  teams,
  users,
} from "../server/db/schema";
import { initialOrfState } from "../src/data/mockData";

const team = {
  id: "team-ai-app",
  name: "AI 应用团队",
  createdAt: "2026-04-01",
};

function userIdForName(name: string) {
  return `user-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function collectUserNames() {
  return Array.from(
    new Set([
      ...initialOrfState.objectives.map((item) => item.owner),
      ...initialOrfState.results.map((item) => item.owner),
      ...initialOrfState.tasks.map((item) => item.assignee),
      ...initialOrfState.feedback.map((item) => item.owner),
      ...initialOrfState.evidence.map((item) => item.owner),
    ]),
  ).filter(Boolean);
}

async function seed() {
  await db.transaction(async (tx) => {
    await tx.delete(evidence);
    await tx.delete(feedbackCauseCategories);
    await tx.delete(feedback);
    await tx.delete(taskChecklistItems);
    await tx.delete(tasks);
    await tx.delete(resultTrendPoints);
    await tx.delete(results);
    await tx.delete(objectives);
    await tx.delete(teamMembers);
    await tx.delete(users);
    await tx.delete(teams);

    await tx.insert(teams).values(team);

    const userRows = collectUserNames().map((name) => ({
      id: userIdForName(name),
      name,
      email: null,
      createdAt: "2026-04-01",
    }));

    if (userRows.length > 0) {
      await tx.insert(users).values(userRows);
      await tx.insert(teamMembers).values(userRows.map((user) => ({ teamId: team.id, userId: user.id, role: "member" as const })));
    }

    await tx.insert(objectives).values(
      initialOrfState.objectives.map((objective) => ({
        id: objective.id,
        teamId: team.id,
        title: objective.title,
        description: objective.description,
        whyItMatters: objective.whyItMatters,
        owner: objective.owner,
        cycle: objective.cycle,
        status: objective.status,
        confidence: objective.confidence,
        progress: objective.progress,
        boundary: objective.boundary,
        successDefinition: objective.successDefinition,
        createdAt: objective.createdAt,
        updatedAt: objective.updatedAt,
        createdBy: userIdForName(objective.owner),
        updatedBy: userIdForName(objective.owner),
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
        deliveryRating: result.deliveryRating ?? null,
        baseline: result.baseline,
        current: result.current,
        target: result.target,
        unit: result.unit,
        direction: result.direction,
        status: result.status,
        confidence: result.confidence,
        owner: result.owner,
        reviewCadence: result.reviewCadence,
        createdBy: userIdForName(result.owner),
        updatedBy: userIdForName(result.owner),
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
  });
}

try {
  await seed();
  console.log("Seeded ORF database.");
} finally {
  await closeDb();
}
