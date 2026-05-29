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

export class DatabaseSchemaMismatchError extends Error {
  statusCode = 503;
  details: string[];

  constructor(details: string[]) {
    super(`Database schema is not migrated for result-decoupled tasks. ${details.join(" ")}`);
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

  if (!linkedObjectiveId) {
    errors.push("tasks.linked_objective_id is missing.");
  } else if (linkedObjectiveId.isNullable !== "NO") {
    errors.push("tasks.linked_objective_id must be NOT NULL.");
  }

  if (linkedResultId) {
    errors.push("tasks.linked_result_id must be dropped; tasks are owned by objectives only.");
  }

  const linkedResultForeignKey = snapshot.constraints.find((constraint) =>
    /FOREIGN KEY \(linked_result_id\) REFERENCES results\(id\)/i.test(constraint.definition),
  );
  if (linkedResultForeignKey) {
    errors.push("tasks.linked_result_id foreign key must be dropped.");
  }

  return errors;
}

export async function assertRuntimeDatabaseSchema() {
  const { pool } = await import("./client");
  const [columnsResult, constraintsResult] = await Promise.all([
    pool.query<RuntimeSchemaColumn>(
      `
        select
          column_name as "columnName",
          is_nullable as "isNullable"
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = 'tasks'
          and column_name in ('linked_objective_id', 'linked_result_id')
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
  ]);
  const errors = validateObjectiveOwnedTaskSchema({
    columns: columnsResult.rows,
    constraints: constraintsResult.rows,
  });

  if (errors.length > 0) {
    throw new DatabaseSchemaMismatchError(errors);
  }
}
