import type { Page, Route } from "@playwright/test";
import { initialOrfState } from "../../src/data/initialOrfState";
import type { BountyHallData, BountyHallItem, TaskManagementData, VisualBackgroundScene } from "../../src/state/apiClient";
import type { CommentMessage, CommentStatus, CommentTargetType, CommentThread, UncertaintyLevel } from "../../src/types/orf";

const difficultyRanks: Record<UncertaintyLevel, number> = {
  入门: 1,
  进阶: 2,
  破局: 3,
  渡劫: 4,
  飞升: 5,
};

const explorerUser = initialOrfState.users[0]!;

export async function installUiExplorerScenario(page: Page, safetyProfile: string) {
  if (safetyProfile === "auth") {
    await installAuthPageScenario(page);
    return;
  }

  await installAuthenticatedAppScenario(page);
}

export async function installAuthenticatedAppScenario(page: Page) {
  let comments = seedComments();
  let commentSequence = 1;

  await page.addInitScript(() => window.localStorage.clear());
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method().toUpperCase();

    if (url.pathname === "/api/auth/session") {
      await route.fulfill({ json: { authenticated: true, user: explorerUser } });
      return;
    }

    if (url.pathname === "/api/auth/login" || url.pathname === "/api/auth/registration") {
      await route.fulfill({ json: { authenticated: true, user: explorerUser } });
      return;
    }

    if (url.pathname === "/api/auth/logout") {
      await route.fulfill({ json: { ok: true } });
      return;
    }

    if (url.pathname === "/api/tasks-page" || url.pathname === "/api/my-challenges") {
      await route.fulfill({ json: taskManagementData(comments) });
      return;
    }

    if (url.pathname === "/api/bounties") {
      await route.fulfill({ json: bountyHallData() });
      return;
    }

    if (url.pathname === "/api/comments") {
      if (method === "POST") {
        const body = safePostJson<CreateCommentRequest>(route);
        const value = body.body?.trim() ?? "";
        if (!value) {
          await route.fulfill({ status: 400, json: { error: "Comment body is required" } });
          return;
        }

        const now = nowIso();
        const message: CommentMessage = {
          id: `cmsg-explorer-${commentSequence++}`,
          author: explorerUser.name,
          body: value,
          createdAt: now,
          attachments: [],
          parentMessageId: body.parentMessageId,
          replyToMessageId: body.replyToMessageId,
          replyToAuthor: body.replyToAuthor,
        };
        const existing = comments.find(
          (thread) => thread.targetType === body.targetType && thread.targetId === body.targetId && thread.status === "open",
        );
        const commentThread: CommentThread = existing
          ? {
              ...existing,
              targetTitle: body.targetTitle,
              updatedAt: now,
              messages: [...existing.messages, message],
            }
          : {
              id: `cthread-explorer-${commentSequence++}`,
              targetType: body.targetType,
              targetId: body.targetId,
              targetTitle: body.targetTitle,
              status: "open",
              createdBy: explorerUser.id,
              createdAt: now,
              updatedAt: now,
              messages: [message],
            };
        comments = existing
          ? comments.map((thread) => (thread.id === existing.id ? commentThread : thread))
          : [commentThread, ...comments];
        await route.fulfill({ json: { ok: true, commentThread } });
        return;
      }

      await route.fulfill({ json: { ok: true } });
      return;
    }

    const statusMatch = url.pathname.match(/^\/api\/comments\/([^/]+)\/status$/);
    if (statusMatch && method === "PATCH") {
      const body = safePostJson<{ status?: CommentStatus }>(route);
      const threadId = decodeURIComponent(statusMatch[1]!);
      const status: CommentStatus = body.status === "resolved" ? "resolved" : "open";
      const commentThread = comments.find((thread) => thread.id === threadId) ?? null;
      if (!commentThread) {
        await route.fulfill({ status: 404, json: { error: "Comment thread not found" } });
        return;
      }

      const nextThread = { ...commentThread, status, updatedAt: nowIso() };
      comments = comments.map((thread) => (thread.id === threadId ? nextThread : thread));
      await route.fulfill({ json: { ok: true, commentThread: nextThread } });
      return;
    }

    const messageMatch = url.pathname.match(/^\/api\/comments\/([^/]+)\/messages\/([^/]+)$/);
    if (messageMatch) {
      const threadId = decodeURIComponent(messageMatch[1]!);
      const messageId = decodeURIComponent(messageMatch[2]!);
      const commentThread = comments.find((thread) => thread.id === threadId) ?? null;
      if (!commentThread) {
        await route.fulfill({ status: 404, json: { error: "Comment thread not found" } });
        return;
      }

      if (method === "PATCH") {
        const body = safePostJson<{ body?: string }>(route);
        const value = body.body?.trim() ?? "";
        if (!value) {
          await route.fulfill({ status: 400, json: { error: "Comment body is required" } });
          return;
        }

        const nextThread = {
          ...commentThread,
          updatedAt: nowIso(),
          messages: commentThread.messages.map((message) => (message.id === messageId ? { ...message, body: value } : message)),
        };
        comments = comments.map((thread) => (thread.id === threadId ? nextThread : thread));
        await route.fulfill({ json: { ok: true, commentThread: nextThread } });
        return;
      }

      if (method === "DELETE") {
        const nextMessages = commentThread.messages
          .filter((message) => message.id !== messageId && message.parentMessageId !== messageId)
          .map((message) =>
            message.replyToMessageId === messageId ? { ...message, replyToMessageId: undefined, replyToAuthor: undefined } : message,
          );
        if (nextMessages.length === 0) {
          comments = comments.filter((thread) => thread.id !== threadId);
          await route.fulfill({ json: { ok: true, commentThread: null } });
          return;
        }

        const nextThread = { ...commentThread, updatedAt: nowIso(), messages: nextMessages };
        comments = comments.map((thread) => (thread.id === threadId ? nextThread : thread));
        await route.fulfill({ json: { ok: true, commentThread: nextThread } });
        return;
      }
    }

    if (url.pathname === "/api/permissions") {
      await route.fulfill({ json: { permissionRules: initialOrfState.permissionRules } });
      return;
    }

    if (/^\/api\/permissions\/[^/]+$/.test(url.pathname) && method === "PUT") {
      await route.fulfill({ json: { permissionRules: initialOrfState.permissionRules } });
      return;
    }

    if (url.pathname === "/api/users" || url.pathname.startsWith("/api/users/")) {
      await route.fulfill({ json: { users: initialOrfState.users } });
      return;
    }

    if (url.pathname === "/api/registration-requests" || url.pathname.startsWith("/api/registration-requests/")) {
      await route.fulfill({ json: { users: [] } });
      return;
    }

    if (url.pathname === "/api/settings/visual/backgrounds" && method === "GET") {
      const scene = sceneFromUrl(url);
      await route.fulfill({ json: visualBackgroundsResponse(scene) });
      return;
    }

    if (url.pathname === "/api/settings/visual/background-config" && method === "PUT") {
      const body = safePostJson<{ scene?: VisualBackgroundScene; config?: unknown }>(route);
      await route.fulfill({
        json: {
          code: 0,
          message: "ok",
          data: { scene: body.scene ?? "sidebar_background", config: body.config ?? visualBackgroundConfig() },
        },
      });
      return;
    }

    if (
      url.pathname.startsWith("/api/tasks") ||
      url.pathname.startsWith("/api/objectives") ||
      url.pathname.startsWith("/api/results") ||
      url.pathname.startsWith("/api/feedback")
    ) {
      await route.fulfill({ json: { ok: true } });
      return;
    }

    await route.fulfill({ status: 404, json: { error: `UI explorer test stub: API route not modeled: ${method} ${url.pathname}` } });
  });
}

