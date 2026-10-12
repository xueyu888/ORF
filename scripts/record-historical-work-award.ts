import "dotenv/config";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { closeDb } from "../server/db/client";
import { recordHistoricalWorkAward } from "../server/repositories/historicalWorkAwardRepository";

try {
  const { values } = parseArgs({ options: { input: { type: "string" }, apply: { type: "boolean", default: false } } });
  if (!values.input) throw new Error("Usage: node --import tsx scripts/record-historical-work-award.ts --input approved.json [--apply]");
  const input: unknown = JSON.parse(readFileSync(values.input, "utf8"));
  console.log(JSON.stringify(await recordHistoricalWorkAward(input, values.apply), null, 2));
} finally {
  await closeDb();
}
