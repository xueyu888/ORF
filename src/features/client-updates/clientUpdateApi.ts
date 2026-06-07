import { getClientUpdateRelease, getLatestClientUpdateRelease } from "../../state/apiClient";
import type { ClientReleaseInfo } from "./clientUpdateModel";

export async function getLatestClientRelease(signal?: AbortSignal): Promise<ClientReleaseInfo> {
  const response = await getLatestClientUpdateRelease(signal);
  return response.release;
}

export async function getClientRelease(version: string, signal?: AbortSignal): Promise<ClientReleaseInfo> {
  const response = await getClientUpdateRelease(version, signal);
  return response.release;
}
