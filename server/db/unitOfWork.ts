import type { OrfUnitOfWorkToken } from "@orf/module-protocol";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type UnitOfWorkClient = Pick<NodePgDatabase<any>, "delete" | "insert" | "select" | "update">;

const clients = new WeakMap<object, UnitOfWorkClient>();

export function registerUnitOfWork(client: UnitOfWorkClient): OrfUnitOfWorkToken {
  const token = {} as OrfUnitOfWorkToken;
  clients.set(token, client);
  return token;
}

export function resolveUnitOfWork(token: OrfUnitOfWorkToken): UnitOfWorkClient {
  const client = clients.get(token);
  if (!client) throw new Error("Unit of work is no longer active");
  return client;
}

export function releaseUnitOfWork(token: OrfUnitOfWorkToken) {
  clients.delete(token);
}
