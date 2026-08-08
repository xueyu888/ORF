import { randomUUID } from "node:crypto";

let idCounter = 0;

function nextCounter() {
  idCounter = (idCounter + 1) % Number.MAX_SAFE_INTEGER;
  return idCounter.toString(36);
}

export function makeFeedbackId() {
  return `fb-${Date.now()}-${nextCounter()}-${randomUUID()}`;
}

export function makeFeedbackActivityId() {
  return `fact-${Date.now()}-${nextCounter()}-${randomUUID()}`;
}

export function makeFeedbackRelationId() {
  return `frel-${Date.now()}-${nextCounter()}-${randomUUID()}`;
}

export function makeFeedbackDispatchId() {
  return `fdisp-${Date.now()}-${nextCounter()}-${randomUUID()}`;
}

export function feedbackNowIso() {
  return new Date().toISOString();
}