async function installAuthPageScenario(page: Page) {
  await page.addInitScript(() => window.localStorage.clear());
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/api/auth/session") {
      await route.fulfill({ json: { authenticated: false, user: null } });
      return;
    }

    if (url.pathname === "/api/settings/visual/backgrounds") {
      await route.fulfill({ json: visualBackgroundsResponse("login_background") });
      return;
    }

    if (url.pathname === "/api/tasks-page") {
      await route.fulfill({ json: taskManagementData([]) });
      return;
    }

    if (url.pathname === "/api/permissions") {
      await route.fulfill({ json: { permissionRules: initialOrfState.permissionRules } });
      return;
    }

    if (url.pathname === "/api/users") {
      await route.fulfill({ json: { users: initialOrfState.users } });
      return;
    }

    if (url.pathname === "/api/auth/login") {
      await route.fulfill({ status: 401, json: { error: "Invalid email or password" } });
      return;
    }

    if (url.pathname === "/api/auth/registration") {
      await route.fulfill({ status: 400, json: { error: "Registration failed" } });
      return;
    }

    await route.fulfill({ status: 404, json: { error: `UI explorer test stub: API route not modeled: ${request.method()} ${url.pathname}` } });
  });
}

type CreateCommentRequest = {
  targetType: CommentTargetType;
  targetId: string;
  targetTitle: string;
  body: string;
  parentMessageId?: string;
  replyToMessageId?: string;
  replyToAuthor?: string;
};

