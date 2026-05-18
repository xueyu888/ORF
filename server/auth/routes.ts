import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { databaseUnavailablePayload, isDatabaseUnavailableError } from "../db/errors";
import { env } from "../env";
import { authServiceUnavailablePayload, isAuthServiceUnavailableError } from "./errors";
import { ORF_SESSION_COOKIE, OryAuthFlowError, getAuthenticatedOrfUser, loginWithPassword, registerWithPassword, revokeApiSession } from "./ory";

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registrationBodySchema = loginBodySchema.extend({
  name: z.string().min(1),
});

function authCookie(sessionToken: string) {
  return serializeSessionCookie(encodeURIComponent(sessionToken), 604800);
}

function clearAuthCookie() {
  return serializeSessionCookie("", 0);
}

function serializeSessionCookie(value: string, maxAge: number) {
  const secure = env.ORF_APP_URL.startsWith("https://") ? "; Secure" : "";
  return `${ORF_SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function requireAuthenticatedApi(request: FastifyRequest, reply: FastifyReply) {
  const pathname = new URL(request.url, "http://orf.local").pathname;
  if (request.method === "GET" && pathname === "/api/settings/visual/backgrounds") {
    return;
  }

  if (!pathname.startsWith("/api/") || pathname.startsWith("/api/auth/")) {
    return;
  }

  const user = await getAuthenticatedOrfUser(request.headers.cookie).catch((error) => {
    request.log.warn(error, "Ory session check failed");
    if (isDatabaseUnavailableError(error) || isAuthServiceUnavailableError(error)) {
      reply.code(503).send(isDatabaseUnavailableError(error) ? databaseUnavailablePayload() : authServiceUnavailablePayload());
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

export function registerAuthRoutes(app: FastifyInstance) {
  app.get("/api/auth/session", async (request, reply) => {
    const user = await getAuthenticatedOrfUser(request.headers.cookie).catch((error) => {
      request.log.warn(error, "Ory session check failed");
      if (isDatabaseUnavailableError(error) || isAuthServiceUnavailableError(error)) {
        reply.code(503).send(isDatabaseUnavailableError(error) ? databaseUnavailablePayload() : authServiceUnavailablePayload());
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
      if (isAuthServiceUnavailableError(error)) {
        return reply.code(503).send(isDatabaseUnavailableError(error) ? databaseUnavailablePayload() : authServiceUnavailablePayload());
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
      if (isAuthServiceUnavailableError(error)) {
        return reply.code(503).send(isDatabaseUnavailableError(error) ? databaseUnavailablePayload() : authServiceUnavailablePayload());
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
