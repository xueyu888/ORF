import { closeDb } from "../../../../server/db/client";

export async function closeLoginInvalidCredentialsTestDb() {
  await closeDb();
}
