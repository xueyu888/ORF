import { expect, test, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { once } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { eq } from "drizzle-orm";

type RealUser = {
  email: string;
  id: string;
  name: string;
  password: string;
  role: "admin" | "member";
};

type RealFixture = {
  commander: RealUser;
  challengerA: RealUser;
  challengerB: RealUser;
  observer: RealUser;
  runLabel: string;
  teamId: string;
};

type Runtime = {
  apiBaseUrl: string;
  app: { close: () => Promise<void>; server: { address: () => AddressInfo | string | null } };
  closeDb: () => Promise<void>;
  db: typeof import("../../server/db/client").db;
  fakeOry: Server;
  recruitObjectiveChallengers: typeof import("../../server/repositories/orfRepository").recruitObjectiveChallengers;
  schema: typeof import("../../server/db/schema");
};

const realSystemEnabled = process.env.ORF_REAL_E2E === "1";
const runSlug = `real-e2e-${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}-${Math.random().toString(16).slice(2, 6)}`;
const futureDueDate = "2999-12-31";

let fixture: RealFixture;
let runtime: Runtime | null = null;

test.describe("ORF real system multi-user flow", () => {
  test.skip(!realSystemEnabled, "Set ORF_REAL_E2E=1 to run against the real Fastify API and database.");
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test.beforeAll(async () => {
    fixture = createFixture(runSlug);
    const fakeOry = await startFakeOry([fixture.commander, fixture.challengerA, fixture.challengerB, fixture.observer]);
    process.env.ORY_PUBLIC_URL = fakeOry.url;
    process.env.ORF_APP_URL = process.env.ORF_APP_URL ?? "http://127.0.0.1:5173";

    const [{ buildServer }, dbModule, schema, repository] = await Promise.all([
      import("../../server/app"),
      import("../../server/db/client"),
      import("../../server/db/schema"),
      import("../../server/repositories/orfRepository"),
    ]);

    await seedRealFixture(dbModule.db, schema, fixture);
    const app = await buildServer({ logger: false, registerOptionalIntegrations: false });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Real ORF API test server did not expose a TCP address.");
    }

    runtime = {
      apiBaseUrl: `http://127.0.0.1:${address.port}`,
      app,
      closeDb: dbModule.closeDb,
      db: dbModule.db,
      fakeOry: fakeOry.server,
      recruitObjectiveChallengers: repository.recruitObjectiveChallengers,
      schema,
    };
  });

  test.afterAll(async () => {
    if (!runtime) return;
    await runtime.app.close();
    await new Promise<void>((resolve) => runtime?.fakeOry.close(() => resolve()));
    await runtime.closeDb();
  });

  test("commander and two challengers complete two real application rounds with cumulative settlement", async ({ browser }, testInfo) => {
    const commander = await newLoggedInPage(browser, fixture.commander);
    const challengerA = await newLoggedInPage(browser, fixture.challengerA);
    const challengerB = await newLoggedInPage(browser, fixture.challengerB);
    const observer = await newLoggedInPage(browser, fixture.observer);

    try {
      for (const round of [1, 2]) {
        await runApplicationRound(
          {
            commander,
            challengerA,
            challengerB,
            metricTitle: `${fixture.runLabel} 第${round}轮 挑战者校准指标`,
            observer,
            round,
            title: `${fixture.runLabel} 第${round}轮 真实悬赏目标`,
          },
          testInfo,
        );
      }

      await commander.page.goto("/reports");
      await attachRealScreenshot(commander.page, testInfo, "real-system-final-reports");
      await expect(commander.page.getByRole("heading", { name: "成员积分排行榜" })).toBeVisible();
      await expect(leaderboardRow(commander.page, fixture.challengerA.name)).toContainText("60.0");
      await expect(leaderboardRow(commander.page, fixture.challengerB.name)).toContainText("60.0");
      await expect(leaderboardRow(commander.page, fixture.observer.name)).toHaveCount(0);
    } finally {
      await Promise.all([commander.context.close(), challengerA.context.close(), challengerB.context.close(), observer.context.close()]);
    }
  });

  test("database time acceleration closes the challenger reestimate entry in the real UI", async ({ browser }, testInfo) => {
    const commander = await newLoggedInPage(browser, fixture.commander);
    const challenger = await newLoggedInPage(browser, fixture.challengerA);
    const title = `${fixture.runLabel} 时间加速 重估截止目标`;

    try {
      const objectiveId = await createPublishedObjectiveViaUi(commander.page, title, `${fixture.runLabel} 时间加速 指挥官指标`);

      await applyForChallenge(challenger.page, title);
      await approveAllApplications(commander.page, title, 1);

      await challenger.page.goto("/tasks");
      await expect(objectivePanel(challenger.page, title).getByLabel("提出指标")).toBeVisible();
      await attachRealScreenshot(challenger.page, testInfo, "real-system-time-open");

      await expireReestimateWindow(objectiveId);

      await challenger.page.reload();
      await expect(objectivePanel(challenger.page, title)).toContainText("重估中");
      await expect(objectivePanel(challenger.page, title).getByLabel("提出指标")).toHaveCount(0);
      await attachRealScreenshot(challenger.page, testInfo, "real-system-time-expired");
    } finally {
      await Promise.all([commander.context.close(), challenger.context.close()]);
    }
  });

  test("commander launches recruitment and multiple assigned challengers can accept in sequence", async ({ browser }, testInfo) => {
    const commander = await newLoggedInPage(browser, fixture.commander);
    const challengerA = await newLoggedInPage(browser, fixture.challengerA);
    const challengerB = await newLoggedInPage(browser, fixture.challengerB);
    const title = `${fixture.runLabel} 征召令 真实接受目标`;

    try {
      await createPublishedObjectiveViaUi(commander.page, title, `${fixture.runLabel} 征召令 指挥官指标`);
      await commander.page.goto("/tasks");
      await recruitViaUi(commander.page, title, [fixture.challengerA.name, fixture.challengerB.name]);
      await attachRealScreenshot(commander.page, testInfo, "real-system-recruitment-commander-control");

      await acceptRecruitment(challengerA.page, title);
      await acceptRecruitment(challengerB.page, title);

      await challengerA.page.goto("/tasks");
      await challengerB.page.goto("/tasks");
      await expect(objectivePanel(challengerA.page, title)).toContainText("重估中");
      await expect(objectivePanel(challengerB.page, title)).toContainText("重估中");
      await attachRealScreenshot(challengerA.page, testInfo, "real-system-recruitment-accepted-a");
      await attachRealScreenshot(challengerB.page, testInfo, "real-system-recruitment-accepted-b");
    } finally {
      await Promise.all([commander.context.close(), challengerA.context.close(), challengerB.context.close()]);
    }
  });
});

