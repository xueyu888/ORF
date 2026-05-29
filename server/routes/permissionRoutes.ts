import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdminScope } from "../auth/accessPolicy";
import {
  getPermissionRulesForScope,
  permissionKeys,
  replaceRolePermissionRules,
} from "../repositories/permissionRepository";

const userRoleSchema = z.enum(["admin", "member"]);
const editablePermissionRoleSchema = z.enum(["member"]);
const permissionKeySchema = z.enum(permissionKeys);
const permissionRoleParamsSchema = z.object({ role: userRoleSchema });
const permissionRuleSchema = z.object({
  role: editablePermissionRoleSchema,
  permissions: z.array(permissionKeySchema),
});
const updateRolePermissionsBodySchema = z.object({
  permissionRules: z.array(permissionRuleSchema),
});

export function registerPermissionRoutes(app: FastifyInstance) {
  app.get("/api/permissions", async (request, reply) => {
    const scope = await requireAdminScope(request, reply);
    if (!scope) {
      return reply;
    }

    return { permissionRules: await getPermissionRulesForScope(scope) };
  });

  app.put("/api/permissions/:role", async (request, reply) => {
    const scope = await requireAdminScope(request, reply);
    if (!scope) {
      return reply;
    }

    const params = permissionRoleParamsSchema.parse(request.params);
    if (params.role === "admin") {
      return reply.code(400).send({ error: "Admin permissions are fixed and cannot be changed" });
    }

    const body = updateRolePermissionsBodySchema.parse(request.body);
    return {
      permissionRules: await replaceRolePermissionRules(scope, params.role, body.permissionRules),
    };
  });
}
