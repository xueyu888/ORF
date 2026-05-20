import { expect, test as base, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { once } from "node:events";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export { expect };

export const realSystemEnabled = process.env.ORF_REAL_E2E === "1";
const cleanupRealData = process.env.ORF_REAL_E2E_CLEANUP === "1";

export type RealUser = {
  email: string;
  id: string;
  name: string;
  password: string;
  role: "admin" | "member";
  status?: "active" | "disabled" | "pending";
};

export type RealFixture = {
  challengerA: RealUser;
  challengerB: RealUser;
  challengerC: RealUser;
  commander: RealUser;
  disabledMember: RealUser;
  member1: RealUser;
  member2: RealUser;
  member3: RealUser;
  member4: RealUser;
  member5: RealUser;
  member6: RealUser;
  observer: RealUser;
  pendingMember: RealUser;
  rejectedApplicant: RealUser;
  reluctantMember: RealUser;
  runLabel: string;
  runSlug: string;
  teamId: string;
};

type Runtime = {
  apiBaseUrl: string;
  app: { close: () => Promise<void>; server: { address: () => AddressInfo | string | null } };
  db: typeof import("../../../server/db/client").db;
  fakeOry: Server;
  repository: typeof import("../../../server/repositories/orfRepository");
  schema: typeof import("../../../server/db/schema");
};

export type LoggedInPage = { context: BrowserContext; page: Page };

export class RealSystemHarness {
  readonly fixture: RealFixture;
  private runtime: Runtime | null = null;

  constructor(readonly workerIndex: number) {
    this.fixture = createFixture(workerIndex);
  }

  get db() {
    return this.requireRuntime().db;
  }

  get repository() {
    return this.requireRuntime().repository;
  }

  get schema() {
    return this.requireRuntime().schema;
  }

  get apiBaseUrl() {
    return this.requireRuntime().apiBaseUrl;
  }

  async taskData() {
    return this.repository.getTaskManagementData({ scope: { id: this.fixture.teamId } });
  }

  async setup() {
    const fakeOry = await startFakeOry(Object.values(this.fixture).filter(isRealUser));
    process.env.ORY_PUBLIC_URL = fakeOry.url;
    process.env.ORF_APP_URL = process.env.ORF_APP_URL ?? "http://127.0.0.1:5173";

    const [{ buildServer }, dbModule, schema, repository] = await Promise.all([
      import("../../../server/app"),
      import("../../../server/db/client"),
      import("../../../server/db/schema"),
      import("../../../server/repositories/orfRepository"),
    ]);

    await seedRealFixture(dbModule.db, schema, this.fixture);
    const app = await buildServer({ logger: false, registerOptionalIntegrations: false });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Real ORF API test server did not expose a TCP address.");
    }

    this.runtime = {
      apiBaseUrl: `http://127.0.0.1:${address.port}`,
      app,
      db: dbModule.db,
      fakeOry: fakeOry.server,
      repository,
      schema,
    };
  }

  async teardown() {
    if (!this.runtime) return;
    if (cleanupRealData) {
      await cleanupFixtureData(this.runtime.db, this.runtime.schema, this.fixture);
    }
    await this.runtime.app.close();
    await new Promise<void>((resolve) => this.runtime?.fakeOry.close(() => resolve()));
    this.runtime = null;
  }

  async newLoggedInPage(browser: Browser, user: RealUser): Promise<LoggedInPage> {
    const context = await browser.newContext();
    await this.connectContextToRealApi(context);
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

  async connectContextToRealApi(context: BrowserContext) {
    const forward = async (route: Parameters<Parameters<BrowserContext["route"]>[1]>[0]) => {
      const sourceUrl = new URL(route.request().url());
      const targetUrl = new URL(`${sourceUrl.pathname}${sourceUrl.search}`, this.apiBaseUrl);
      await route.continue({ url: targetUrl.toString() });
    };

    await context.route("**/api/**", forward);
    await context.route("**/health", forward);
    await context.route("**/settings/backgrounds/**", forward);
  }

  async apiAs<T = unknown>(user: RealUser, path: string, init?: RequestInit): Promise<{ body: T; status: number }> {
    const headers = new Headers(init?.headers);
    headers.set("cookie", `orf_ory_session=${encodeURIComponent(user.id)}`);
    if (init?.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(new URL(path, this.apiBaseUrl), {
      ...init,
      headers,
    });
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? ((await response.json()) as T)
      : ((await response.text()) as T);
    return { body, status: response.status };
  }

  async attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
    const safeName = name.replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
    const path = testInfo.outputPath(`${safeName}.png`);
    await page.screenshot({ fullPage: true, path });
    await testInfo.attach(safeName, { contentType: "image/png", path });
  }

  async objectiveIdByTitle(title: string) {
    const [objective] = await this.db
      .select({ id: this.schema.objectives.id })
      .from(this.schema.objectives)
      .where(eq(this.schema.objectives.title, title))
      .limit(1);
    if (!objective) throw new Error(`Objective not found: ${title}`);
    return objective.id;
  }

  async resultIdByTitle(title: string) {
    const [result] = await this.db
      .select({ id: this.schema.results.id })
      .from(this.schema.results)
      .where(eq(this.schema.results.title, title))
      .limit(1);
    if (!result) throw new Error(`Result not found: ${title}`);
    return result.id;
  }

  private requireRuntime() {
    if (!this.runtime) throw new Error("Real system harness is not initialized.");
    return this.runtime;
  }
}

export const test = base.extend<{ real: RealSystemHarness }>({
  real: async ({}, use, testInfo) => {
    const harness = new RealSystemHarness(testInfo.workerIndex);
    await harness.setup();
    await use(harness);
    await harness.teardown();
  },
});

function createFixture(workerIndex: number): RealFixture {
  const runSlug = `real-e2e-${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}-w${workerIndex}-${Math.random().toString(16).slice(2, 6)}`;
  const runLabel = `真实联调 ${runSlug}`;
  const user = (kind: string, name: string, role: RealUser["role"], status: RealUser["status"] = "active"): RealUser => ({
    email: `${runSlug}-${kind}@orf.local`,
    id: `user-${runSlug}-${kind}`,
    name: `${runLabel} ${name}`,
    password: "real-e2e-password",
    role,
    status,
  });

  return {
    challengerA: user("challenger-a", "挑战者A", "member"),
    challengerB: user("challenger-b", "挑战者B", "member"),
    challengerC: user("challenger-c", "挑战者C", "member"),
    commander: user("commander", "指挥官", "admin"),
    disabledMember: user("disabled", "禁用成员", "member", "disabled"),
    member1: user("member-1", "成员1", "member"),
    member2: user("member-2", "成员2", "member"),
    member3: user("member-3", "成员3", "member"),
    member4: user("member-4", "成员4", "member"),
    member5: user("member-5", "成员5", "member"),
    member6: user("member-6", "成员6", "member"),
    observer: user("observer", "观察成员", "member"),
    pendingMember: user("pending", "待审核成员", "member", "pending"),
    rejectedApplicant: user("rejected-applicant", "被拒申请人", "member"),
    reluctantMember: user("reluctant", "拒绝征召人", "member"),
    runLabel,
    runSlug,
    teamId: `team-${runSlug}`,
  };
}

async function seedRealFixture(db: Runtime["db"], schema: Runtime["schema"], input: RealFixture) {
  const users = Object.values(input).filter(isRealUser);
  await db.insert(schema.teams).values({ id: input.teamId, name: `${input.runLabel} 团队`, createdAt: "2026-05-18" });
  await db.insert(schema.users).values(
    users.map((user) => ({
      id: user.id,
      name: user.name,
	      email: user.email,
	      status: user.status ?? "active",
	      createdAt: "2026-05-18",
	      lastOnlineAt: null,
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

async function cleanupFixtureData(db: Runtime["db"], schema: Runtime["schema"], input: RealFixture) {
  const users = Object.values(input).filter(isRealUser);
  await db.delete(schema.teams).where(eq(schema.teams.id, input.teamId));
  await db.delete(schema.users).where(inArray(schema.users.id, users.map((user) => user.id)));
}

function isRealUser(value: unknown): value is RealUser {
  return Boolean(value && typeof value === "object" && "email" in value && "id" in value && "password" in value);
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
