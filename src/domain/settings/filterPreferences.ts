import { z } from "zod";

export type FilterPreferenceValue = string | string[];
export type FilterPreferenceRecord = {
  values: Record<string, FilterPreferenceValue>;
  version: 1;
};
export type UserFilterPreferences = Record<string, FilterPreferenceRecord>;

const maxFilterPreferenceKeyLength = 80;
const maxFilterPreferenceValueLength = 180;
const maxFilterPreferenceListLength = 50;
const filterPreferenceKeyPattern = /^[A-Za-z0-9._:-]+$/;

const filterPreferenceStringValueSchema = z.string()
  .trim()
  .max(maxFilterPreferenceValueLength)
  .transform((value) => value.trim());

const filterPreferenceListValueSchema = z.array(filterPreferenceStringValueSchema)
  .max(maxFilterPreferenceListLength)
  .transform((values) => uniqueNonEmptyStrings(values));

export const filterPreferenceValueSchema = z.union([
  filterPreferenceStringValueSchema,
  filterPreferenceListValueSchema,
]);

export const filterPreferenceRecordSchema = z.object({
  values: z.record(z.string(), filterPreferenceValueSchema),
  version: z.literal(1),
});

export const userFilterPreferencesPatchSchema = z.record(z.string(), filterPreferenceRecordSchema.nullable());

export function normalizeUserFilterPreferences(input: unknown): UserFilterPreferences {
  if (!isPlainObject(input)) return {};

  const preferences: UserFilterPreferences = {};
  for (const [rawKey, rawRecord] of Object.entries(input)) {
    const key = normalizeFilterPreferenceKey(rawKey);
    if (!key) continue;
    const record = normalizeFilterPreferenceRecord(rawRecord);
    if (record) {
      preferences[key] = record;
    }
  }
  return preferences;
}

export function normalizeFilterPreferenceRecord(input: unknown): FilterPreferenceRecord | null {
  const parsed = filterPreferenceRecordSchema.safeParse(input);
  if (!parsed.success) return null;

  const values: Record<string, FilterPreferenceValue> = {};
  for (const [rawKey, rawValue] of Object.entries(parsed.data.values)) {
    const key = normalizeFilterPreferenceKey(rawKey);
    if (!key) continue;
    const value = normalizeFilterPreferenceValue(rawValue);
    if (value !== null) {
      values[key] = value;
    }
  }
  return { values, version: 1 };
}

export function filterPreferenceStringValue(record: FilterPreferenceRecord | null | undefined, key: string) {
  const value = record?.values[key];
  return typeof value === "string" ? value : null;
}

export function filterPreferenceStringListValue(record: FilterPreferenceRecord | null | undefined, key: string) {
  const value = record?.values[key];
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value) return [value];
  return [];
}

export function normalizeFilterPreferenceKey(input: string) {
  const key = input.trim();
  if (!key || key.length > maxFilterPreferenceKeyLength || !filterPreferenceKeyPattern.test(key)) {
    return null;
  }
  return key;
}

function normalizeFilterPreferenceValue(input: FilterPreferenceValue): FilterPreferenceValue | null {
  if (typeof input === "string") {
    const value = input.trim();
    return value ? value : null;
  }

  const values = uniqueNonEmptyStrings(input);
  return values.length > 0 ? values : null;
}

function uniqueNonEmptyStrings(values: readonly string[]) {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const item = value.trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }
  return normalized;
}

function isPlainObject(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
