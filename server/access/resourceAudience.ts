/** Stable identities, never display names or administrator-role bypasses. */
export type ResourceAudience = {
  readonly id: string;
  readonly workLogAuthorUserId: string;
  readonly readerUserIds: readonly string[];
};

export const resourceAudiences: readonly ResourceAudience[] = [{
  id: "luban-work-logs",
  workLogAuthorUserId: "19b08eb0-4be0-408e-8629-77a3263a1a2f",
  readerUserIds: ["19b08eb0-4be0-408e-8629-77a3263a1a2f", "62e1a368-8527-44c0-8a97-f2d557450273"],
}];

export function workLogAudience(authorUserId: string) {
  return resourceAudiences.find((audience) => audience.workLogAuthorUserId === authorUserId) ?? null;
}

export function canReadWorkLog(authorUserId: string, viewerUserId: string) {
  const audience = workLogAudience(authorUserId);
  return !audience || audience.readerUserIds.includes(viewerUserId);
}

// Only quoted values are interpolated; expression arguments are server-owned SQL.
export function sqlText(value: string) {
  return "'" + value.replaceAll("'", "''") + "'";
}

export function audienceVisibleSql(audienceIdSql: string, viewerIdSql: string): string {
  return `(${audienceIdSql} IS NULL OR ${resourceAudiences.map((audience) =>
    `(${audienceIdSql} = ${sqlText(audience.id)} AND ${viewerIdSql}::text IN (${audience.readerUserIds.map(sqlText).join(",")}))`,
  ).join(" OR ")})`;
}

export function workLogAudienceSql(authorIdSql: string): string {
  return `(CASE ${resourceAudiences.map((audience) =>
    `WHEN ${authorIdSql}::text = ${sqlText(audience.workLogAuthorUserId)} THEN ${sqlText(audience.id)}`,
  ).join(" ")} ELSE NULL END)`;
}

export function workLogVisibleSql(authorIdSql: string, viewerIdSql: string) {
  return audienceVisibleSql(workLogAudienceSql(authorIdSql), viewerIdSql);
}
