import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUserScopeContext } from "../auth/accessPolicy";
import { subscribeRealtimeEvents } from "../realtime/realtimeEventBus";
import { runtimeScopeStorageId } from "../repositories/runtimeScope";
import type { RealtimeEvent } from "../../src/types/realtime";

const HEARTBEAT_MS = 25_000;
const realtimeQuerySchema = z.object({
  clientId: z.string().trim().min(1).max(128).optional(),
});

function writeSseEvent(write: (chunk: string) => void, event: RealtimeEvent) {
  write(`id: ${event.id}\n`);
  write(`event: ${event.kind}\n`);
  write(`data: ${JSON.stringify(event)}\n\n`);
}

export function registerRealtimeRoutes(app: FastifyInstance) {
  app.get("/api/events", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }
    const query = realtimeQuerySchema.parse(request.query);

    reply.hijack();
    reply.raw.writeHead(200, {
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write("retry: 3000\n\n");

    const write = (chunk: string) => {
      if (!reply.raw.destroyed) {
        reply.raw.write(chunk);
      }
    };
    const unsubscribe = subscribeRealtimeEvents({
      clientId: query.clientId,
      teamId: runtimeScopeStorageId(context.scope),
      userId: context.user.id,
      send: (event) => writeSseEvent(write, event),
    });
    const heartbeat = setInterval(() => write(`: heartbeat ${Date.now()}\n\n`), HEARTBEAT_MS);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    request.raw.on("close", cleanup);
  });
}
