import assert from "node:assert/strict";
import test from "node:test";
import { buildResultQualityChecks } from "../src/features/results/model/resultQuality";
import type { Feedback, Objective, Result } from "../src/types/orf";

test("buildResultQualityChecks marks unsupported result quality checks as pending", () => {
  const checks = buildResultQualityChecks({
    objective: objective({ resultIds: ["result"] }),
    result: result({
      metricRequirement: "",
      statisticalObject: "",
      completionStandard: "尽量提升",
      sampleSet: "",
      measurementScope: "",
    }),
    feedback: [],
  });

  assert.deepEqual(Object.fromEntries(checks.map((item) => [item.label, item.passed])), {
    可度量: true,
    有目标战利品入口: true,
    已关联目标: true,
    反馈已更新: false,
    口径清楚: false,
    无模糊词: false,
  });
});

test("buildResultQualityChecks passes when result context is complete", () => {
  const checks = buildResultQualityChecks({
    objective: objective({ resultIds: ["result"] }),
    result: result({
      metricRequirement: "统计对象和完成标准明确",
      statisticalObject: "标准样本集",
      completionStandard: "达到 95%",
      sampleSet: "2999 Q1 样本",
      measurementScope: "固定测试环境",
    }),
    feedback: [feedback()],
  });

  assert.deepEqual(checks.map((item) => item.passed), [true, true, true, true, true, true]);
});

function objective(input: Partial<Objective> = {}): Objective {
  return {
    id: "objective",
    title: "Objective",
    description: "",
    whyItMatters: "",
    cycle: "2999 Q1",
    stage: "goalSetting",
    flowStatus: "candidate",
    status: "Draft",
    confidence: 0,
    progress: 0,
    boundary: "",
    successDefinition: "",
    resultIds: [],
    feedbackIds: [],
    taskIds: [],
    finalDueAt: "2999-03-31T00:00:00.000Z",
    challengers: [],
    assignedChallengers: [],
    challengeApplications: [],
    objectiveBasePoints: 0,
    createdAt: "2999-01-01T00:00:00.000Z",
    updatedAt: "2999-01-01T00:00:00.000Z",
    ...input,
  };
}

function result(input: Partial<Result> = {}): Result {
  return {
    id: "result",
    objectiveId: "objective",
    title: "Result",
    description: "明确描述",
    metricName: "准确率",
    metricRequirement: "准确率达到目标",
    statisticalObject: "标准样本",
    completionStandard: "达到 95%",
    sampleSet: "样本集",
    measurementScope: "固定范围",
    baseline: 0,
    current: 0,
    target: 1,
    unit: "%",
    direction: "increase",
    status: "On Track",
    confidence: 0,
    uncertaintyScore: 0,
    acceptedResult: "unreviewed",
    evidenceIds: [],
    feedbackIds: [],
    trend: [],
    reviewCadence: "",
    createdAt: "2999-01-01T00:00:00.000Z",
    updatedAt: "2999-01-01T00:00:00.000Z",
    ...input,
  };
}

function feedback(input: Partial<Feedback> = {}): Feedback {
  return {
    id: "feedback",
    phenomenon: "",
    evidenceIds: [],
    causeCategories: [],
    impact: "Medium",
    linkedObjectiveId: "objective",
    linkedResultId: "result",
    suggestedAdjustment: "",
    source: "Team review",
    status: "New",
    owner: "Kai Wang",
    createdAt: "2999-01-01T00:00:00.000Z",
    updatedAt: "2999-01-01T00:00:00.000Z",
    activity: [],
    ...input,
  };
}
