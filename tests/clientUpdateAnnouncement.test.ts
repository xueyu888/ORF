import assert from "node:assert/strict";
import test from "node:test";
import { publishClientUpdateAnnouncement } from "../server/clientUpdates/clientUpdateAnnouncement";
import { subscribeRealtimeEvents } from "../server/realtime/realtimeEventBus";
import type { RealtimeEvent } from "../src/types/realtime";

test("client update automatic announcements are deduped per team and release", () => {
  const teamId = "team-client-update-announcement-test";
  const events: RealtimeEvent[] = [];
  const unsubscribe = subscribeRealtimeEvents({
    id: "client-update-announcement-test-subscriber",
    teamId,
    userId: "user-client-update-announcement-test",
    send: (event) => events.push(event),
  });
  const release = {
    assets: [],
    htmlUrl: "https://github.com/xueyu888/ORF/releases/tag/v9.9.9",
    isDraft: false,
    isPrerelease: false,
    tagName: "v9.9.9",
    version: "9.9.9",
  };

  try {
    const first = publishClientUpdateAnnouncement({ mode: "automatic", release, teamId });
    const duplicate = publishClientUpdateAnnouncement({ mode: "automatic", release, teamId });
    const manual = publishClientUpdateAnnouncement({ mode: "manual", release, teamId });

    assert.equal(first.skipped, false);
    assert.equal(first.realtimeRecipientUserCount, 1);
    assert.equal("onlineUserCount" in first, false);
    assert.equal(duplicate.skipped, true);
    assert.equal(manual.skipped, false);
    assert.equal(events.filter((event) => event.kind === "client.update.available").length, 2);
    assert.equal(events.filter((event) => event.kind === "system.broadcast" && event.broadcast.id === "client-update-9.9.9").length, 2);
  } finally {
    unsubscribe();
  }
});
