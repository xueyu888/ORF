export const clientUpdateCenterOpenEvent = "orf:client-update-center:open";

export type ClientUpdateCenterOpenRequest = {
  notice?: string;
};

export function requestClientUpdateCenterOpen(request: ClientUpdateCenterOpenRequest = {}) {
  window.dispatchEvent(new CustomEvent<ClientUpdateCenterOpenRequest>(clientUpdateCenterOpenEvent, { detail: request }));
}
