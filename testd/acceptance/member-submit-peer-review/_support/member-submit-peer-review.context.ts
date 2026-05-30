import type { BrowserContext, Page } from "@playwright/test";
import type { ObjectiveFlowStatus, OrfStage } from "../../../../src/types/orf";

export type TestContext = {
  context: BrowserContext;
  page: Page;
};

export type MemberSubmitPeerReviewCaseData = {
  email: string;
  password: string;
  name: string;
  peerEmail: string;
  peerPassword: string;
  peerName: string;
  role: "member";
  objectiveId: string;
  objectiveTitle: string;
  lootBody: string;
  reviewerRatio: string;
  peerRatio: string;
};

export type PeerReviewTarget = {
  objective: {
    id: string;
    teamId: string;
    title: string;
    stage: OrfStage;
    flowStatus: ObjectiveFlowStatus;
  };
};

export type PeerReviewLoot = {
  id: string;
  objectiveId: string;
  body: string;
};

export type SubmittedPeerReview = {
  body: {
    ciphertext: string;
    encryptedKey: string;
    iv: string;
    keyId: string;
  };
  method: string;
  response: {
    ok: true;
    payloadHash: string;
    receivedAt: string;
  };
  url: string;
};
