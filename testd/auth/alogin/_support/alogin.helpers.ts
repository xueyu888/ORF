import { closeDb } from "../../../../server/db/client";

export async function closeALoginTestDb() {
  await closeDb();
}