async function runApplicationRound(
  input: {
    commander: LoggedInPage;
    challengerA: LoggedInPage;
    challengerB: LoggedInPage;
    metricTitle: string;
    observer: LoggedInPage;
    round: number;
    title: string;
  },
  testInfo: TestInfo,
) {
  const objectiveId = await createPublishedObjectiveViaUi(input.commander.page, input.title, `${fixture.runLabel} 第${input.round}轮 指挥官指标`);
  await attachRealScreenshot(input.commander.page, testInfo, `real-system-round-${input.round}-published`);

  await applyForChallenge(input.challengerA.page, input.title);
  await applyForChallenge(input.challengerB.page, input.title);

  await approveAllApplications(input.commander.page, input.title, 2);
  await attachRealScreenshot(input.commander.page, testInfo, `real-system-round-${input.round}-approved`);

  await input.challengerA.page.goto("/tasks");
  await proposeMetric(input.challengerA.page, input.title, input.metricTitle, `第${input.round}轮达成率`);

  await input.challengerB.page.goto("/tasks");
  await expect(objectivePanel(input.challengerB.page, input.title)).toContainText(input.metricTitle);

  await input.observer.page.goto("/tasks");
  await expect(input.observer.page.getByText(input.title)).toHaveCount(0);
  await attachRealScreenshot(input.observer.page, testInfo, `real-system-round-${input.round}-observer-isolated`);

  await input.commander.page.goto("/tasks");
  await objectivePanel(input.commander.page, input.title).getByRole("button", { name: "冻结" }).click();
  await expect(objectivePanel(input.commander.page, input.title)).toContainText("已冻结");

  await submitLoot(input.challengerA.page, objectiveId, input.title, input.round);
  await submitPeerReview(input.challengerA.page, objectiveId, input.title);
  await submitPeerReview(input.challengerB.page, objectiveId, input.title);

  await input.commander.page.goto(`/objectives/${objectiveId}/loot`);
  await expect(input.commander.page.getByRole("heading", { name: "验收战利品" })).toBeVisible();
  await expect(input.commander.page.getByText("匿名互评贡献结果")).toBeVisible();
  await input.commander.page.getByLabel("验收说明").fill(`${input.title} 验收通过，按匿名互评结算。`);
  await attachRealScreenshot(input.commander.page, testInfo, `real-system-round-${input.round}-review`);
  await input.commander.page.getByRole("button", { name: "验收并结算" }).click();
  await expect(input.commander.page).toHaveURL(/\/reports$/);

  await input.challengerA.page.goto("/bounties");
  await expect(input.challengerA.page.getByText(input.title)).toHaveCount(0);
  await attachRealScreenshot(input.challengerA.page, testInfo, `real-system-round-${input.round}-bounty-closed`);
}

