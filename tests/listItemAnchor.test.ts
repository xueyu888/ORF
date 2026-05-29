import assert from "node:assert/strict";
import test from "node:test";
import { applyListItemAnchor, createListItemAnchor, listContainsAnchoredItem } from "../src/features/interaction/listItemAnchor";

type Item = { id: string };

test("list item anchor keeps an active item in its captured neighbor context", () => {
  const anchor = createListItemAnchor(items(["before", "active", "after"]), "active", itemId);
  const reordered = items(["before", "after", "active"]);

  assert.deepEqual(applyListItemAnchor(reordered, anchor, itemId).map(itemId), ["before", "active", "after"]);
});

test("list item anchor falls back to captured index when neighbors leave the list", () => {
  const anchor = createListItemAnchor(items(["before", "active", "after"]), "active", itemId);
  const reordered = items(["active", "other"]);

  assert.deepEqual(applyListItemAnchor(reordered, anchor, itemId).map(itemId), ["other", "active"]);
});

test("list item anchor reports when the active item has left the visible list", () => {
  const anchor = createListItemAnchor(items(["before", "active", "after"]), "active", itemId);

  assert.equal(listContainsAnchoredItem(items(["before", "after"]), anchor, itemId), false);
  assert.equal(listContainsAnchoredItem(items(["before", "active", "after"]), anchor, itemId), true);
});

function items(ids: string[]): Item[] {
  return ids.map((id) => ({ id }));
}

function itemId(item: Item) {
  return item.id;
}
