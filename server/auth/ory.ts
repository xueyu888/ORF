import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { teamMembers, users } from "../db/schema";
import { env } from "../env";
import { getDefaultRuntimeScope, runtimeScopeStorageId } from "../repositories/runtimeScope";
import { avatarUrlForUser } from "../users/avatar/avatarRepository";

export type AuthenticatedOrfUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  status: "pending" | "active" | "rejected" | "disabled";
  lastOnlineAt: string | null;
  avatarUrl?: string | null;
};

type OryIdentity = {
  id: string;
  schema_id?: string;
  state?: string;
  metadata_public?: unknown;
  metadata_admin?: unknown;
  traits?: Record<string, unknown>;
};

type OryIdentityCredentialsUpdate = {
  password?: {
    config: {
      password: string;
    };
  };
};

type OrySession = {
  active?: boolean;
  identity?: OryIdentity;
};

type OryFlow = {
  ui?: {
    action?: string;
  };
};

type OryUiMessage = {
  text?: string;
};

type OryUiNode = {
  attributes?: {
    name?: string;
  };
  messages?: OryUiMessage[];
};

type OryErrorPayload = {
  ui?: {
    messages?: OryUiMessage[];
    nodes?: OryUiNode[];
  };
  error?: {
    message?: string;
  };
};

type OryAuthResponse = {
  session?: OrySession;
  session_token?: string;
};

export const ORF_SESSION_COOKIE = "orf_ory_session";
const ORY_REQUEST_TIMEOUT_MS = 2000;

export class OryAuthFlowError extends Error {
  status: number;
  field?: "email" | "password";

  constructor(message: string, status: number, field?: "email" | "password") {
    super(message);
    this.name = "OryAuthFlowError";
    this.status = status;
    this.field = field;
  }
}

export class OrfUserScopeBindingError extends Error {
  constructor() {
    super("User is not in default team");
    this.name = "OrfUserScopeBindingError";
  }
}

const trimSlash = (value: string) => value.replace(/\/+$/, "");

function oryPublicUrl(path: string) {
  return new URL(path, `${trimSlash(process.env.ORY_PUBLIC_URL ?? env.ORY_PUBLIC_URL)}/`).toString();
}

function oryPublicFlowActionUrl(action: string) {
  const configuredBaseUrl = `${trimSlash(process.env.ORY_PUBLIC_URL ?? env.ORY_PUBLIC_URL)}/`;
  const actionUrl = new URL(action, configuredBaseUrl);
  return new URL(`${actionUrl.pathname}${actionUrl.search}${actionUrl.hash}`, configuredBaseUrl).toString();
}

function oryAdminBaseUrl() {
  const raw = Object.prototype.hasOwnProperty.call(process.env, "ORY_ADMIN_URL") ? process.env.ORY_ADMIN_URL : env.ORY_ADMIN_URL;
  const value = raw?.trim();
  return value || null;
}

function oryAdminUrl(path: string) {
  const baseUrl = oryAdminBaseUrl();
  if (!baseUrl) {
    throw Object.assign(new Error("Ory admin URL is not configured"), { statusCode: 503 });
  }

  return new URL(path, `${trimSlash(baseUrl)}/`).toString();
}

async function fetchOry(input: string, init: RequestInit = {}) {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(ORY_REQUEST_TIMEOUT_MS),
  });
}

async function readOryIdentity(identityId: string): Promise<OryIdentity> {
  const response = await fetchOry(oryAdminUrl(`/admin/identities/${encodeURIComponent(identityId)}`), {
    headers: {
      accept: "application/json",
    },
  });

  if (response.status === 404) {
    throw Object.assign(new Error("Ory identity not found"), { statusCode: 404 });
  }

  if (!response.ok) {
    throw Object.assign(new Error(`Ory identity read failed with ${response.status}`), { statusCode: 503 });
  }

  return response.json() as Promise<OryIdentity>;
}