async function createPublishedObjectiveViaUi(page: Page, title: string, metricTitle: string) {
  await page.goto("/tasks");
  await page.getByRole("button", { name: "新建目标" }).click();
  await page.getByLabel("目标标题").fill(title);
  await page.getByLabel("为什么重要").fill(`${title} 需要真实系统联调验证。`);
  await page.getByLabel("周期").fill("2999 Q4");
  await page.getByLabel("最终截止时间").fill(futureDueDate);
  await page.getByLabel("边界 / 不做什么").fill("只验证 ORF 流程，不改开发代码。");
  await page.getByRole("button", { name: "保存目标" }).click();

  const panel = objectivePanel(page, title);
  await expect(panel).toBeVisible();
  await panel.hover();
  await panel.getByLabel("新增指标").click();
  await page.getByLabel("指标标题").fill(metricTitle);
  await page.getByLabel("衡量指标").fill("真实联调完成率");
  await page.getByRole("button", { name: "保存指标" }).click();
  await expect(panel).toContainText(metricTitle);

  await panel.getByRole("button", { name: "发布" }).click();
  await expect(panel).toContainText("可申请");
  return objectiveIdByTitle(title);
}

async function applyForChallenge(page: Page, title: string) {
  await page.goto("/bounties");
  const row = bountyRow(page, title);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "申请挑战" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "申请挑战" }).click();
  await expect(row.getByRole("button", { name: "已申请" })).toBeDisabled();
}

async function acceptRecruitment(page: Page, title: string) {
  await page.goto("/bounties");
  const row = bountyRow(page, title);
  await expect(row).toContainText("征召令");
  await row.getByRole("button", { name: "接受挑战" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "接受挑战" }).click();
  await expect(page).toHaveURL(/\/bounties$/);
}

async function recruitViaUi(page: Page, title: string, members: string[]) {
  const panel = objectivePanel(page, title);
  await panel.hover();
  await panel.getByRole("button", { name: "征召" }).click();
  await expect(page.getByText("征召挑战者")).toBeVisible();
  for (const member of members) {
    await page.locator("label").filter({ hasText: member }).getByRole("checkbox").check();
  }
  await page.getByRole("button", { name: "发送征召" }).click();
  await expect(page.getByText("征召挑战者")).toHaveCount(0);
  await expect(panel).toContainText("征召中");
}

