import { createHash } from "node:crypto";

type HeaderValue = string | string[] | number | undefined;
type HeaderMap = Record<string, HeaderValue>;
type JsonRecord = Record<string, unknown>;

export type GitLabOrfChatProject = {
  id: string;
  path: string;
  url: string;
};

export const gitLabOrfChatEventTypes = ["push", "tag_push", "merge_request", "issue", "pipeline"] as const;
export type GitLabOrfChatEventType = typeof gitLabOrfChatEventTypes[number];
export type GitLabWebhookEventType = "push" | "tag_push" | "merge_request" | "issue" | "pipeline" | "generic";

export type GitLabWebhookEvent = {
  actorName: string;
  eventKey: string;
  eventType: GitLabWebhookEventType;
  objectKind: string;
  payload: JsonRecord;
  project: GitLabOrfChatProject;
};

const zeroShaPattern = /^0+$/;
const gitLabOrfChatEventTypeSet = new Set<string>(gitLabOrfChatEventTypes);

export function parseGitLabWebhookEvent(input: { headers?: HeaderMap; payload: unknown }): GitLabWebhookEvent | null {
  const payload = record(input.payload);
  if (!payload) return null;
  const project = gitLabProject(payload);
  if (!project) return null;

  const headerEvent = header(input.headers, "x-gitlab-event");
  const objectKind = text(payload.object_kind) ?? headerEvent ?? "GitLab Hook";
  const eventType = gitLabWebhookEventType(objectKind, headerEvent);
  const eventKey = gitLabWebhookEventKey({
    eventType,
    eventUuid: header(input.headers, "x-gitlab-event-uuid"),
    objectKind,
    payload,
    projectId: project.id,
  });

  return {
    actorName: gitLabActorName(payload),
    eventKey,
    eventType,
    objectKind,
    payload,
    project,
  };
}

export function normalizeGitLabOrfChatEventTypes(values: readonly string[] | null | undefined): GitLabOrfChatEventType[] {
  const normalized: GitLabOrfChatEventType[] = [];
  for (const value of values ?? gitLabOrfChatEventTypes) {
    if (gitLabOrfChatEventTypeSet.has(value) && !normalized.includes(value as GitLabOrfChatEventType)) {
      normalized.push(value as GitLabOrfChatEventType);
    }
  }
  return normalized.length > 0 ? normalized : [...gitLabOrfChatEventTypes];
}

export function gitLabProjectPathMatchesGroup(projectPath: string, groupPath: string) {
  const project = normalizeGitLabPath(projectPath);
  const group = normalizeGitLabPath(groupPath);
  return Boolean(group && (project === group || project.startsWith(`${group}/`)));
}

export function normalizeGitLabPath(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/");
}

export function formatGitLabWebhookChatMessage(event: GitLabWebhookEvent) {
  switch (event.eventType) {
    case "push":
      return formatPushEvent(event);
    case "tag_push":
      return formatPushEvent(event);
    case "merge_request":
      return formatMergeRequestEvent(event);
    case "issue":
      return formatIssueEvent(event);
    case "pipeline":
      return formatPipelineEvent(event);
    case "generic":
      return formatGenericEvent(event);
  }
}

function formatPushEvent(event: GitLabWebhookEvent) {
  const payload = event.payload;
  const ref = refName(text(payload.ref) ?? "");
  const before = text(payload.before);
  const after = text(payload.after);
  const commits = records(payload.commits);
  const totalCommits = numberValue(payload.total_commits_count) ?? commits.length;
  const compare = text(payload.compare);
  const isTag = event.eventType === "tag_push";
  const refLabel = isTag ? "tag" : "branch";
  const action = after && zeroShaPattern.test(after)
    ? "deleted"
    : before && zeroShaPattern.test(before)
      ? "created"
      : "pushed";
  const lines = [
    `**GitLab ${isTag ? "tag" : "push"}** - ${projectLink(event.project)}`,
    `${plain(event.actorName)} ${action} ${totalCommits} commit${totalCommits === 1 ? "" : "s"} to ${refLabel} ${code(ref || "unknown")}.`,
  ];

  for (const commit of commits.slice(0, 5)) {
    const sha = shortSha(text(commit.id) ?? text(commit.sha) ?? "");
    const message = firstLine(text(commit.message) ?? "(no commit message)");
    const author = record(commit.author);
    const authorName = text(author?.name) ?? text(author?.username);
    const url = text(commit.url);
    lines.push(`- ${commitLink(sha, url)} ${plain(message)}${authorName ? ` - ${plain(authorName)}` : ""}`);
  }

  if (commits.length > 5) {
    lines.push(`- ... ${commits.length - 5} more commits`);
  }
  if (compare) {
    lines.push(`[Compare changes](${compare})`);
  }
  return lines.join("\n");
}

function formatMergeRequestEvent(event: GitLabWebhookEvent) {
  const attributes = record(event.payload.object_attributes) ?? {};
  const iid = text(attributes.iid) ?? text(attributes.id) ?? "";
  const title = text(attributes.title) ?? "Untitled merge request";
  const url = text(attributes.url);
  const action = text(attributes.action) ?? text(attributes.state) ?? "updated";
  const state = text(attributes.state);
  const sourceBranch = text(attributes.source_branch);
  const targetBranch = text(attributes.target_branch);
  return [
    `**GitLab merge request** - ${projectLink(event.project)}`,
    `${plain(event.actorName)} ${plain(action)} ${url ? `[!${plain(iid)} ${plain(title)}](${url})` : `!${plain(iid)} ${plain(title)}`}.`,
    [sourceBranch ? code(sourceBranch) : "", targetBranch ? code(targetBranch) : ""].filter(Boolean).join(" -> ") +
      (state ? ` - ${plain(state)}` : ""),
  ].filter(Boolean).join("\n");
}