async function updateOryIdentity(
  identity: OryIdentity,
  input: { conflictMessage?: string; credentials?: OryIdentityCredentialsUpdate; traits?: Record<string, unknown> },
) {
  const updateResponse = await fetchOry(oryAdminUrl(`/admin/identities/${encodeURIComponent(identity.id)}`), {
    method: "PUT",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      credentials: input.credentials,
      metadata_admin: identity.metadata_admin ?? null,
      metadata_public: identity.metadata_public ?? null,
      schema_id: identity.schema_id ?? "default",
      state: identity.state ?? "active",
      traits: input.traits ?? identity.traits ?? {},
    }),
  });

  if (updateResponse.status === 409) {
    throw Object.assign(new Error(input.conflictMessage ?? "Ory identity update conflict"), { statusCode: 409 });
  }

  if (!updateResponse.ok) {
    throw Object.assign(new Error(`Ory identity update failed with ${updateResponse.status}`), { statusCode: 503 });
  }
}

function cookieHeader(cookie: string | undefined): Record<string, string> {
  return cookie ? { cookie } : {};
}

function sessionTokenHeader(sessionToken: string | undefined): Record<string, string> {
  return sessionToken ? { "x-session-token": sessionToken } : {};
}

function readCookie(cookie: string | undefined, name: string) {
  if (!cookie) {
    return undefined;
  }

  const item = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  if (!item) {
    return undefined;
  }

  return decodeURIComponent(item.slice(name.length + 1));
}

function authHeaders(cookie: string | undefined) {
  const sessionToken = readCookie(cookie, ORF_SESSION_COOKIE);
  return {
    ...cookieHeader(sessionToken ? undefined : cookie),
    ...sessionTokenHeader(sessionToken),
  };
}

function textTrait(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function identityEmail(identity: OryIdentity): string | undefined {
  return textTrait(identity.traits?.email)?.toLowerCase();
}

function identityName(identity: OryIdentity, email: string): string {
  const name = identity.traits?.name;
  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }

  if (name && typeof name === "object") {
    const parts = [textTrait((name as Record<string, unknown>).first), textTrait((name as Record<string, unknown>).last)].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(" ");
    }
  }

  return textTrait(identity.traits?.username) ?? email.split("@")[0] ?? "User";
}

async function nextUserId() {
  while (true) {
    const candidate = randomUUID();
    const [existing] = await db.select({ id: users.id }).from(users).where(sql`${users.id} = ${candidate}`).limit(1);
    if (!existing) {
      return candidate;
    }
  }
}

async function existingMembershipRole(userId: string): Promise<AuthenticatedOrfUser["role"] | null> {
  const existingMemberships = await db.select({ role: teamMembers.role }).from(teamMembers).where(sql`${teamMembers.userId} = ${userId}`);
  if (existingMemberships.length > 0) {
    return existingMemberships.some((membership) => membership.role === "admin") ? "admin" : "member";
  }

  return null;
}

async function createDefaultScopeMembership(userId: string): Promise<AuthenticatedOrfUser["role"]> {
  const scope = await getDefaultRuntimeScope();
  if (!scope) {
    return "member";
  }

  await db.insert(teamMembers).values({ teamId: runtimeScopeStorageId(scope), userId, role: "member" }).onConflictDoNothing();
  return "member";
}

