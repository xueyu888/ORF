import type { FastifyInstance } from "fastify";
import { authenticateResult, formatResult, resultSchema, type ResultConfig } from "./model";
import type { TestdDeliveryInput } from "./delivery";

export type ResultDelivery = (input: TestdDeliveryInput) => Promise<string>;

export function registerTestdResultRoute(app: FastifyInstance, config: ResultConfig, deliver: ResultDelivery) {
  void app.register(async scope => {
    scope.removeContentTypeParser("application/json");
    scope.addContentTypeParser("application/json", { parseAs: "string", bodyLimit: 65536 }, (_request, body, done) => done(null, body));
    scope.post("/webhooks/testd/results", { bodyLimit: 65536 }, async (request, reply) => {
      const raw = request.body;
      const eventId = request.headers["x-testd-event-id"];
      if (typeof raw !== "string" || !authenticateResult(raw, eventId, request.headers["x-testd-timestamp"], request.headers["x-testd-signature"], config.secret)) {
        return reply.code(403).send({ error: "invalid_signature" });
      }
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { return reply.code(400).send({ error: "invalid_json" }); }
      const result = resultSchema.safeParse(parsed);
      if (!result.success || result.data.instanceId !== config.instanceId || result.data.eventId !== eventId) return reply.code(400).send({ error: "invalid_result" });
      try {
        const messageId = await deliver({ body: formatResult(result.data, config), event: result.data });
        return { eventId, messageId };
      } catch (error) {
        request.log.error({ reason: error instanceof Error ? error.message : "未知错误" }, "TestD 结果投递失败");
        return reply.code(503).send({ error: "delivery_unavailable" });
      }
    });
  });
}
