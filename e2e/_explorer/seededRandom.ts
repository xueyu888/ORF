export class SeededRandom {
  private state: number;

  constructor(seed: string | number) {
    this.state = seedToUint32(seed);
  }

  next() {
    this.state += 0x6d2b79f5;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  int(minInclusive: number, maxInclusive: number) {
    const min = Math.ceil(minInclusive);
    const max = Math.floor(maxInclusive);
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(items: readonly T[]) {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty list.");
    }
    return items[this.int(0, items.length - 1)];
  }

  weightedPick<T>(items: readonly T[], weightFor: (item: T) => number) {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty list.");
    }

    const weights = items.map((item) => Math.max(0, weightFor(item)));
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (total <= 0) {
      return this.pick(items);
    }

    let threshold = this.next() * total;
    for (let index = 0; index < items.length; index += 1) {
      threshold -= weights[index];
      if (threshold <= 0) {
        return items[index];
      }
    }
    return items[items.length - 1];
  }
}

export function seedToUint32(seed: string | number) {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return seed >>> 0;
  }

  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