async function upsertOrfUser(
  identity: OryIdentity,
  options: { newUserStatus?: AuthenticatedOrfUser["status"]; recordOnline?: boolean } = {},
): Promise<AuthenticatedOrfUser> {
  const email = identityEmail(identity);
  if (!email) {
    throw new Error("Ory identity does not include traits.email");
  }

  const identityDisplayName = identityName(identity, email);
  const [identityUser] = await db.select().from(users).where(sql`${users.oryIdentityId} = ${identity.id}`).limit(1);
  const [emailUser] = identityUser ? [undefined] : await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  const existing = identityUser ?? emailUser;
  const lastOnlineAt = options.recordOnline ? new Date().toISOString() : undefined;

  if (existing) {
    if (existing.oryIdentityId && existing.oryIdentityId !== identity.id) {
      throw new Error("Ory identity email is already bound to another ORF user");
    }

    const role = await existingMembershipRole(existing.id);
    if (!role) {
      throw new OrfUserScopeBindingError();
    }

    const update: { lastOnlineAt?: string; oryIdentityId?: string } = {};
    if (lastOnlineAt) {
      update.lastOnlineAt = lastOnlineAt;
    }
    if (!existing.oryIdentityId) {
      update.oryIdentityId = identity.id;
    }
    if (Object.keys(update).length > 0) {
      await db.update(users).set(update).where(sql`${users.id} = ${existing.id}`);
    }

    return {
      id: existing.id,
      name: existing.name,
      email: existing.email ?? email,
      role,
      status: existing.status ?? "active",
      lastOnlineAt: lastOnlineAt ?? existing.lastOnlineAt,
      avatarUrl: avatarUrlForUser(existing),
    };
  }

  const id = await nextUserId();
  const createdLastOnlineAt = lastOnlineAt ?? null;
  await db.insert(users).values({
    id,
    name: identityDisplayName,
    email,
    oryIdentityId: identity.id,
    status: options.newUserStatus ?? "pending",
    createdAt: new Date().toISOString().slice(0, 10),
    lastOnlineAt: createdLastOnlineAt,
  });

  const role = await createDefaultScopeMembership(id);
  return { id, name: identityDisplayName, email, role, status: options.newUserStatus ?? "pending", lastOnlineAt: createdLastOnlineAt, avatarUrl: null };
}

export async function getAuthenticatedOrfUser(cookie: string | undefined): Promise<AuthenticatedOrfUser | null> {
  if (!cookie) {
    return null;
  }

  const response = await fetchOry(oryPublicUrl("/sessions/whoami"), {
    headers: {
      accept: "application/json",
      ...authHeaders(cookie),
    },
  });

  if (response.status === 401 || response.status === 403) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Ory whoami failed with ${response.status}`);
  }

  const session = (await response.json()) as OrySession;
  if (session.active === false || !session.identity) {
    return null;
  }

  return upsertOrfUser(session.identity);
}

async function createApiFlow(flowType: "login" | "registration"): Promise<OryFlow> {
  const response = await fetchOry(oryPublicUrl(`/self-service/${flowType}/api`), {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Ory ${flowType} flow failed with ${response.status}`);
  }

  return response.json() as Promise<OryFlow>;
}

async function readOryErrorPayload(response: Response): Promise<OryErrorPayload | null> {
  try {
    return await response.json() as OryErrorPayload;
  } catch {
    return null;
  }
}

function oryMessages(payload: OryErrorPayload | null) {
  const messages: Array<{ field?: string; text: string }> = [];

  for (const message of payload?.ui?.messages ?? []) {
    if (message.text) {
      messages.push({ text: message.text });
    }
  }

  for (const node of payload?.ui?.nodes ?? []) {
    for (const message of node.messages ?? []) {
      if (message.text) {
        messages.push({ field: node.attributes?.name, text: message.text });
      }
    }
  }

  if (payload?.error?.message) {
    messages.push({ text: payload.error.message });
  }

  return messages;
}

function registrationErrorMessage(payload: OryErrorPayload | null) {
  const messages = oryMessages(payload);
  const passwordError = messages.find((message) => message.field === "password" || /password/i.test(message.text));
  if (passwordError) {
    return { field: "password" as const, message: "密码至少 8 位" };
  }

  const existingEmailError = messages.find((message) => /same identifier|already exists|exists already|account.*exists/i.test(message.text));
  if (existingEmailError) {
    return { field: "email" as const, message: "邮箱已存在" };
  }

  const emailFormatError = messages.find((message) => message.field === "traits.email" || /e-?mail|email|identifier/i.test(message.text));
  if (emailFormatError) {
    return { field: "email" as const, message: "邮箱格式不正确" };
  }

  return { message: "注册失败，请检查邮箱和密码" };
}