async function approveAllApplications(page: Page, title: string, count: number) {
  await page.goto("/tasks");
  const panel = objectivePanel(page, title);
  await expect(panel.getByRole("button", { name: "通过" })).toHaveCount(count);
  for (let remaining = count; remaining > 0; remaining -= 1) {
    await panel.getByRole("button", { name: "通过" }).first().click();
    await expect(panel.getByRole("button", { name: "通过" })).toHaveCount(remaining - 1);
  }
  await expect(panel).toContainText("重估中");
}

async function proposeMetric(page: Page, title: string, metricTitle: string, metricName: string) {
  const panel = objectivePanel(page, title);
  await expect(panel).toContainText("重估中");
  await panel.hover();
  await panel.getByLabel("提出指标").click();
  await page.getByLabel("指标标题").fill(metricTitle);
  await page.getByLabel("衡量指标").fill(metricName);
  await page.getByRole("button", { name: "提交指标" }).click();
  await expect(panel).toContainText(metricTitle);
}

async function submitLoot(page: Page, objectiveId: string, title: string, round: number) {
  await page.goto(`/objectives/${objectiveId}/loot`);
  await expect(page.getByRole("heading", { name: "提交战利品" })).toBeVisible();
  await page.getByLabel("完成说明").fill(`${title} 第${round}轮真实系统战利品已完成。`);
  const evidenceFields = page.getByPlaceholder("证据、数据或链接");
  const evidenceCount = await evidenceFields.count();
  for (let index = 0; index < evidenceCount; index += 1) {
    await evidenceFields.nth(index).fill(`real-system-round-${round}-evidence-${index + 1}`);
  }
  await page.getByLabel("自测报告").fill(`第${round}轮真实前后端联调通过。`);
  await page.getByRole("button", { name: "提交" }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(objectivePanel(page, title)).toContainText("待验收");
}

async function submitPeerReview(page: Page, objectiveId: string, title: string) {
  await page.goto(`/objectives/${objectiveId}/loot`);
  await expect(page.getByRole("heading", { name: "提交匿名互评" })).toBeVisible();
  await page.getByLabel(`${fixture.challengerA.name} 贡献比例`).fill("1");
  await page.getByLabel(`${fixture.challengerB.name} 贡献比例`).fill("1");
  await page.getByRole("button", { name: "提交匿名互评" }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(objectivePanel(page, title)).toContainText("待验收");
}

function objectivePanel(page: Page, title: string) {
  return page.locator("section.orf-objective-panel").filter({ hasText: title });
}

function bountyRow(page: Page, title: string) {
  return page.locator(".bounty-list-row").filter({ hasText: title });
}

function leaderboardRow(page: Page, memberName: string) {
  return page.locator(".reports-leaderboard-row").filter({ has: page.getByLabel(memberName) });
}

async function objectiveIdByTitle(title: string) {
  const [objective] = await runtime!.db
    .select({ id: runtime!.schema.objectives.id })
    .from(runtime!.schema.objectives)
    .where(eq(runtime!.schema.objectives.title, title))
    .limit(1);
  if (!objective) throw new Error(`Objective not found: ${title}`);
  return objective.id;
}

async function expireReestimateWindow(objectiveId: string) {
  await runtime!.db
    .update(runtime!.schema.objectives)
    .set({ confirmationDueAt: "2000-01-01T00:00:00.000Z" })
    .where(eq(runtime!.schema.objectives.id, objectiveId));
}

type LoggedInPage = { context: BrowserContext; page: Page };

async function newLoggedInPage(browser: Browser, user: RealUser): Promise<LoggedInPage> {
  const context = await browser.newContext();
  await connectContextToRealApi(context);
  const page = await context.newPage();
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/auth");
  await page.getByPlaceholder("Email").fill(user.email);
  await page.getByPlaceholder("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/(?:bounties|tasks)$/);
  await page.goto("/tasks");
  await expect(page.getByRole("button", { name: "Sign In" })).toHaveCount(0);
  return { context, page };
}

async function connectContextToRealApi(context: BrowserContext) {
  const forward = async (route: Parameters<Parameters<BrowserContext["route"]>[1]>[0]) => {
    const sourceUrl = new URL(route.request().url());
    const targetUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, runtime!.apiBaseUrl);
    await route.continue({ url: targetUrl.toString() });
  };

  await context.route("**/api/**", forward);
  await context.route("**/health", forward);
  await context.route("**/settings/backgrounds/**", forward);
}

async function attachRealScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const safeName = name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
  const path = testInfo.outputPath(`${safeName}.png`);
  await page.screenshot({ fullPage: true, path });
  await testInfo.attach(safeName, { contentType: "image/png", path });
}

function createFixture(slug: string): RealFixture {
  const runLabel = `真实联调 ${slug}`;
  const user = (kind: string, name: string, role: RealUser["role"]): RealUser => ({
    email: `${slug}-${kind}@orf.local`,
    id: `user-${slug}-${kind}`,
    name: `${runLabel} ${name}`,
    password: "real-e2e-password",
    role,
  });

  return {
    commander: user("commander", "指挥官", "admin"),
    challengerA: user("challenger-a", "挑战者A", "member"),
    challengerB: user("challenger-b", "挑战者B", "member"),
    observer: user("observer", "观察成员", "member"),
    runLabel,
    teamId: `team-${slug}`,
  };
}

async function seedRealFixture(db: Runtime["db"], schema: Runtime["schema"], input: RealFixture) {
  const users = [input.commander, input.challengerA, input.challengerB, input.observer];
  await db.insert(schema.teams).values({ id: input.teamId, name: `${input.runLabel} 团队`, createdAt: "2026-05-18" });
  await db.insert(schema.users).values(
    users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      status: "active" as const,
      createdAt: "2026-05-18",
      lastLoginAt: null,
    })),
  );
  await db.insert(schema.teamMembers).values(users.map((user) => ({ teamId: input.teamId, userId: user.id, role: user.role })));
  await db.insert(schema.rolePermissions).values({
    teamId: input.teamId,
    role: "member",
    stage: "global",
    resource: "permissionKeys",
    actions: [],
  });
}

