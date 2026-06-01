export type ListItemAnchor<Id extends string = string> = {
  fallbackIndex: number;
  itemId: Id;
  nextItemId: Id | null;
  previousItemId: Id | null;
};

export function createListItemAnchor<Item, Id extends string>(
  items: readonly Item[],
  itemId: Id,
  getId: (item: Item) => Id,
): ListItemAnchor<Id> | null {
  const currentIndex = items.findIndex((item) => getId(item) === itemId);
  if (currentIndex < 0) return null;

  return {
    fallbackIndex: currentIndex,
    itemId,
    nextItemId: items[currentIndex + 1] ? getId(items[currentIndex + 1]!) : null,
    previousItemId: items[currentIndex - 1] ? getId(items[currentIndex - 1]!) : null,
  };
}

export function applyListItemAnchor<Item, Id extends string>(
  items: readonly Item[],
  anchor: ListItemAnchor<Id> | null,
  getId: (item: Item) => Id,
): Item[] {
  if (!anchor) return [...items];

  const currentIndex = items.findIndex((item) => getId(item) === anchor.itemId);
  if (currentIndex < 0) return [...items];

  const anchoredItem = items[currentIndex]!;
  const remainingItems = items.filter((_, index) => index !== currentIndex);
  const previousIndex = anchor.previousItemId ? remainingItems.findIndex((item) => getId(item) === anchor.previousItemId) : -1;
  const nextIndex = anchor.nextItemId ? remainingItems.findIndex((item) => getId(item) === anchor.nextItemId) : -1;
  let targetIndex = Math.max(0, Math.min(anchor.fallbackIndex, remainingItems.length));

  if (previousIndex >= 0 && nextIndex >= 0 && previousIndex < nextIndex) {
    targetIndex = previousIndex + 1;
  } else if (nextIndex >= 0) {
    targetIndex = nextIndex;
  } else if (previousIndex >= 0) {
    targetIndex = previousIndex + 1;
  }

  return [...remainingItems.slice(0, targetIndex), anchoredItem, ...remainingItems.slice(targetIndex)];
}

export function listContainsAnchoredItem<Item, Id extends string>(
  items: readonly Item[],
  anchor: ListItemAnchor<Id> | null,
  getId: (item: Item) => Id,
): boolean {
  return !anchor || items.some((item) => getId(item) === anchor.itemId);
}
