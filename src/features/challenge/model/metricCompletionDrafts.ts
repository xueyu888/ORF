export type MetricCompletionDrafts = Record<string, true>;

export function completedMetricIdsFromDrafts(drafts: MetricCompletionDrafts): ReadonlySet<string> {
  return new Set(Object.keys(drafts));
}

export function setMetricCompletionDraft(drafts: MetricCompletionDrafts, resultId: string, completed: boolean): MetricCompletionDrafts {
  if (completed) {
    if (drafts[resultId]) return drafts;
    return { ...drafts, [resultId]: true };
  }

  if (!drafts[resultId]) return drafts;
  const next = { ...drafts };
  delete next[resultId];
  return next;
}

export function pruneMetricCompletionDrafts(drafts: MetricCompletionDrafts, validResultIds: ReadonlySet<string>): MetricCompletionDrafts {
  let changed = false;
  const next: MetricCompletionDrafts = {};

  for (const resultId of Object.keys(drafts)) {
    if (validResultIds.has(resultId)) {
      next[resultId] = true;
    } else {
      changed = true;
    }
  }

  return changed ? next : drafts;
}
