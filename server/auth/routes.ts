import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ORF_AUTH_SESSION_POLICY } from "../../src/domain/authSessionPolicy";
import { databaseUnavailablePayload, isDatabaseUnavailableError } from "../db/errors";
import { env } from "../env";
import { authServiceUnavailablePayload, isAuthServiceUnavailableError } from "./errors";
import {
  ORF_SESSION_COOKIE,
  OrfUserScopeBindingError,
  OryAuthFlowError,
  checkPasswordLoginFlowHealth,
  getAuthenticatedOrfUser,
  loginWithPassword,
  registerWithPassword,
  revokeApiSession,
} from "./ory";

const emailBodySchema = z.string().trim().email().transform((value) => value.toLowerCase());

const loginBodySchema = z.object({
  email: emailBodySchema,
  password: z.string().min(1),
});

const registrationBodySchema = loginBodySchema.extend({
  name: z.string().trim().min(1),
});

function authCookie(sessionToken: string) {
  return serializeSessionCookie(encodeURIComponent(sessionToken), ORF_AUTH_SESSION_POLICY.maxAgeSeconds);
}

function clearAuthCookie() {
  return serializeSessionCookie("", 0);
}

function serializeSessionCookie(value: string, maxAge: number) {
  const secure = env.ORF_APP_URL.startsWith("https://") ? "; Secure" : "";
  return `${ORF_SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function authDependencyUnavailablePayload(error: unknown) {
  if (isDatabaseUnavailableError(error)) {
    return databaseUnavailablePayload();
  }

  if (isAuthServiceUnavailableError(error)) {
    return authServiceUnavailablePayload();
  }

  return null;
}

export async function requireAuthenticatedApi(request: FastifyRequest, reply: FastifyReply) {
  const requestUrl = new URL(request.url, "http://orf.local");
  const pathname = requestUrl.pathname;
  if (
    request.method === "GET" &&
    pathname === "/api/settings/visual/backgrounds" &&
    requestUrl.searchParams.get("scene") === "login_background"
  ) {
    return;
  }

  if (!pathname.startsWith("/api/") || pathname.startsWith("/api/auth/")) {
    return;
  }

  if (isClientUpdateReleaseBroadcastRequest(request, pathname)) {
    (request as FastifyRequest & { orfClientUpdateBroadcastAuthorized?: boolean }).orfClientUpdateBroadcastAuthorized = true;
    return;
  }

  const user = await getAuthenticatedOrfUser(request.headers.cookie).catch((error) => {
    request.log.warn(error, "Ory session check failed");
    if (error instanceof OrfUserScopeBindingError) {
      reply.code(403).send({ error: "账号未加入当前默认团队，请联系管理员。" });
      return undefined;
    }
    const unavailablePayload = authDependencyUnavailablePayload(error);
    if (unavailablePayload) {
      reply.code(503).send(unavailablePayload);
      return undefined;
    }
    return null;
  });

  if (user === undefined) {
    return;
  }

  if (!user) {
    return reply.code(401).send({ error: "Unauthorized" });
  }

  (request as FastifyRequest & { orfUser?: typeof user }).orfUser = user;

  if (user.status !== "active") {
    return reply.code(403).send({ error: "User is not approved", status: user.status });
  }
}

function isClientUpdateReleaseBroadcastRequest(request: FastifyRequest, pathname: string) {
  if (request.method !== "POST" || pathname !== "/api/client-updates/broadcast-release") {
    return false;
  }

  const configuredSecret = env.ORF_CLIENT_UPDATE_BROADCAST_SECRET?.trim();
  const providedSecret = readClientUpdateBroadcastSecret(request);
  return Boolean(configuredSecret && providedSecret && safeSecretEqual(providedSecret, configuredSecret));
}

function readClientUpdateBroadcastSecret(request: FastifyRequest) {
  const authorization = request.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }

  const header = request.headers["x-orf-client-update-broadcast-secret"];
  if (Array.isArray(header)) {
    return header[0]?.trim() ?? "";
  }
  return typeof header === "string" ? header.trim() : "";
}

function safeSecretEqual(providedSecret: string, configuredSecret: string) {
  const provided = Buffer.from(providedSecret);
  const configured = Buffer.from(configuredSecret);
  return provided.length === configured.length && timingSafeEqual(provided, configured);
}

export function registerAuthRoutes(app: FastifyInstance) {
  app.get("/health/auth", async (request, reply) => {
    try {
      await checkPasswordLoginFlowHealth();
      return { ok: true, service: "orf-auth" };
    } catch (error) {
      request.log.warn(error, "Ory auth health check failed");
      return reply.code(503).send(authServiceUnavailablePayload());
    }
  });

  app.get("/api/auth/session", async (request, reply) => {
    const user = await getAuthenticatedOrfUser(request.headers.cookie).catch((error) => {
      request.log.warn(error, "Ory session check failed");
      if (error instanceof OrfUserScopeBindingError) {
        reply.code(403).send({ error: "账号未加入当前默认团队，请联系管理员。" });
        return undefined;
      }
      const unavailablePayload = authDependencyUnavailablePayload(error);
      if (unavailablePayload) {
        reply.code(503).send(unavailablePayload);
        return undefined;
      }
      return null;
    });

    if (user === undefined) {
      return reply;
    }

    return user ? { authenticated: true, user } : { authenticated: false, user: null };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = loginBodySchema.parse(request.body);

    try {
      const auth = await loginWithPassword(body.email, body.password);
      reply.header("Set-Cookie", authCookie(auth.sessionToken));
      return { authenticated: true, user: auth.user };
    } catch (error) {
      request.log.warn(error, "Ory password login failed");
      const unavailablePayload = authDependencyUnavailablePayload(error);
      if (unavailablePayload) {
        return reply.code(503).send(unavailablePayload);
      }
      if (error instanceof OrfUserScopeBindingError) {
        return reply.code(403).send({ error: "账号未加入当前默认团队，请联系管理员。" });
      }
      return reply.code(401).send({ error: "Invalid email or password" });
    }
  });

  app.post("/api/auth/registration", async (request, reply) => {
    const body = registrationBodySchema.parse(request.body);

    try {
      const auth = await registerWithPassword(body);
      reply.header("Set-Cookie", authCookie(auth.sessionToken));
      return { authenticated: true, user: auth.user };
    } catch (error) {
      request.log.warn(error, "Ory password registration failed");
      const unavailablePayload = authDependencyUnavailablePayload(error);
      if (unavailablePayload) {
        return reply.code(503).send(unavailablePayload);
      }
      if (error instanceof OryAuthFlowError) {
        return reply.code(400).send({ error: error.message, field: error.field });
      }
      return reply.code(400).send({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/logout", async (request, reply) => {
    await revokeApiSession(request.headers.cookie);
    reply.header("Set-Cookie", clearAuthCookie());
    return { ok: true };
  });
}
