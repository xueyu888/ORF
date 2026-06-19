type NullableFlag = "YES" | "NO";

export type RuntimeSchemaColumn = {
  columnName: string;
  isNullable: NullableFlag | string;
};

export type RuntimeTableColumn = RuntimeSchemaColumn & {
  tableName: string;
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
  const definitionContributorUserIds = columnByName.get("definition_contributor_user_ids");

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

  if (!definitionContributorUserIds) {
    errors.push("tasks.definition_contributor_user_ids is missing.");
  } else if (definitionContributorUserIds.isNullable !== "NO") {
    errors.push("tasks.definition_contributor_user_ids must be NOT NULL.");
  }

  const linkedResultForeignKey = snapshot.constraints.find((constraint) =>
    /FOREIGN KEY \(linked_result_id\) REFERENCES results\(id\)/i.test(constraint.definition),
  );
  if (linkedResultForeignKey) {
    errors.push("tasks.linked_result_id foreign key must be dropped.");
  }

  return errors;
}

export function validateObjectiveProjectDisplaySchema(snapshot: RuntimeSchemaSnapshot & { projectTableColumns?: RuntimeSchemaColumn[] }) {
  const errors: string[] = [];
  const columnByName = new Map(snapshot.columns.map((column) => [column.columnName, column]));
  const projectId = columnByName.get("project_id");

  if (!projectId) {
    errors.push("objectives.project_id is missing.");
  } else if (projectId.isNullable !== "YES") {
    errors.push("objectives.project_id must be nullable.");
  }

  if (columnByName.has("project_name")) {
    errors.push("objectives.project_name must be dropped; project names belong to projects.");
  }

  const projectTableColumns = snapshot.projectTableColumns ?? [];
  const projectColumnByName = new Map(projectTableColumns.map((column) => [column.columnName, column]));
  for (const columnName of ["id", "team_id", "name", "created_at", "updated_at"]) {
    const column = projectColumnByName.get(columnName);
    if (!column) {
      errors.push(`projects.${columnName} is missing.`);
    } else if (column.isNullable !== "NO") {
      errors.push(`projects.${columnName} must be NOT NULL.`);
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

export function validateNotificationStreamEnum(snapshot: RuntimeEnumSnapshot) {
  const labels = snapshot.labels.join(",");
  return labels === "personalNotification,teamAnnouncement"
    ? []
    : [`notification_stream enum must be exactly personalNotification,teamAnnouncement; got ${labels}.`];
}

export function validateNotificationConversationSchema(snapshot: { columns: RuntimeTableColumn[] }) {
  const errors: string[] = [];
  const columnsByTable = snapshot.columns.reduce((map, column) => {
    const columns = map.get(column.tableName) ?? new Map<string, RuntimeTableColumn>();
    columns.set(column.columnName, column);
    map.set(column.tableName, columns);
    return map;
  }, new Map<string, Map<string, RuntimeTableColumn>>());

  const eventColumns = columnsByTable.get("notification_events") ?? new Map();
  for (const columnName of [
    "id",
    "team_id",
    "stream",
    "kind",
    "title",
    "body",
    "target_type",
    "target_id",
    "target_href",
    "created_at",
    "metadata",
  ]) {
    if (!eventColumns.has(columnName)) {
      errors.push(`notification_events.${columnName} is missing.`);
    }
  }

  const receiptColumns = columnsByTable.get("notification_receipts") ?? new Map();
  for (const columnName of ["event_id", "recipient_user_id", "delivered_at", "read_at"]) {
    if (!receiptColumns.has(columnName)) {
      errors.push(`notification_receipts.${columnName} is missing.`);
    }
  }

  return errors;
}

export function validateGitLabOrfChatIntegrationSchema(snapshot: { columns: RuntimeTableColumn[] }) {
  const errors: string[] = [];
  const columnsByTable = snapshot.columns.reduce((map, column) => {
    const columns = map.get(column.tableName) ?? new Map<string, RuntimeTableColumn>();
    columns.set(column.columnName, column);
    map.set(column.tableName, columns);
    return map;
  }, new Map<string, Map<string, RuntimeTableColumn>>());

  const projectColumns = columnsByTable.get("gitlab_orf_project_channels") ?? new Map();
  for (const columnName of [
    "team_id",
    "gitlab_project_id",
    "gitlab_project_path",
    "gitlab_project_url",
    "chat_channel_id",
    "created_at",
    "updated_at",
    "last_seen_at",
  ]) {
    if (!projectColumns.has(columnName)) {
      errors.push(`gitlab_orf_project_channels.${columnName} is missing.`);
    }
  }

  const deliveryColumns = columnsByTable.get("gitlab_orf_event_deliveries") ?? new Map();
  for (const columnName of [
    "team_id",
    "external_event_key",
    "gitlab_project_id",
    "event_type",
    "chat_channel_id",
    "chat_message_id",
    "status",
    "error",
    "received_at",
    "delivered_at",
    "updated_at",
  ]) {
    if (!deliveryColumns.has(columnName)) {
      errors.push(`gitlab_orf_event_deliveries.${columnName} is missing.`);
    }
  }

  return errors;
}

export function validateGitHubOrfChatIntegrationSchema(snapshot: { columns: RuntimeTableColumn[] }) {
  const errors: string[] = [];
  const columnsByTable = snapshot.columns.reduce((map, column) => {
    const columns = map.get(column.tableName) ?? new Map<string, RuntimeTableColumn>();
    columns.set(column.columnName, column);
    map.set(column.tableName, columns);
    return map;
  }, new Map<string, Map<string, RuntimeTableColumn>>());

  const deliveryColumns = columnsByTable.get("github_orf_chat_deliveries") ?? new Map();
  for (const columnName of [
    "delivery_key",
    "repository",
    "event_type",
    "subject",
    "external_id",
    "channel_id",
    "source",
    "status",
    "chat_message_id",
    "error",
    "created_at",
    "updated_at",
  ]) {
    if (!deliveryColumns.has(columnName)) {
      errors.push(`github_orf_chat_deliveries.${columnName} is missing.`);
    }
  }

  return errors;
}

export async function assertRuntimeDatabaseSchema() {
  const { pool } = await import("./client");
  const [
    taskColumnsResult,
    taskConstraintsResult,
    objectiveColumnsResult,
    projectColumnsResult,
    feedbackColumnsResult,
    evidenceColumnsResult,
    feedbackStatusResult,
    notificationStreamResult,
    notificationConversationColumnsResult,
    gitLabOrfChatColumnsResult,
    gitHubOrfChatColumnsResult,
  ] = await Promise.all([
    pool.query<RuntimeSchemaColumn>(
      `
        select
          column_name as "columnName",
          is_nullable as "isNullable"
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = 'tasks'
          and column_name in ('linked_objective_id', 'linked_result_id', 'feedback_origin_id', 'definition_contributor_user_ids')
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
          and table_name = 'projects'
          and column_name in ('id', 'team_id', 'name', 'created_at', 'updated_at')
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
    pool.query<{ label: string }>(
      `
        select e.enumlabel as "label"
        from pg_enum e
        join pg_type t on t.oid = e.enumtypid
        join pg_namespace nsp on nsp.oid = t.typnamespace
        where nsp.nspname = current_schema()
          and t.typname = 'notification_stream'
        order by e.enumsortorder
      `,
    ),
    pool.query<RuntimeTableColumn>(
      `
        select
          table_name as "tableName",
          column_name as "columnName",
          is_nullable as "isNullable"
        from information_schema.columns
        where table_schema = current_schema()
          and table_name in ('notification_events', 'notification_receipts')
      `,
    ),
    pool.query<RuntimeTableColumn>(
      `
        select
          table_name as "tableName",
          column_name as "columnName",
          is_nullable as "isNullable"
        from information_schema.columns
        where table_schema = current_schema()
          and table_name in ('gitlab_orf_project_channels', 'gitlab_orf_event_deliveries')
      `,
    ),
    pool.query<RuntimeTableColumn>(
      `
        select
          table_name as "tableName",
          column_name as "columnName",
          is_nullable as "isNullable"
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = 'github_orf_chat_deliveries'
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
      projectTableColumns: projectColumnsResult.rows,
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
    ...validateNotificationStreamEnum({
      labels: notificationStreamResult.rows.map((row) => row.label),
    }),
    ...validateNotificationConversationSchema({
      columns: notificationConversationColumnsResult.rows,
    }),
    ...validateGitLabOrfChatIntegrationSchema({
      columns: gitLabOrfChatColumnsResult.rows,
    }),
    ...validateGitHubOrfChatIntegrationSchema({
      columns: gitHubOrfChatColumnsResult.rows,
    }),
  ];

  if (errors.length > 0) {
    throw new DatabaseSchemaMismatchError(errors);
  }
}
