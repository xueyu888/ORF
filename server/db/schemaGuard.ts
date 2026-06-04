type NullableFlag = "YES" | "NO";

export type RuntimeSchemaColumn = {
  columnName: string;
  isNullable: NullableFlag | string;
};

export type RuntimeSchemaConstraint = {
  constraintName: string;
  definition: string;
};

export type RuntimeSchemaSnapshot = {
  columns: RuntimeSchemaColumn[];
  constraints: RuntimeSchemaConstraint[];
};

export type RuntimeEnumSnapshot = {
  labels: string[];
};

export class DatabaseSchemaMismatchError extends Error {
  statusCode = 503;
  details: string[];

  constructor(details: string[]) {
    super(`Database schema is not migrated for current ORF schema. ${details.join(" ")}`);
    this.name = "DatabaseSchemaMismatchError";
    this.details = details;
  }
}

export function isDatabaseSchemaMismatchError(error: unknown): error is DatabaseSchemaMismatchError {
  return error instanceof DatabaseSchemaMismatchError;
}

export function databaseSchemaMismatchPayload(error: DatabaseSchemaMismatchError) {
  return {
    error: "数据库结构未完成迁移，请先对当前运行时 DATABASE_URL 执行 npm run db:migrate。",
    details: error.details,
  };
}

export function validateObjectiveOwnedTaskSchema(snapshot: RuntimeSchemaSnapshot) {
  const errors: string[] = [];
  const columnByName = new Map(snapshot.columns.map((column) => [column.columnName, column]));
  const linkedObjectiveId = columnByName.get("linked_objective_id");
  const linkedResultId = columnByName.get("linked_result_id");
  const feedbackOriginId = columnByName.get("feedback_origin_id");

  if (!linkedObjectiveId) {
    errors.push("tasks.linked_objective_id is missing.");
  } else if (linkedObjectiveId.isNullable !== "NO") {
    errors.push("tasks.linked_objective_id must be NOT NULL.");
  }

  if (linkedResultId) {
    errors.push("tasks.linked_result_id must be dropped; tasks are owned by objectives only.");
  }

  if (feedbackOriginId) {
    errors.push("tasks.feedback_origin_id must be dropped; feedback no longer creates task origins.");
  }

  const linkedResultForeignKey = snapshot.constraints.find((constraint) =>
    /FOREIGN KEY \(linked_result_id\) REFERENCES results\(id\)/i.test(constraint.definition),
  );
  if (linkedResultForeignKey) {
    errors.push("tasks.linked_result_id foreign key must be dropped.");
  }

  return errors;
}

export function validateObjectiveProjectDisplaySchema(snapshot: RuntimeSchemaSnapshot) {
  const errors: string[] = [];
  const columnByName = new Map(snapshot.columns.map((column) => [column.columnName, column]));

  for (const columnName of ["project_id", "project_name"]) {
    const column = columnByName.get(columnName);
    if (!column) {
      errors.push(`objectives.${columnName} is missing.`);
    } else if (column.isNullable !== "YES") {
      errors.push(`objectives.${columnName} must be nullable.`);
    }
  }

  return errors;
}

export function validateTeamFeedbackSchema(snapshot: RuntimeSchemaSnapshot) {
  const errors: string[] = [];
  const columnByName = new Map(snapshot.columns.map((column) => [column.columnName, column]));

  for (const columnName of ["linked_objective_id", "linked_result_id", "source"]) {
    if (columnByName.has(columnName)) {
      errors.push(`feedback.${columnName} must be dropped; feedback is a team issue, not a metric-bound signal.`);
    }
  }

  return errors;
}

export function validateTeamFeedbackEvidenceSchema(snapshot: RuntimeSchemaSnapshot) {
  const errors: string[] = [];
  const columnByName = new Map(snapshot.columns.map((column) => [column.columnName, column]));
  if (columnByName.has("linked_feedback_id")) {
    errors.push("evidence.linked_feedback_id must be dropped; evidence belongs to results only.");
  }
  return errors;
}

export function validateFeedbackStatusEnum(snapshot: RuntimeEnumSnapshot) {
  const labels = snapshot.labels.join(",");
  return labels === "Open,Closed" ? [] : [`feedback_status enum must be exactly Open,Closed; got ${labels}.`];
}

export function validateFeedbackCommentTargetSchema(snapshot: RuntimeEnumSnapshot) {
  return snapshot.labels.includes("feedback") ? [] : ["comment_target_type enum must include feedback."];
}

export async function assertRuntimeDatabaseSchema() {
  const { pool } = await import("./client");
  const [
    taskColumnsResult,
    taskConstraintsResult,
    objectiveColumnsResult,
    feedbackColumnsResult,
    evidenceColumnsResult,
    feedbackStatusResult,
  ] = await Promise.all([
    pool.query<RuntimeSchemaColumn>(
      `
        select
          column_name as "columnName",
          is_nullable as "isNullable"
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = 'tasks'
          and column_name in ('linked_objective_id', 'linked_result_id', 'feedback_origin_id')
      `,
    ),
    pool.query<RuntimeSchemaConstraint>(
      `
        select
          con.conname as "constraintName",
          pg_get_constraintdef(con.oid) as "definition"
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        join pg_namespace nsp on nsp.oid = rel.relnamespace
        where nsp.nspname = current_schema()
          and rel.relname = 'tasks'
          and con.contype = 'f'
      `,
    ),
    pool.query<RuntimeSchemaColumn>(
      `
        select
          column_name as "columnName",
          is_nullable as "isNullable"
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = 'objectives'
          and column_name in ('project_id', 'project_name')
      `,
    ),
    pool.query<RuntimeSchemaColumn>(
      `
        select
          column_name as "columnName",
          is_nullable as "isNullable"
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = 'feedback'
          and column_name in ('linked_objective_id', 'linked_result_id', 'source')
      `,
    ),
    pool.query<RuntimeSchemaColumn>(
      `
        select
          column_name as "columnName",
          is_nullable as "isNullable"
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = 'evidence'
          and column_name = 'linked_feedback_id'
      `,
    ),
    pool.query<{ label: string }>(
      `
        select e.enumlabel as "label"
        from pg_enum e
        join pg_type t on t.oid = e.enumtypid
        join pg_namespace nsp on nsp.oid = t.typnamespace
        where nsp.nspname = current_schema()
          and t.typname = 'feedback_status'
        order by e.enumsortorder
      `,
    ),
  ]);
  const commentTargetTypeResult = await pool.query<{ label: string }>(
    `
      select e.enumlabel as "label"
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      join pg_namespace nsp on nsp.oid = t.typnamespace
      where nsp.nspname = current_schema()
        and t.typname = 'comment_target_type'
    `,
  );
  const errors = [
    ...validateObjectiveOwnedTaskSchema({
      columns: taskColumnsResult.rows,
      constraints: taskConstraintsResult.rows,
    }),
    ...validateObjectiveProjectDisplaySchema({
      columns: objectiveColumnsResult.rows,
      constraints: [],
    }),
    ...validateTeamFeedbackSchema({
      columns: feedbackColumnsResult.rows,
      constraints: [],
    }),
    ...validateTeamFeedbackEvidenceSchema({
      columns: evidenceColumnsResult.rows,
      constraints: [],
    }),
    ...validateFeedbackStatusEnum({
      labels: feedbackStatusResult.rows.map((row) => row.label),
    }),
    ...validateFeedbackCommentTargetSchema({
      labels: commentTargetTypeResult.rows.map((row) => row.label),
    }),
  ];

  if (errors.length > 0) {
    throw new DatabaseSchemaMismatchError(errors);
  }
}
