import { sql } from "drizzle-orm";
import { users } from "../../../../server/db/schema";
import { db } from "../../../_operators/testd-db-client";
import { type OryIdentity } from "../../../_operators/common.context";
import { oryAdminFetch } from "../../../_operators/common.helpers";

export async function countOryIdentitiesByEmail(email: string) {
  const identities = await oryAdminFetch<OryIdentity[]>(
    `/admin/identities?credentials_identifier=${encodeURIComponent(email)}`,
  );
  return identities.filter(
    (identity) => identity.traits?.email?.toLowerCase() === email.toLowerCase(),
  ).length;
}

export async function countUsersByEmail(email: string) {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
  return rows.length;
}
