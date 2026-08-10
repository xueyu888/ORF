export type MaterialCache<Value> = {
  clear: () => void;
  get: (key: string) => Value | undefined;
  set: (key: string, value: Value) => void;
};

export function createMaterialCache<Value>(capacity = 48): MaterialCache<Value> {
  const entries = new Map<string, Value>();
  const normalizedCapacity = Math.max(1, Math.floor(capacity));

  return {
    clear() {
      entries.clear();
    },
    get(key) {
      const value = entries.get(key);
      if (value === undefined) return undefined;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > normalizedCapacity) {
        const oldestKey = entries.keys().next().value;
        if (oldestKey === undefined) break;
        entries.delete(oldestKey);
      }
    },
  };
}
