import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { ApiError, apiJson, type AuthSession } from "./apiClient";
import { mergeUserDisplayProfiles } from "../domain/userDisplayProfile";
import type { OrfState, OrfUser } from "../types/orf";

const AUTH_SESSION_TIMEOUT_MS = 8000;
const AUTH_PASSWORD_TIMEOUT_MS = 2000;

export type AuthResult = { ok: true; user: OrfUser } | { ok: false; message: string };
export type ApiAuthenticationExpiryConfirmation = "authenticated" | "expired" | "unavailable";
export type ConfirmApiAuthenticationExpiredInput = {
  loadSession: () => Promise<AuthSession>;
  setAuthConnectionError: Dispatch<SetStateAction<string | null>>;
  setAuthUserId: Dispatch<SetStateAction<string | null>>;
  setState: Dispatch<SetStateAction<OrfState>>;
};

function mergeAuthenticatedUser(state: OrfState, user: OrfUser): OrfState {
  const users = state.users.filter((item) => item.id !== user.id && item.email.toLowerCase() !== user.email.toLowerCase());
  return {
    ...state,
    users: [...users, user],
    userProfiles: mergeUserDisplayProfiles(state.userProfiles, [user]),
    currentUserId: user.id,
  };
}

function persistAuthenticatedUser(user: OrfUser, setState: Dispatch<SetStateAction<OrfState>>) {
  setState((current) => {
    return mergeAuthenticatedUser(current, user);
  });
}

async function fetchCurrentAuthSession() {
  return apiJson<AuthSession>("/api/auth/session", {
    signal: AbortSignal.timeout(AUTH_SESSION_TIMEOUT_MS),
  });
}

export function authFailureMessage(error: unknown, action: "login" | "registration") {
  if (error instanceof DOMException && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return "认证服务暂时不可用，请联系管理员。";
  }

  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "账号或密码不正确";
    }

    if (error.status === 403 && action === "login") {
      return error.message || "账号未加入当前默认团队，请联系管理员。";
    }

    if (error.status === 400) {
      if (action === "registration" && error.message && error.message !== "Registration failed") {
        return error.message;
      }

      return action === "registration" ? "注册失败，请检查邮箱和密码" : "账号或密码不正确";
    }

    if (error.status === 502 || error.status === 503 || error.status === 504) {
      return error.message || "认证服务暂时不可用，请联系管理员。";
    }
  }

  return "无法连接后端服务，请确认服务已启动";
}

export async function confirmApiAuthenticationExpiredSession(
  input: ConfirmApiAuthenticationExpiredInput,
): Promise<ApiAuthenticationExpiryConfirmation> {
  try {
    const session = await input.loadSession();
    input.setAuthConnectionError(null);
    if (!session.authenticated) {
      input.setAuthUserId(null);
      return "expired";
    }

    input.setAuthUserId(session.user.id);
    persistAuthenticatedUser(session.user, input.setState);
    return "authenticated";
  } catch (error) {
    input.setAuthConnectionError(authFailureMessage(error, "login"));
    return "unavailable";
  }
}

export function useAuthSessionState(setState: Dispatch<SetStateAction<OrfState>>) {
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authConnectionError, setAuthConnectionError] = useState<string | null>(null);

  const refreshAuthSession = useCallback(async () => {
    try {
      const session = await fetchCurrentAuthSession();
      setAuthConnectionError(null);
      if (!session.authenticated) {
        setAuthUserId(null);
        return;
      }

      setAuthUserId(session.user.id);
      persistAuthenticatedUser(session.user, setState);
    } catch (error) {
      setAuthConnectionError(authFailureMessage(error, "login"));
      setAuthUserId(null);
    } finally {
      setAuthReady(true);
    }
  }, [setState]);

  const confirmApiAuthenticationExpired = useCallback(async (): Promise<ApiAuthenticationExpiryConfirmation> => {
    return confirmApiAuthenticationExpiredSession({
      loadSession: fetchCurrentAuthSession,
      setAuthConnectionError,
      setAuthUserId,
      setState,
    });
  }, [setState]);

  const applyAuthSession = useCallback(
    (session: AuthSession) => {
      if (!session.authenticated) {
        return { ok: false, message: "认证服务没有返回登录会话" } satisfies AuthResult;
      }

      setAuthUserId(session.user.id);
      setAuthConnectionError(null);
      persistAuthenticatedUser(session.user, setState);
      return { ok: true, user: session.user } satisfies AuthResult;
    },
    [setState],
  );

  const authenticateWithPassword = useCallback(
    async (path: "/api/auth/login" | "/api/auth/registration", body: unknown): Promise<AuthResult> => {
      try {
        return applyAuthSession(
          await apiJson<AuthSession>(path, {
            method: "POST",
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(AUTH_PASSWORD_TIMEOUT_MS),
          }),
        );
      } catch (error) {
        return { ok: false, message: authFailureMessage(error, path === "/api/auth/login" ? "login" : "registration") };
      }
    },
    [applyAuthSession],
  );

  return {
    authenticateWithPassword,
    authConnectionError,
    authReady,
    authUserId,
    confirmApiAuthenticationExpired,
    refreshAuthSession,
    setAuthUserId,
  };
}
