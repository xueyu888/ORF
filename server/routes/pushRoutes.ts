import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUserScopeContext } from "../auth/accessPolicy";
import { env } from "../env";
import { registerPushDeviceForUser, revokePushDeviceForUser } from "../push/pushRepository";
import { runtimeScopeStorageId } from "../repositories/runtimeScope";

const pushDeviceBodySchema = z.object({
  appBuild: z.string().trim().max(64).optional(),
  appVersion: z.string().trim().max(64).optional(),
  deviceLabel: z.string().trim().max(120).optional(),
  deviceManufacturer: z.string().trim().max(80).optional(),
  deviceModel: z.string().trim().max(120).optional(),
  googlePlayServicesAvailable: z.boolean().optional(),
  notificationPermission: z.string().trim().max(32).optional(),
  osVersion: z.string().trim().max(80).optional(),
  platform: z.literal("android"),
  sdkInt: z.number().int().positive().optional(),
  token: z.string().trim().min(20).max(4096),
});

export function registerPushRoutes(app: FastifyInstance) {
  app.post("/api/push/devices", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const body = pushDeviceBodySchema.parse(request.body);
    const device = await registerPushDeviceForUser(runtimeScopeStorageId(context.scope), context.user.id, body);
    return {
      deviceId: device.id,
      ok: true,
      pushEnabled: env.ORF_PUSH_ENABLED,
    };
  });

  app.post("/api/push/devices/revoke", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const body = pushDeviceBodySchema.pick({ platform: true, token: true }).parse(request.body);
    return {
      revoked: await revokePushDeviceForUser(runtimeScopeStorageId(context.scope), context.user.id, body),
    };
  });
}
