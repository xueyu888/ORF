import { orfRecipientEmail } from "./author-recipient-map";
import type { TestdResult } from "./model";

export const testdObserverEmails = ["tangyl@sdrising.com", "zrx@sdr.com"] as const;

export type TestdDeliveryInput = { event: TestdResult; body: string };
type MrResult = Extract<TestdResult, { schema: "testd.plan-result/v3" }> & {
  mergeRequest: NonNullable<Extract<TestdResult, { schema: "testd.plan-result/v3" }>["mergeRequest"]>;
  gate: NonNullable<Extract<TestdResult, { schema: "testd.plan-result/v3" }>["gate"]>;
};
export type TestdNotificationInput = {
  event: MrResult;
  body: string;
  recipientUserIds: string[];
  sourceEventKey: string;
};
export type TestdDeliveryPorts = {
  readCommitAuthor(projectId: number, sha: string): Promise<string>;
  resolveRecipients(emails: readonly string[]): Promise<string[]>;
  publishNotification(input: TestdNotificationInput): Promise<string>;
};

export async function deliverTestdResult(input: TestdDeliveryInput, ports: TestdDeliveryPorts): Promise<string> {
  const event = input.event;
  // Historical and non-MR events still receive an acknowledgement so TestD can clear its retry ledger.
  if (event.schema !== "testd.plan-result/v3" || event.source !== "gitlab_merge_request" || !event.mergeRequest || !event.gate) {
    return event.eventId;
  }
  const mrEvent: MrResult = { ...event, mergeRequest: event.mergeRequest, gate: event.gate };

  const observers = await ports.resolveRecipients(testdObserverEmails);
  const notificationId = await ports.publishNotification({
    event: mrEvent,
    body: input.body,
    recipientUserIds: observers,
    sourceEventKey: `testd:mr:v1:${event.eventId}:observers`,
  });
  if (event.gate.state === "failed") {
    const authorEmail = await ports.readCommitAuthor(event.mergeRequest.projectId, event.mergeRequest.sourceSha);
    const recipientEmail = orfRecipientEmail(authorEmail);
    if (!testdObserverEmails.some(email => email === recipientEmail)) {
      const author = await ports.resolveRecipients([recipientEmail]);
      await ports.publishNotification({
        event: mrEvent,
        body: input.body,
        recipientUserIds: author,
        sourceEventKey: `testd:mr:v1:${event.eventId}:author`,
      });
    }
  }
  return notificationId;
}
