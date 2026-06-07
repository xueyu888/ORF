import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUserScopeContext } from "../auth/accessPolicy";
import { env } from "../env";
import { registerPushDeviceForUser, revokePushDeviceForUser, upsertPushRegistrationStatusForUser } from "../push/pushRepository";
import { registerPushVendorDeviceForUser, revokePushVendorDeviceForUser, upsertPushVendorRegistrationStatusForUser } from "../push/vendorPushRepository";
import { runtimeScopeStorageId } from "../repositories/runtimeScope";

const pushDeviceEnvironmentSchema = z.object({
  appBuild: z.string().trim().max(64).nullish(),
  appVersion: z.string().trim().max(64).nullish(),
  deviceLabel: z.string().trim().max(120).nullish(),
  deviceManufacturer: z.string().trim().max(80).nullish(),
  deviceModel: z.string().trim().max(120).nullish(),
  googlePlayServicesAvailable: z.boolean().nullish(),
  notificationPermission: z.string().trim().max(32).nullish(),
  osVersion: z.string().trim().max(80).nullish(),
  platform: z.literal("android"),
  sdkInt: z.number().int().positive().nullish(),
});

const pushDeviceBodySchema = pushDeviceEnvironmentSchema.extend({
  token: z.string().trim().min(20).max(4096),
});

const pushVendorDeviceBodySchema = pushDeviceEnvironmentSchema.extend({
  token: z.string().trim().min(8).max(512),
  vendor: z.literal("vivo"),
});

const pushVendorRegistrationStatusBodySchema = pushDeviceEnvironmentSchema.extend({
  detail: z.string().trim().max(200).nullish(),
  reason: z.string().trim().max(80).nullish(),
  status: z.enum(["starting", "unavailable", "registering", "token_registered", "registration_error"]),
  vendor: z.literal("vivo"),
});

const pushRegistrationStatusBodySchema = pushDeviceEnvironmentSchema.extend({
  detail: z.string().trim().max(200).nullish(),
  reason: z.string().trim().max(80).nullish(),
  status: z.enum(["starting", "permission_denied", "registering", "token_registered", "registration_error"]),
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

  app.post("/api/push/vendor-devices", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const body = pushVendorDeviceBodySchema.parse(request.body);
    const device = await registerPushVendorDeviceForUser(runtimeScopeStorageId(context.scope), context.user.id, body);
    return {
      deviceId: device.id,
      ok: true,
      pushEnabled: env.ORF_PUSH_ENABLED,
    };
  });

  app.post("/api/push/vendor-registration-status", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const body = pushVendorRegistrationStatusBodySchema.parse(request.body);
    await upsertPushVendorRegistrationStatusForUser(runtimeScopeStorageId(context.scope), context.user.id, body);
    return {
      ok: true,
      pushEnabled: env.ORF_PUSH_ENABLED,
    };
  });

  app.post("/api/push/registration-status", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const body = pushRegistrationStatusBodySchema.parse(request.body);
    await upsertPushRegistrationStatusForUser(runtimeScopeStorageId(context.scope), context.user.id, body);
    return {
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

  app.post("/api/push/vendor-devices/revoke", async (request, reply) => {
    const context = await requireUserScopeContext(request, reply);
    if (!context) {
      return reply;
    }

    const body = pushVendorDeviceBodySchema.pick({ platform: true, token: true, vendor: true }).parse(request.body);
    return {
      revoked: await revokePushVendorDeviceForUser(runtimeScopeStorageId(context.scope), context.user.id, body),
    };
  });
}
