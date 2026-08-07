import type { FastifyInstance } from "fastify";
import type { FeedbackServerHost } from "@orf/feedback-module/server";
import { registerFeedbackRoutes } from "../routes/feedbackRoutes";
import { startFeedbackDailyDigestScheduler } from "./feedbackDailyDigestScheduler";

export function createOrfFeedbackServerHost(app: FastifyInstance): FeedbackServerHost {
  return {
    protocolVersion: 1,
    registerHttpRoutes() {
      registerFeedbackRoutes(app);
    },
    startDailyDigestScheduler() {
      return startFeedbackDailyDigestScheduler(app.log);
    },
  };
}