async function startFakeOry(users: RealUser[]) {
  const usersById = new Map(users.map((user) => [user.id, user]));
  const usersByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
  let publicUrl = "";

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", publicUrl || "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/self-service/login/api") {
      sendJson(response, 200, { ui: { action: `${publicUrl}/self-service/login` } });
      return;
    }

    if (request.method === "POST" && url.pathname === "/self-service/login") {
      const body = await readJsonBody(request);
      const identifier = typeof body.identifier === "string" ? body.identifier.toLowerCase() : "";
      const user = usersByEmail.get(identifier);
      if (!user) {
        sendJson(response, 401, { error: { message: "Invalid identifier" } });
        return;
      }

      sendJson(response, 200, authPayload(user));
      return;
    }

    if (request.method === "GET" && url.pathname === "/sessions/whoami") {
      const token = headerValue(request.headers["x-session-token"]);
      const user = token ? usersById.get(token) : undefined;
      if (!user) {
        sendJson(response, 401, { active: false });
        return;
      }

      sendJson(response, 200, { active: true, identity: identityPayload(user) });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fake Ory server did not expose a TCP address.");
  }
  publicUrl = `http://127.0.0.1:${address.port}`;
  return { server, url: publicUrl };
}

function identityPayload(user: RealUser) {
  return {
    id: user.id,
    traits: {
      email: user.email,
      name: user.name,
    },
  };
}

function authPayload(user: RealUser) {
  return {
    session_token: user.id,
    session: {
      active: true,
      identity: identityPayload(user),
    },
  };
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}
