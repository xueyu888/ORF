export type GitPushCommit = {
  authorName?: string;
  authorUrl?: string;
  message: string;
  sha: string;
  timestamp?: string;
  url?: string;
};

export type GitPushRefKind = "branch" | "tag";
export type GitPushAction = "created" | "deleted" | "pushed";

export type GitPushChatMessage = {
  action?: GitPushAction;
  actorName?: string;
  actorUrl?: string;
  commits: readonly GitPushCommit[];
  detailsUrl?: string;
  projectName: string;
  projectUrl?: string;
  refKind?: GitPushRefKind;
  refName: string;
  totalCommitCount?: number;
};

export const gitPushVisibleCommitLimit = 5;

function timestampMillis(value: string | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Push webhook payloads list the pushed range, not a canonical UI order.
 * Normalize that boundary once so every downstream formatter can rely on
 * newest-first commits. The pushed head wins, then timestamps, then the
 * payload's reverse-chronological position as a deterministic fallback.
 */
export function newestFirstPushCommits(
  commits: readonly GitPushCommit[],
  headSha?: string,
): GitPushCommit[] {
  const normalizedHeadSha = headSha?.trim();
  return commits
    .map((commit, index) => ({ commit, index }))
    .sort((left, right) => {
      const leftIsHead = Boolean(normalizedHeadSha && left.commit.sha === normalizedHeadSha);
      const rightIsHead = Boolean(normalizedHeadSha && right.commit.sha === normalizedHeadSha);
      if (leftIsHead !== rightIsHead) return leftIsHead ? -1 : 1;

      const leftTimestamp = timestampMillis(left.commit.timestamp);
      const rightTimestamp = timestampMillis(right.commit.timestamp);
      if (leftTimestamp !== null && rightTimestamp !== null && leftTimestamp !== rightTimestamp) {
        return rightTimestamp - leftTimestamp;
      }
      return right.index - left.index;
    })
    .map(({ commit }) => commit);
}

export function formatGitPushChatMessage(input: GitPushChatMessage) {
  const action = input.action ?? "pushed";
  const refKind = input.refKind ?? "branch";
  const totalCommitCount = Math.max(input.totalCommitCount ?? input.commits.length, input.commits.length);
  const visibleCommits = input.commits.slice(0, gitPushVisibleCommitLimit);
  const hiddenCommitCount = Math.max(0, totalCommitCount - visibleCommits.length);
  const target = `${link(input.projectName, input.projectUrl)} 的 ${code(input.refName || "unknown")} ${refKind === "tag" ? "标签" : "分支"}`;
  const actor = input.actorName ? link(`**${plain(input.actorName)}**`, input.actorUrl) : "";
  const summary = formatSummary({ action, actor, target, totalCommitCount });
  const lines = [summary];

  for (const commit of visibleCommits) {
    const sha = shortSha(commit.sha) || "unknown";
    const subject = firstLine(commit.message) || "无提交说明";
    const author = commit.authorName
      ? ` — _${link(plain(commit.authorName), commit.authorUrl)}_`
      : "";
    lines.push(`- ${link(code(sha), commit.url)} ${plain(subject)}${author}`);
  }

  if (hiddenCommitCount > 0) {
    lines.push(`另有 ${hiddenCommitCount} 个提交未逐条显示。`);
  }
  if (input.detailsUrl) {
    lines.push(`[查看全部变更](${input.detailsUrl})`);
  }
  return lines.join("\n");
}

function formatSummary(input: {
  action: GitPushAction;
  actor: string;
  target: string;
  totalCommitCount: number;
}) {
  const actorPrefix = input.actor ? `${input.actor} ` : "";
  if (input.action === "deleted") {
    return `${actorPrefix}删除了 ${input.target}。`;
  }
  if (input.action === "created") {
    return `${actorPrefix}创建了 ${input.target}，包含 ${input.totalCommitCount} 个提交。`;
  }
  return input.actor
    ? `${input.actor} 推送了 ${input.totalCommitCount} 个提交到 ${input.target}。`
    : `${input.totalCommitCount} 个提交已推送到 ${input.target}。`;
}

function shortSha(sha: string) {
  return sha.trim().slice(0, 7);
}

function firstLine(value: string) {
  return value.split(/\r?\n/, 1)[0]?.trim() ?? "";
}

function code(value: string) {
  return `\`${value.replace(/`/g, "")}\``;
}

function plain(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/([\[\]*_])/g, "\\$1");
}

function link(label: string, url: string | undefined) {
  return url ? `[${label}](${url})` : label;
}