function taskManagementData(comments: CommentThread[]): TaskManagementData {
  return {
    objectives: initialOrfState.objectives,
    results: initialOrfState.results,
    tasks: initialOrfState.tasks,
    evidence: initialOrfState.evidence,
    feedback: initialOrfState.feedback,
    comments,
    objectiveLoot: initialOrfState.objectiveLoot,
    objectiveContributionReviews: initialOrfState.objectiveContributionReviews,
    pointLedger: initialOrfState.pointLedger,
    permissionRules: initialOrfState.permissionRules,
  };
}

function bountyHallData(): BountyHallData {
  return {
    recruitmentItems: [bountyHallItem("obj-bounty-agent-retry", true)],
    availableItems: [bountyHallItem("obj-bounty-cost-routing")],
    objectiveOptions: [
      initialOrfState.objectives.find((item) => item.id === "obj-bounty-agent-retry"),
      initialOrfState.objectives.find((item) => item.id === "obj-bounty-cost-routing"),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    contribution: { points: 0 },
  };
}

function bountyHallItem(objectiveId: string, isRecruitment = false): BountyHallItem {
  const objective = initialOrfState.objectives.find((item) => item.id === objectiveId);
  const results = initialOrfState.results.filter((item) => item.objectiveId === objectiveId);
  const result = results[0];

  if (!objective || !result) {
    throw new Error(`Missing bounty fixture for ${objectiveId}`);
  }

  return {
    uncertaintyPoints: results.reduce((sum, item) => sum + item.uncertaintyScore, 0),
    deadline: objective.finalDueAt,
    definer: result.definer ?? "",
    difficultyRank: Math.max(...results.map((item) => difficultyRanks[item.uncertaintyLevel ?? "进阶"])),
    hasCurrentApplication: false,
    isRecruitment,
    objective,
    result,
    results,
    source: result.source ?? "managerDefined",
  };
}

function seedComments(): CommentThread[] {
  return [
    {
      id: "cthread-explorer-rag-recall",
      targetType: "result",
      targetId: "res-rag-recall",
      targetTitle: "RAG 检索 Recall@5 达到 85%",
      status: "open",
      createdBy: explorerUser.id,
      createdAt: "2026-05-19T00:00:00.000Z",
      updatedAt: "2026-05-19T00:03:00.000Z",
      messages: [
        {
          id: "cmsg-explorer-root",
          author: explorerUser.name,
          body: "随机测试基线评论",
          createdAt: "2026-05-19T00:00:00.000Z",
          attachments: [],
        },
        {
          id: "cmsg-explorer-reply",
          author: "Mia Zhang",
          body: "随机测试基线回复",
          createdAt: "2026-05-19T00:03:00.000Z",
          attachments: [],
          parentMessageId: "cmsg-explorer-root",
          replyToMessageId: "cmsg-explorer-root",
          replyToAuthor: explorerUser.name,
        },
      ],
    },
  ];
}

function safePostJson<T>(route: Route): T {
  try {
    return route.request().postDataJSON() as T;
  } catch {
    return {} as T;
  }
}

function visualBackgroundsResponse(scene: VisualBackgroundScene) {
  return {
    code: 0,
    message: "ok",
    data: {
      scene,
      config: visualBackgroundConfig(),
      list: [],
    },
  };
}

function visualBackgroundConfig() {
  return {
    mode: "fixed",
    fixedBackgroundId: null,
    switchTrigger: "on_open",
    switchOrder: "random",
    switchIntervalMinutes: 10,
  };
}

function sceneFromUrl(url: URL): VisualBackgroundScene {
  return url.searchParams.get("scene") === "login_background" ? "login_background" : "sidebar_background";
}

function nowIso() {
  return new Date().toISOString();
}
