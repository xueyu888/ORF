import assert from "node:assert/strict";
import test from "node:test";
import { shouldCancelEmptyCreationDraft } from "../src/features/challenge/model/titleSubmission";

test("empty creation drafts are cancelled only when focus leaves the editor", () => {
  assert.equal(shouldCancelEmptyCreationDraft("", { origin: "blur" }), true);
  assert.equal(shouldCancelEmptyCreationDraft("   ", { origin: "blur" }), true);
  assert.equal(shouldCancelEmptyCreationDraft("", { origin: "submit" }), false);
  assert.equal(shouldCancelEmptyCreationDraft("新增行动项", { origin: "blur" }), false);
});
