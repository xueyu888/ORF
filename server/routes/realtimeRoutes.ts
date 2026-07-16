import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUserScopeContext } from "../auth/accessPolicy";
import { subscribeRealtimeEvents } from "../realtime/realtimeEventBus";
import { registerRealtimeConnectionCloser } from "../realtime/realtimeConnectionRegistry";
import { runtimeScopeStorageId } from "../repositories/runtimeScope";
import type { RealtimeEvent } from "../../src/types/realtime";

const HEARTBEAT_MS = 25_000;
const realtimeQuerySchema = z.object({
  clientId: z.string().trim().min(1).max(128).optional(),
});

function sseEventChunk(event: RealtimeEvent) {
  return `id: ${event.id}\nevent: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`;
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
      if (reply.raw.destroyed || reply.raw.writableEnded) return false;
      reply.raw.write(chunk);
      return true;
    };
    const unsubscribe = subscribeRealtimeEvents({
      clientId: query.clientId,
      teamId: runtimeScopeStorageId(context.scope),
      userId: context.user.id,
      send: (event) => write(sseEventChunk(event)),
    });
    const heartbeat = setInterval(() => write(`: heartbeat ${Date.now()}\n\n`), HEARTBEAT_MS);

    let cleaned = false;
    let unregisterConnection = () => false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeat);
      unsubscribe();
      unregisterConnection();
    };
    const close = () => {
      if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.end();
      cleanup();
    };
    unregisterConnection = registerRealtimeConnectionCloser(close);
    request.raw.on("close", cleanup);
    reply.raw.on("error", cleanup);
  });
}
