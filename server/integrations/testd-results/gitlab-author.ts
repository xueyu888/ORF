import type { ResultConfig } from "./model";

export async function readGitlabCommitAuthorEmail(
  config: Pick<ResultConfig, "gitlabUrl" | "gitlabProjectId" | "gitlabReadToken">,
  projectId: number,
  sha: string,
  request: typeof fetch = fetch,
): Promise<string> {
  if (projectId !== config.gitlabProjectId || !/^[0-9a-f]{40}$/.test(sha)) throw new Error("TestD MR 源提交不属于已配置 GitLab 项目");
  const url = new URL(`api/v4/projects/${projectId}/repository/commits/${sha}`, config.gitlabUrl);
  const response = await request(url, { method: "GET", redirect: "error", signal: AbortSignal.timeout(10_000),
    headers: { "PRIVATE-TOKEN": config.gitlabReadToken } });
  if (!response.ok) throw new Error(`GitLab 提交查询失败：HTTP ${response.status}`);
  const commit: unknown = await response.json();
  if (!commit || typeof commit !== "object") throw new Error("GitLab 提交响应无效");
  const { id, author_email: authorEmail } = commit as Record<string, unknown>;
  if (id !== sha || typeof authorEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorEmail)) {
    throw new Error("GitLab 提交 SHA 或作者邮箱无效");
  }
  return authorEmail.trim().toLowerCase();
}
