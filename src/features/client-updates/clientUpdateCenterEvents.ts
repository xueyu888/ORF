export const clientUpdateCenterOpenEvent = "orf:client-update-center:open";
export const clientUpdateCheckRequestEvent = "orf:client-update:check-request";

export type ClientUpdateCenterOpenRequest = {
  notice?: string;
};

export type ClientUpdateCheckRequest = {
  releaseVersion?: string;
};

export function requestClientUpdateCenterOpen(request: ClientUpdateCenterOpenRequest = {}) {
  window.dispatchEvent(new CustomEvent<ClientUpdateCenterOpenRequest>(clientUpdateCenterOpenEvent, { detail: request }));
}

export function requestClientUpdateCheck(request: ClientUpdateCheckRequest = {}) {
  window.dispatchEvent(new CustomEvent<ClientUpdateCheckRequest>(clientUpdateCheckRequestEvent, { detail: request }));
}
