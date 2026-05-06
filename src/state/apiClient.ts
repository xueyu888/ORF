import type { OrfState, OrfUser } from "../types/orf";

export type TaskManagementData = Pick<OrfState, "objectives" | "results" | "tasks" | "evidence" | "feedback" | "permissionRules" | "automaticCompletions">;
export type AuthSession = { authenticated: false; user: null } | { authenticated: true; user: OrfUser };
export type PermissionRulesResponse = Pick<OrfState, "permissionRules">;
export type UsersResponse = Pick<OrfState, "users">;

export class ApiError extends Error {
  status: number;
  path: string;

  constructor(status: number, path: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
  }
}

function apiErrorMessage(payload: unknown, status: number, path: string) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) {
      return error;
    }
  }

  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  return `API ${status}: ${path}`;
}

async function readErrorPayload(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    return contentType.includes("application/json") ? await response.json() : await response.text();
  } catch {
    return "";
  }
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    const payload = await readErrorPayload(response);
    throw new ApiError(response.status, path, apiErrorMessage(payload, response.status, path));
  }

  return response.json() as Promise<T>;
}

export async function apiRequest(path: string, init?: RequestInit): Promise<void> {
  await apiJson<unknown>(path, init);
}
