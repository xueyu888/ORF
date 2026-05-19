import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ResultCard } from "../src/components/SharedCards";
import type { Result } from "../src/types/orf";

test("ResultCard labels result evidence as evidence, not objective loot", () => {
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(ResultCard, {
        result: result({ evidenceIds: ["ev-a", "ev-b"], feedbackIds: ["fb-a"], taskIds: ["task-a"] }),
      }),
    ),
  );

  assert.match(html, /2 个证据/);
  assert.doesNotMatch(html, /2 个战利品/);
});

function result(input: Partial<Result>): Result {
  return {
    id: "result-card",
    objectiveId: "objective-card",
    title: "指标卡片",
    description: "",
    metricName: "Recall@5",
    baseline: 0,
    current: 1,
    target: 2,
    unit: "",
    direction: "increase",
    status: "On Track",
    confidence: 80,
    uncertaintyScore: 10,
    acceptedResult: "unreviewed",
    evidenceIds: [],
    taskIds: [],
    feedbackIds: [],
    trend: [],
    reviewCadence: "Weekly",
    ...input,
  };
}
