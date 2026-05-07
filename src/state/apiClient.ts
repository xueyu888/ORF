import type { OrfState, OrfUser } from "../types/orf";

export type TaskManagementData = Pick<OrfState, "objectives" | "results" | "tasks" | "evidence" | "feedback" | "permissionRules" | "automaticCompletions">;
export type AuthSession = { authenticated: false; user: null } | { authenticated: true; user: OrfUser };
export type PermissionRulesResponse = Pick<OrfState, "permissionRules">;
export type UsersResponse = Pick<OrfState, "users">;
export type VisualBackgroundScene = "login_background" | "sidebar_background";
export type VisualBackgroundImage = {
  id: string;
  scene: VisualBackgroundScene;
  fileName: string;
  url: string;
  fileKey: string;
  mimeType: string;
  fileSize: number;
  isDefault: boolean;
  createdAt?: string;
};
export type VisualBackgroundsData = {
  scene: VisualBackgroundScene;
  defaultBackgroundId: string | null;
  list: VisualBackgroundImage[];
};
type ApiEnvelope<T> = {
  code: number;
  message: string;
  data: T;
};

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
  if (init?.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
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

export async function getVisualBackgrounds(scene: VisualBackgroundScene) {
  const response = await apiJson<ApiEnvelope<VisualBackgroundsData>>(`/api/settings/visual/backgrounds?scene=${encodeURIComponent(scene)}`);
  return response.data;
}

export async function uploadVisualBackground(scene: VisualBackgroundScene, file: File) {
  const formData = new FormData();
  formData.set("scene", scene);
  formData.set("file", file);

  const response = await apiJson<ApiEnvelope<VisualBackgroundImage>>("/api/settings/visual/backgrounds", {
    method: "POST",
    body: formData,
  });
  return response.data;
}

export async function setDefaultVisualBackground(id: string) {
  const response = await apiJson<ApiEnvelope<{ id: string; scene: VisualBackgroundScene; isDefault: boolean }>>(
    `/api/settings/visual/backgrounds/${encodeURIComponent(id)}/default`,
    { method: "PUT" },
  );
  return response.data;
}
