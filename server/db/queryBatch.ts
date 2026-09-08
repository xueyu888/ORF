import type { PoolClient } from "pg";
import { pool } from "./client";

export type DatabaseReadClient = Pick<PoolClient, "query">;

// A pool can run independent reads concurrently. A checked-out connection
// executes them in order, including nested batches within one transaction.
export function readQueryBatch<T extends unknown[]>(
  client: DatabaseReadClient,
  reads: { [K in keyof T]: () => Promise<T[K]> },
): Promise<T>;
export async function readQueryBatch(client: DatabaseReadClient, reads: readonly (() => Promise<unknown>)[]) {
  if (client === pool) return Promise.all(reads.map((read) => read()));
  const results: unknown[] = [];
  for (const read of reads) results.push(await read());
  return results;
}