function formatIssueEvent(event: GitLabWebhookEvent) {
  const attributes = record(event.payload.object_attributes) ?? {};
  const iid = text(attributes.iid) ?? text(attributes.id) ?? "";
  const title = text(attributes.title) ?? "Untitled issue";
  const url = text(attributes.url);
  const action = text(attributes.action) ?? text(attributes.state) ?? "updated";
  return [
    `**GitLab issue** - ${projectLink(event.project)}`,
    `${plain(event.actorName)} ${plain(action)} ${url ? `[#${plain(iid)} ${plain(title)}](${url})` : `#${plain(iid)} ${plain(title)}`}.`,
  ].join("\n");
}

function formatPipelineEvent(event: GitLabWebhookEvent) {
  const attributes = record(event.payload.object_attributes) ?? {};
  const pipelineId = text(attributes.id) ?? "";
  const status = text(attributes.status) ?? "updated";
  const ref = text(attributes.ref) ?? refName(text(event.payload.ref) ?? "");
  const sha = shortSha(text(attributes.sha) ?? "");
  const url = text(attributes.url);
  return [
    `**GitLab pipeline** - ${projectLink(event.project)}`,
    `${plain(event.actorName)} pipeline ${url ? `[${plain(pipelineId || status)}](${url})` : plain(pipelineId || status)} is ${plain(status)}${ref ? ` on ${code(ref)}` : ""}${sha ? ` at ${code(sha)}` : ""}.`,
  ].join("\n");
}

function formatGenericEvent(event: GitLabWebhookEvent) {
  return [
    `**GitLab event** - ${projectLink(event.project)}`,
    `${plain(event.actorName)} triggered ${plain(event.objectKind)}.`,
  ].join("\n");
}

function gitLabProject(payload: JsonRecord): GitLabOrfChatProject | null {
  const project = record(payload.project) ?? record(payload.repository);
  const projectId = text(project?.id) ?? text(payload.project_id);
  const path = text(project?.path_with_namespace) ?? text(project?.full_path) ?? text(project?.name) ?? text(payload.project_path);
  if (!projectId || !path) return null;
  return {
    id: projectId,
    path,
    url: text(project?.web_url) ?? text(project?.homepage) ?? text(project?.url) ?? "",
  };
}

function gitLabActorName(payload: JsonRecord) {
  const user = record(payload.user);
  return text(payload.user_username) ?? text(payload.user_name) ?? text(user?.username) ?? text(user?.name) ?? "GitLab";
}

function gitLabWebhookEventType(objectKind: string, headerEvent: string | undefined): GitLabWebhookEventType {
  const key = `${objectKind} ${headerEvent ?? ""}`.toLowerCase();
  if (key.includes("tag_push") || key.includes("tag push")) return "tag_push";
  if (key.includes("merge_request") || key.includes("merge request")) return "merge_request";
  if (key.includes("issue")) return "issue";
  if (key.includes("pipeline")) return "pipeline";
  if (key.includes("push")) return "push";
  return "generic";
}

function gitLabWebhookEventKey(input: {
  eventType: GitLabWebhookEventType;
  eventUuid?: string;
  objectKind: string;
  payload: JsonRecord;
  projectId: string;
}) {
  if (input.eventUuid) {
    return `gitlab:${input.projectId}:uuid:${input.eventUuid}`;
  }

  const attributes = record(input.payload.object_attributes) ?? {};
  const lastCommit = record(attributes.last_commit);
  const stableParts = [
    input.projectId,
    input.eventType,
    input.objectKind,
    text(input.payload.ref),
    text(input.payload.before),
    text(input.payload.after),
    text(input.payload.checkout_sha),
    text(attributes.id),
    text(attributes.iid),
    text(attributes.action),
    text(attributes.state),
    text(attributes.status),
    text(attributes.updated_at),
    text(lastCommit?.id),
  ].filter(Boolean);
  return `gitlab:${input.projectId}:${input.eventType}:${digest(stableParts.join("|") || JSON.stringify(input.payload)).slice(0, 32)}`;
}

function header(headers: HeaderMap | undefined, name: string) {
  if (!headers) return undefined;
  const normalized = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== normalized) continue;
    if (Array.isArray(value)) return value[0]?.trim() || undefined;
    if (typeof value === "string") return value.trim() || undefined;
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function records(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  const result: JsonRecord[] = [];
  for (const item of value) {
    const itemRecord = record(item);
    if (itemRecord) {
      result.push(itemRecord);
    }
  }
  return result;
}

function text(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function digest(value: string) {
  return createHash("sha1").update(value).digest("hex");
}

function refName(ref: string) {
  return ref.replace(/^refs\/heads\//, "").replace(/^refs\/tags\//, "");
}

function shortSha(sha: string) {
  return sha ? sha.slice(0, 8) : "";
}

function firstLine(value: string) {
  return value.split(/\r?\n/, 1)[0]?.trim() || value.trim();
}

function projectLink(project: GitLabOrfChatProject) {
  return project.url ? `[${plain(project.path)}](${project.url})` : plain(project.path);
}

function commitLink(sha: string, url: string | undefined) {
  if (!sha) return code("unknown");
  return url ? `[${plain(sha)}](${url})` : code(sha);
}

function code(value: string) {
  return `\`${value.replace(/`/g, "")}\``;
}

function plain(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/([\[\]])/g, "\\$1");
}
