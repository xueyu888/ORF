import { eq } from "drizzle-orm";
import type { RealSystemHarness } from "./realSystemHarness";

export const realFutureDueDate = "2999-12-31";
export const realPastDueDate = "2000-01-01";
export const expiredReestimateAt = "2000-01-01T00:00:00.000Z";

export class RealClock {
  constructor(private readonly real: RealSystemHarness) {}

  async expireReestimateWindow(objectiveId: string) {
    await this.real.db
      .update(this.real.schema.objectives)
      .set({ confirmationDueAt: expiredReestimateAt })
      .where(eq(this.real.schema.objectives.id, objectiveId));
  }

  async setFinalDueAt(objectiveId: string, date: string) {
    await this.real.db
      .update(this.real.schema.objectives)
      .set({ finalDueAt: date })
      .where(eq(this.real.schema.objectives.id, objectiveId));
  }

  async makeSubmissionLate(objectiveId: string) {
    await this.setFinalDueAt(objectiveId, realPastDueDate);
  }

  async moveFinalDueBeforeLoot(objectiveId: string) {
    await this.setFinalDueAt(objectiveId, realFutureDueDate);
  }

  async moveFinalDueAfterLoot(objectiveId: string) {
    await this.makeSubmissionLate(objectiveId);
  }
}
