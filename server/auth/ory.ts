import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { teamMembers, teams, users } from "../db/schema";
import { env } from "../env";

export type AuthenticatedOrfUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  status: "pending" | "active" | "rejected" | "disabled";
  lastLoginAt: string | null;
};

type OryIdentity = {
  id: string;
  traits?: Record<string, unknown>;
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

const trimSlash = (value: string) => value.replace(/\/+$/, "");

function oryPublicUrl(path: string) {
  return new URL(path, `${trimSlash(env.ORY_PUBLIC_URL)}/`).toString();
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

function slug(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "user";
}

async function nextUserId(email: string, identityId: string) {
  const base = `user-${slug(email.split("@")[0] ?? identityId)}`;
  let candidate = base;
  let suffix = 1;

  while (true) {
    const [existing] = await db.select({ id: users.id }).from(users).where(sql`${users.id} = ${candidate}`).limit(1);
    if (!existing) {
      return candidate;
    }

    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

async function existingTeamRole(userId: string): Promise<AuthenticatedOrfUser["role"] | null> {
  const existingMemberships = await db.select({ role: teamMembers.role }).from(teamMembers).where(sql`${teamMembers.userId} = ${userId}`);
  if (existingMemberships.length > 0) {
    return existingMemberships.some((membership) => membership.role === "admin") ? "admin" : "member";
  }

  return null;
}

async function createDefaultTeamMembership(userId: string): Promise<AuthenticatedOrfUser["role"]> {
  const [team] = await db.select({ id: teams.id }).from(teams).limit(1);
  if (!team) {
    return "member";
  }

  await db.insert(teamMembers).values({ teamId: team.id, userId, role: "member" }).onConflictDoNothing();
  return "member";
}

async function upsertOrfUser(
  identity: OryIdentity,
  options: { newUserStatus?: AuthenticatedOrfUser["status"]; recordLogin?: boolean } = {},
): Promise<AuthenticatedOrfUser> {
  const email = identityEmail(identity);
  if (!email) {
    throw new Error("Ory identity does not include traits.email");
  }

  const name = identityName(identity, email);
  const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  const lastLoginAt = options.recordLogin ? new Date().toISOString() : undefined;

  if (existing) {
    if (existing.name !== name || lastLoginAt) {
      await db.update(users).set({ name, ...(lastLoginAt ? { lastLoginAt } : {}) }).where(sql`${users.id} = ${existing.id}`);
    }

    const role = await existingTeamRole(existing.id);
    if (!role) {
      throw new Error("ORF user is not a member of any team");
    }

    return {
      id: existing.id,
      name,
      email: existing.email ?? email,
      role,
      status: existing.status ?? "active",
      lastLoginAt: lastLoginAt ?? existing.lastLoginAt,
    };
  }

  const id = await nextUserId(email, identity.id);
  const createdLastLoginAt = lastLoginAt ?? null;
  await db.insert(users).values({
    id,
    name,
    email,
    status: options.newUserStatus ?? "pending",
    createdAt: new Date().toISOString().slice(0, 10),
    lastLoginAt: createdLastLoginAt,
  });

  const role = await createDefaultTeamMembership(id);
  return { id, name, email, role, status: options.newUserStatus ?? "pending", lastLoginAt: createdLastLoginAt };
}

export async function getAuthenticatedOrfUser(cookie: string | undefined): Promise<AuthenticatedOrfUser | null> {
  if (!cookie) {
    return null;
  }

  const response = await fetch(oryPublicUrl("/sessions/whoami"), {
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
  const response = await fetch(oryPublicUrl(`/self-service/${flowType}/api`), {
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

  const response = await fetch(flow.ui.action, {
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

export async function loginWithPassword(identifier: string, password: string) {
  const auth = await submitApiFlow("login", {
    method: "password",
    identifier,
    password,
  });

  if (!auth.session_token || !auth.session?.identity) {
    throw new Error("Ory login did not return a session token");
  }

  const user = await upsertOrfUser(auth.session.identity, { newUserStatus: "active", recordLogin: true });
  return { sessionToken: auth.session_token, user };
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

  const user = await upsertOrfUser(auth.session.identity, { newUserStatus: "pending", recordLogin: true });
  return { sessionToken: auth.session_token, user };
}

export async function revokeApiSession(cookie: string | undefined) {
  const sessionToken = readCookie(cookie, ORF_SESSION_COOKIE);
  if (!sessionToken) {
    return;
  }

  await fetch(oryPublicUrl("/self-service/logout/api"), {
    method: "DELETE",
    headers: {
      accept: "application/json",
      ...sessionTokenHeader(sessionToken),
    },
  }).catch(() => undefined);
}
