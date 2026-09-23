import { orfRecipientEmail } from "./author-recipient-map";
import { directResultMessageId, type ResultConfig, type TestdResult } from "./model";

export type TestdDeliveryInput = { event: TestdResult; body: string; messageId: string };
export type TestdDeliveryPorts = {
  sendPublic(input: { body: string; messageId: string }): Promise<string>;
  readCommitAuthor(projectId: number, sha: string): Promise<string>;
  sendDirect(input: { body: string; messageId: string; recipientEmail: string }): Promise<void>;
};

export async function deliverTestdResult(input: TestdDeliveryInput, config: ResultConfig, ports: TestdDeliveryPorts): Promise<string> {
  const publicMessageId = await ports.sendPublic({ body: input.body, messageId: input.messageId });
  const event = input.event;
  if (event.schema === "testd.plan-result/v3" && event.source === "gitlab_merge_request" && event.gate?.state === "failed" && event.mergeRequest) {
    const authorEmail = await ports.readCommitAuthor(event.mergeRequest.projectId, event.mergeRequest.sourceSha);
    const recipientEmail = orfRecipientEmail(authorEmail);
    await ports.sendDirect({ body: input.body, messageId: directResultMessageId(config, event.eventId), recipientEmail });
  }
  return publicMessageId;
}