async function submitApiFlow(flowType: "login" | "registration", body: unknown): Promise<OryAuthResponse> {
  const flow = await createApiFlow(flowType);
  if (!flow.ui?.action) {
    throw new Error(`Ory ${flowType} flow is missing action URL`);
  }

  const response = await fetchOry(oryPublicFlowActionUrl(flow.ui.action), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await readOryErrorPayload(response);
    if (flowType === "registration") {
      const error = registrationErrorMessage(payload);
      throw new OryAuthFlowError(error.message, response.status, error.field);
    }

    throw new Error(`Ory ${flowType} failed with ${response.status}`);
  }

  return response.json() as Promise<OryAuthResponse>;
}

export async function checkPasswordLoginFlowHealth() {
  const flow = await createApiFlow("login");
  if (!flow.ui?.action) {
    throw new Error("Ory login flow is missing action URL");
  }

  const response = await fetchOry(oryPublicFlowActionUrl(flow.ui.action), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      method: "password",
      identifier: "__orf_health_probe__@invalid.orf",
      password: "__orf_health_probe_password__",
    }),
  });

  if (response.status === 400 || response.status === 401) {
    return;
  }

  if (response.ok) {
    throw new Error("Ory login probe unexpectedly accepted invalid credentials");
  }

  throw new Error(`Ory login probe failed with ${response.status}`);
}

export async function loginWithPassword(identifier: string, password: string) {
  const auth = await submitApiFlow("login", {
    method: "password",
    identifier,
    password,
  });

  if (!auth.session_token || !auth.session?.identity) {
    throw new Error("Ory login did not return a session token");
  }

  const user = await upsertOrfUser(auth.session.identity, { newUserStatus: "pending", recordOnline: true });
  return { sessionToken: auth.session_token, user };
}

export async function deleteOryIdentity(identityId: string | null | undefined) {
  const id = identityId?.trim();
  if (!id) {
    return;
  }

  const response = await fetchOry(oryAdminUrl(`/admin/identities/${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: {
      accept: "application/json",
    },
  });

  if (response.status === 404) {
    return;
  }

  if (!response.ok) {
    throw Object.assign(new Error(`Ory identity delete failed with ${response.status}`), { statusCode: 503 });
  }
}

export async function updateOryIdentityEmail(identityId: string | null | undefined, email: string) {
  const id = identityId?.trim();
  const nextEmail = email.trim().toLowerCase();
  if (!id || !nextEmail) {
    return;
  }

  const identity = await readOryIdentity(id);
  const traits = {
    ...(identity.traits ?? {}),
    email: nextEmail,
  };

  await updateOryIdentity(identity, { conflictMessage: "Email already exists", traits });
}

export async function resetOryIdentityPassword(identityId: string | null | undefined, password: string) {
  const id = identityId?.trim();
  if (!id) {
    throw Object.assign(new Error("User login identity is not linked"), { statusCode: 409 });
  }

  if (password.length < 8) {
    throw Object.assign(new Error("Password must be at least 8 characters"), { statusCode: 400 });
  }

  const identity = await readOryIdentity(id);
  await updateOryIdentity(identity, {
    credentials: {
      password: {
        config: { password },
      },
    },
  });
}

export async function registerWithPassword(input: { name: string; email: string; password: string }) {
  const auth = await submitApiFlow("registration", {
    method: "password",
    password: input.password,
    traits: {
      email: input.email,
      name: {
        first: input.name,
      },
    },
  });

  if (!auth.session_token || !auth.session?.identity) {
    throw new Error("Ory registration did not return a session token");
  }

  const user = await upsertOrfUser(auth.session.identity, { newUserStatus: "pending", recordOnline: true });
  return { sessionToken: auth.session_token, user };
}

export async function revokeApiSession(cookie: string | undefined) {
  const sessionToken = readCookie(cookie, ORF_SESSION_COOKIE);
  if (!sessionToken) {
    return;
  }

  await fetchOry(oryPublicUrl("/self-service/logout/api"), {
    method: "DELETE",
    headers: {
      accept: "application/json",
      ...sessionTokenHeader(sessionToken),
    },
  }).catch(() => undefined);
}
