import type { FastifyReply } from "fastify";
import { databaseUnavailablePayload, isDatabaseUnavailableError } from "../db/errors";
import { authServiceUnavailablePayload, isAuthServiceUnavailableError } from "./errors";
import { getAuthenticatedOrfUser, OrfUserScopeBindingError, type AuthenticatedOrfUser } from "./ory";

export type AuthSessionResolution =
  | { status: "authenticated"; user: AuthenticatedOrfUser }
  | { status: "anonymous" }
  | { status: "scopeMissing"; error: OrfUserScopeBindingError }
  | { status: "databaseUnavailable"; error: unknown }
  | { status: "authUnavailable"; error: unknown };

export type AuthSessionFailureResolution = Exclude<AuthSessionResolution, { status: "authenticated" }>;

export async function resolveAuthenticatedOrfUser(cookie: string | undefined): Promise<AuthSessionResolution> {
  try {
    const user = await getAuthenticatedOrfUser(cookie);
    return user ? { status: "authenticated", user } : { status: "anonymous" };
  } catch (error) {
    if (error instanceof OrfUserScopeBindingError) {
      return { status: "scopeMissing", error };
    }

    if (isDatabaseUnavailableError(error)) {
      return { status: "databaseUnavailable", error };
    }

    if (isAuthServiceUnavailableError(error)) {
      return { status: "authUnavailable", error };
    }

    throw error;
  }
}

export function authResolutionFailureStatus(resolution: AuthSessionFailureResolution) {
  switch (resolution.status) {
    case "anonymous":
      return 401;
    case "scopeMissing":
      return 403;
    case "databaseUnavailable":
    case "authUnavailable":
      return 503;
  }
}

export function authResolutionFailurePayload(resolution: AuthSessionFailureResolution) {
  switch (resolution.status) {
    case "anonymous":
      return { error: "Unauthorized" };
    case "scopeMissing":
      return { error: "账号未加入当前默认团队，请联系管理员。" };
    case "databaseUnavailable":
      return databaseUnavailablePayload();
    case "authUnavailable":
      return authServiceUnavailablePayload();
  }
}

export function authResolutionShouldLog(resolution: AuthSessionFailureResolution) {
  return resolution.status === "databaseUnavailable" || resolution.status === "authUnavailable" || resolution.status === "scopeMissing";
}

export function authResolutionLogContext(resolution: AuthSessionFailureResolution) {
  return "error" in resolution
    ? { authDecision: resolution.status, err: resolution.error }
    : { authDecision: resolution.status };
}

export function sendAuthResolutionFailure(reply: FastifyReply, resolution: AuthSessionFailureResolution) {
  return reply.code(authResolutionFailureStatus(resolution)).send(authResolutionFailurePayload(resolution));
}
