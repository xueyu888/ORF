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

  const projectId = columnByName.get("project_id");
  if (!projectId) {
    errors.push("feedback.project_id is missing.");
  } else if (projectId.isNullable !== "YES") {
    errors.push("feedback.project_id must be nullable.");
  }

  for (const columnName of ["linked_objective_id", "linked_result_id", "source"]) {
    if (columnByName.has(columnName)) {
      errors.push(`feedback.${columnName} must be dropped; feedback is a team issue, not a metric-bound signal.`);
    }
  }

  return errors;
}

export function validateFeedbackMetadataSubscriptionSchema(snapshot: { columns: RuntimeTableColumn[] }) {
  const errors: string[] = [];
  const columnsByTable = snapshot.columns.reduce((map, column) => {
    const columns = map.get(column.tableName) ?? new Map<string, RuntimeTableColumn>();
    columns.set(column.columnName, column);
    map.set(column.tableName, columns);
    return map;
  }, new Map<string, Map<string, RuntimeTableColumn>>());

  const activityColumns = columnsByTable.get("feedback_activity_events") ?? new Map();
  for (const columnName of ["id", "team_id", "feedback_id", "actor_name", "action", "metadata", "created_at"]) {
    const column = activityColumns.get(columnName);
    if (!column) {
      errors.push(`feedback_activity_events.${columnName} is missing.`);
    } else if (column.isNullable !== "NO") {
      errors.push(`feedback_activity_events.${columnName} must be NOT NULL.`);
    }
  }
  if (!activityColumns.has("actor_user_id")) {
    errors.push("feedback_activity_events.actor_user_id is missing.");
  }

  const subscriptionColumns = columnsByTable.get("feedback_subscriptions") ?? new Map();
  for (const columnName of ["team_id", "feedback_id", "user_id", "mode", "created_at", "updated_at"]) {
    const column = subscriptionColumns.get(columnName);
    if (!column) {
      errors.push(`feedback_subscriptions.${columnName} is missing.`);
    } else if (column.isNullable !== "NO") {
      errors.push(`feedback_subscriptions.${columnName} must be NOT NULL.`);
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

export function validateDriveContextTypeEnum(snapshot: RuntimeEnumSnapshot) {
  const labels = new Set(snapshot.labels);
  const errors: string[] = [];
  for (const label of ["project", "objective", "result", "task", "feedback", "workLog", "chatChannel", "chatMessage", "chatThread"]) {
    if (!labels.has(label)) {
      errors.push(`drive_context_type enum value ${label} is missing.`);
    }
  }
  return errors;
}

export function validateDrivePreviewKindEnum(snapshot: RuntimeEnumSnapshot) {
  const labels = new Set(snapshot.labels);
  const errors: string[] = [];
  for (const label of ["download", "docx", "image", "markdown", "pdf", "text"]) {
    if (!labels.has(label)) {
      errors.push(`drive_file_preview_kind enum value ${label} is missing.`);
    }
  }
  return errors;
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

  const deliveryColumns = columnsByTable.get("notification_deliveries") ?? new Map();
  for (const columnName of [
    "id",
    "event_id",
    "recipient_user_id",
    "channel",
    "status",
    "destination_id",
    "message_id",
    "attempts",
    "last_error",
    "next_attempt_at",
    "delivered_at",
    "created_at",
    "updated_at",
  ]) {
    if (!deliveryColumns.has(columnName)) {
      errors.push(`notification_deliveries.${columnName} is missing.`);
    }
  }

  return errors;
}

export function validateSystemChatNotificationSchema(snapshot: { columns: RuntimeTableColumn[] }) {
  const errors: string[] = [];
  const columnsByTable = snapshot.columns.reduce((map, column) => {
    const columns = map.get(column.tableName) ?? new Map<string, RuntimeTableColumn>();
    columns.set(column.columnName, column);
    map.set(column.tableName, columns);
    return map;
  }, new Map<string, Map<string, RuntimeTableColumn>>());

  const channelColumns = columnsByTable.get("chat_channels") ?? new Map();
  for (const columnName of ["system_kind", "system_recipient_user_id"]) {
    if (!channelColumns.has(columnName)) {
      errors.push(`chat_channels.${columnName} is missing.`);
    }
  }

  const messageColumns = columnsByTable.get("chat_messages") ?? new Map();
  for (const columnName of ["source", "system_metadata"]) {
    if (!messageColumns.has(columnName)) {
      errors.push(`chat_messages.${columnName} is missing.`);
    }
  }

  return errors;
}

export function validateDriveManagementSchema(snapshot: { columns: RuntimeTableColumn[] }) {
  const errors: string[] = [];
  const columnsByTable = snapshot.columns.reduce((map, column) => {
    const columns = map.get(column.tableName) ?? new Map<string, RuntimeTableColumn>();
    columns.set(column.columnName, column);
    map.set(column.tableName, columns);
    return map;
  }, new Map<string, Map<string, RuntimeTableColumn>>());

  const nodeColumns = columnsByTable.get("drive_nodes") ?? new Map();
  for (const columnName of ["id", "team_id", "node_type", "name", "created_at", "updated_at"]) {
    const column = nodeColumns.get(columnName);
    if (!column) {
      errors.push(`drive_nodes.${columnName} is missing.`);
    } else if (column.isNullable !== "NO") {
      errors.push(`drive_nodes.${columnName} must be NOT NULL.`);
    }
  }
  for (const columnName of ["parent_id", "created_by", "updated_by", "deleted_by", "deleted_at"]) {
    if (!nodeColumns.has(columnName)) {
      errors.push(`drive_nodes.${columnName} is missing.`);
    }
  }

  const fileColumns = columnsByTable.get("drive_files") ?? new Map();
  for (const columnName of [
    "id",
    "node_id",
    "team_id",
    "object_key",
    "file_name",
    "mime_type",
    "file_size",
    "preview_kind",
    "created_at",
  ]) {
    const column = fileColumns.get(columnName);
    if (!column) {
      errors.push(`drive_files.${columnName} is missing.`);
    } else if (column.isNullable !== "NO") {
      errors.push(`drive_files.${columnName} must be NOT NULL.`);
    }
  }
  for (const columnName of ["preview_object_key", "preview_mime_type", "preview_file_size", "preview_generated_at", "preview_error", "width", "height", "created_by"]) {
    if (!fileColumns.has(columnName)) {
      errors.push(`drive_files.${columnName} is missing.`);
    }
  }

  const linkColumns = columnsByTable.get("chat_channel_drive_links") ?? new Map();
  for (const columnName of ["id", "team_id", "channel_id", "node_id", "is_default_upload_target", "created_at", "updated_at"]) {
    const column = linkColumns.get(columnName);
    if (!column) {
      errors.push(`chat_channel_drive_links.${columnName} is missing.`);
    } else if (column.isNullable !== "NO") {
      errors.push(`chat_channel_drive_links.${columnName} must be NOT NULL.`);
    }
  }
  for (const columnName of ["label", "created_by"]) {
    if (!linkColumns.has(columnName)) {
      errors.push(`chat_channel_drive_links.${columnName} is missing.`);
    }
  }

  const versionColumns = columnsByTable.get("drive_file_versions") ?? new Map();
  for (const columnName of [
    "id",
    "team_id",
    "file_id",
    "node_id",
    "version_number",
    "object_key",
    "file_name",
    "mime_type",
    "file_size",
    "preview_kind",
    "created_at",
  ]) {
    const column = versionColumns.get(columnName);
    if (!column) {
      errors.push(`drive_file_versions.${columnName} is missing.`);
    } else if (column.isNullable !== "NO") {
      errors.push(`drive_file_versions.${columnName} must be NOT NULL.`);
    }
  }
  for (const columnName of ["preview_object_key", "preview_mime_type", "preview_file_size", "preview_generated_at", "preview_error", "width", "height", "created_by"]) {
    if (!versionColumns.has(columnName)) {
      errors.push(`drive_file_versions.${columnName} is missing.`);
    }
  }

  const eventColumns = columnsByTable.get("drive_node_events") ?? new Map();
  for (const columnName of ["id", "team_id", "node_id", "action", "metadata", "created_at"]) {
    const column = eventColumns.get(columnName);
    if (!column) {
      errors.push(`drive_node_events.${columnName} is missing.`);
    } else if (column.isNullable !== "NO") {
      errors.push(`drive_node_events.${columnName} must be NOT NULL.`);
    }
  }
  if (!eventColumns.has("actor_user_id")) {
    errors.push("drive_node_events.actor_user_id is missing.");
  }

  const contextColumns = columnsByTable.get("drive_node_context_links") ?? new Map();
  for (const columnName of ["id", "team_id", "node_id", "context_type", "context_id", "created_at"]) {
    const column = contextColumns.get(columnName);
    if (!column) {
      errors.push(`drive_node_context_links.${columnName} is missing.`);
    } else if (column.isNullable !== "NO") {
      errors.push(`drive_node_context_links.${columnName} must be NOT NULL.`);
    }
  }
  for (const columnName of ["label", "created_by"]) {
    if (!contextColumns.has(columnName)) {
      errors.push(`drive_node_context_links.${columnName} is missing.`);
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

  const subscriptionColumns = columnsByTable.get("gitlab_orf_channel_subscriptions") ?? new Map();
  for (const columnName of [
    "id",
    "team_id",
    "chat_channel_id",
    "gitlab_group_path",
    "gitlab_project_id",
    "gitlab_project_path",
    "gitlab_project_url",
    "event_types",
    "enabled",
    "created_by_user_id",
    "created_at",
    "updated_at",
  ]) {
    if (!subscriptionColumns.has(columnName)) {
      errors.push(`gitlab_orf_channel_subscriptions.${columnName} is missing.`);
    }
  }

  const deliveryColumns = columnsByTable.get("gitlab_orf_event_deliveries") ?? new Map();
  for (const columnName of [
    "team_id",
    "external_event_key",
    "subscription_id",
    "gitlab_project_id",
    "gitlab_project_path",
    "gitlab_project_url",
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

export function validateWorkLogReminderStateSchema(snapshot: { columns: RuntimeTableColumn[] }) {
  const errors: string[] = [];
  const columnsByName = new Map(snapshot.columns.map((column) => [column.columnName, column]));
  for (const columnName of [
    "team_id",
    "user_id",
    "status",
    "window_start_date",
    "window_end_date",
    "required_dates",
    "missing_dates",
    "snooze_count",
    "created_at",
    "updated_at",
  ]) {
    const column = columnsByName.get(columnName);
    if (!column) {
      errors.push(`work_log_reminder_states.${columnName} is missing.`);
    } else if (column.isNullable !== "NO") {
      errors.push(`work_log_reminder_states.${columnName} must be NOT NULL.`);
    }
  }

  for (const columnName of ["last_reminded_at", "next_remind_at", "notification_event_id", "resolved_at"]) {
    if (!columnsByName.has(columnName)) {
      errors.push(`work_log_reminder_states.${columnName} is missing.`);
    }
  }

  return errors;
}

export function validateChatPushDeliverySchema(snapshot: {
  columns: RuntimeTableColumn[];
  constraints: RuntimeSchemaConstraint[];
}) {
  const columns = new Map(snapshot.columns.map((column) => [column.columnName, column]));
  const errors: string[] = [];
  for (const columnName of [
    "id", "message_id", "team_id", "channel_id", "recipient_user_id",
    "status", "attempts", "target_count", "success_count", "failure_count", "created_at", "updated_at",
  ]) {
    const column = columns.get(columnName);
    if (!column) errors.push(`chat_push_deliveries.${columnName} is missing.`);
    else if (column.isNullable !== "NO") errors.push(`chat_push_deliveries.${columnName} must be NOT NULL.`);
  }
  for (const columnName of ["outcome", "last_error", "next_attempt_at", "lease_expires_at", "completed_at"]) {
    if (!columns.has(columnName)) errors.push(`chat_push_deliveries.${columnName} is missing.`);
  }
  if (columns.has("transport")) {
    errors.push("chat_push_deliveries.transport must not exist; this queue is push-only.");
  }

  const constraintByName = new Map(snapshot.constraints.map((constraint) => [constraint.constraintName, constraint]));
  const statusDefinition = constraintByName.get("chat_push_deliveries_status_check")?.definition.toLowerCase() ?? "";
  for (const status of ["pending", "processing", "retry_scheduled", "completed", "dead_letter"]) {
    if (!statusDefinition.includes(`'${status}'`)) {
      errors.push(`chat_push_deliveries status ${status} is missing from the status guard.`);
    }
  }
  if (statusDefinition.includes("'delivered'") || statusDefinition.includes("'failed'")) {
    errors.push("chat_push_deliveries legacy delivered/failed statuses must be removed.");
  }

  const outcomeDefinition = constraintByName.get("chat_push_deliveries_outcome_check")?.definition.toLowerCase() ?? "";
  for (const outcome of [
    "legacy_processed", "push_accepted",
    "push_partially_accepted", "push_rejected", "no_push_device", "push_disabled", "not_applicable", "failed",
  ]) {
    if (!outcomeDefinition.includes(`'${outcome}'`)) {
      errors.push(`chat_push_deliveries outcome ${outcome} is missing from the outcome guard.`);
    }
  }
  for (const retiredOutcome of ["sent_to_connection", "no_online_subscriber"]) {
    if (outcomeDefinition.includes(`'${retiredOutcome}'`)) {
      errors.push(`chat_push_deliveries must not retain realtime outcome ${retiredOutcome}.`);
    }
  }
  for (const constraintName of [
    "chat_push_deliveries_counts_check",
    "chat_push_deliveries_state_shape_check",
  ]) {
    if (!constraintByName.has(constraintName)) {
      errors.push(`${constraintName} is missing.`);
    }
  }
  return errors;
}

export function validateLegacyRealtimeDeliveryArchiveSchema(snapshot: { columns: RuntimeTableColumn[] }) {
  const columns = new Map(snapshot.columns.map((column) => [column.columnName, column]));
  const errors: string[] = [];
  for (const columnName of ["id", "status", "final_reason", "original_status", "completed_at", "purge_after"]) {
    const column = columns.get(columnName);
    if (!column) errors.push(`chat_legacy_realtime_deliveries.${columnName} is missing.`);
    else if (column.isNullable !== "NO") errors.push(`chat_legacy_realtime_deliveries.${columnName} must be NOT NULL.`);
  }
  return errors;
}

export function validateClientUpdateReceiptSchema(snapshot: { columns: RuntimeTableColumn[] }) {
  const columns = new Map(snapshot.columns.map((column) => [column.columnName, column]));
  const errors: string[] = [];
  for (const columnName of [
    "team_id",
    "user_id",
    "release_version",
    "platform",
    "current_version",
    "checked_at",
    "created_at",
    "updated_at",
  ]) {
    const column = columns.get(columnName);
    if (!column) errors.push(`client_update_receipts.${columnName} is missing.`);
    else if (column.isNullable !== "NO") errors.push(`client_update_receipts.${columnName} must be NOT NULL.`);
  }
  for (const columnName of ["prompted_at", "install_started_at", "activated_at"]) {
    if (!columns.has(columnName)) errors.push(`client_update_receipts.${columnName} is missing.`);
  }
  return errors;
}

export function validateChatSyncEventSchema(snapshot: {
  columns: RuntimeTableColumn[];
  constraints: RuntimeSchemaConstraint[];
}) {
  const columns = new Map(snapshot.columns.map((column) => [column.columnName, column]));
  const errors: string[] = [];
  for (const columnName of [
    "seq",
    "team_id",
    "protocol_version",
    "event_type",
    "object_type",
    "object_id",
    "channel_id",
    "occurred_at",
    "metadata_json",
  ]) {
    const column = columns.get(columnName);
    if (!column) errors.push(`chat_sync_events.${columnName} is missing.`);
    else if (column.isNullable !== "NO") errors.push(`chat_sync_events.${columnName} must be NOT NULL.`);
  }
  if (!columns.has("actor_user_id")) errors.push("chat_sync_events.actor_user_id is missing.");
  if (!snapshot.constraints.some((constraint) => constraint.constraintName === "chat_sync_events_metadata_keys_check")) {
    errors.push("chat_sync_events metadata key guard is missing.");
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
    feedbackMetadataSubscriptionColumnsResult,
    evidenceColumnsResult,
    feedbackStatusResult,
    notificationStreamResult,
    driveContextTypeResult,
    drivePreviewKindResult,
    notificationConversationColumnsResult,
    systemChatNotificationColumnsResult,
    driveManagementColumnsResult,
    gitLabOrfChatColumnsResult,
    gitHubOrfChatColumnsResult,
    workLogReminderStateColumnsResult,
    chatPushDeliveryColumnsResult,
    chatPushDeliveryConstraintsResult,
    legacyRealtimeDeliveryArchiveColumnsResult,
    clientUpdateReceiptColumnsResult,
    chatSyncEventColumnsResult,
    chatSyncEventConstraintsResult,
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
          and column_name in ('project_id', 'linked_objective_id', 'linked_result_id', 'source')
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
          and table_name in ('feedback_activity_events', 'feedback_subscriptions')
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
    pool.query<{ label: string }>(
      `
        select e.enumlabel as "label"
        from pg_enum e
        join pg_type t on t.oid = e.enumtypid
        join pg_namespace nsp on nsp.oid = t.typnamespace
        where nsp.nspname = current_schema()
          and t.typname = 'drive_context_type'
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
          and t.typname = 'drive_file_preview_kind'
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
          and table_name in ('notification_events', 'notification_receipts', 'notification_deliveries')
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
          and table_name in ('chat_channels', 'chat_messages')
          and column_name in ('system_kind', 'system_recipient_user_id', 'source', 'system_metadata')
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
          and table_name in ('drive_nodes', 'drive_files', 'drive_file_versions', 'drive_node_events', 'drive_node_context_links', 'chat_channel_drive_links')
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
          and table_name in ('gitlab_orf_channel_subscriptions', 'gitlab_orf_event_deliveries')
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
    pool.query<RuntimeTableColumn>(
      `
        select
          table_name as "tableName",
          column_name as "columnName",
          is_nullable as "isNullable"
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = 'work_log_reminder_states'
      `,
    ),
    pool.query<RuntimeTableColumn>(
      `
        select table_name as "tableName", column_name as "columnName", is_nullable as "isNullable"
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = 'chat_push_deliveries'
      `,
    ),
    pool.query<RuntimeSchemaConstraint>(
      `
        select con.conname as "constraintName", pg_get_constraintdef(con.oid) as "definition"
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        join pg_namespace nsp on nsp.oid = rel.relnamespace
        where nsp.nspname = current_schema()
          and rel.relname = 'chat_push_deliveries'
          and con.contype = 'c'
      `,
    ),
    pool.query<RuntimeTableColumn>(
      `
        select table_name as "tableName", column_name as "columnName", is_nullable as "isNullable"
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = 'chat_legacy_realtime_deliveries'
      `,
    ),
    pool.query<RuntimeTableColumn>(
      `
        select table_name as "tableName", column_name as "columnName", is_nullable as "isNullable"
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = 'client_update_receipts'
      `,
    ),
    pool.query<RuntimeTableColumn>(
      `
        select table_name as "tableName", column_name as "columnName", is_nullable as "isNullable"
        from information_schema.columns
        where table_schema = current_schema()
          and table_name = 'chat_sync_events'
      `,
    ),
    pool.query<RuntimeSchemaConstraint>(
      `
        select con.conname as "constraintName", pg_get_constraintdef(con.oid) as "definition"
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        join pg_namespace nsp on nsp.oid = rel.relnamespace
        where nsp.nspname = current_schema()
          and rel.relname = 'chat_sync_events'
          and con.contype = 'c'
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
    ...validateFeedbackMetadataSubscriptionSchema({
      columns: feedbackMetadataSubscriptionColumnsResult.rows,
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
    ...validateDriveContextTypeEnum({
      labels: driveContextTypeResult.rows.map((row) => row.label),
    }),
    ...validateDrivePreviewKindEnum({
      labels: drivePreviewKindResult.rows.map((row) => row.label),
    }),
    ...validateNotificationConversationSchema({
      columns: notificationConversationColumnsResult.rows,
    }),
    ...validateSystemChatNotificationSchema({
      columns: systemChatNotificationColumnsResult.rows,
    }),
    ...validateDriveManagementSchema({
      columns: driveManagementColumnsResult.rows,
    }),
    ...validateGitLabOrfChatIntegrationSchema({
      columns: gitLabOrfChatColumnsResult.rows,
    }),
    ...validateGitHubOrfChatIntegrationSchema({
      columns: gitHubOrfChatColumnsResult.rows,
    }),
    ...validateWorkLogReminderStateSchema({
      columns: workLogReminderStateColumnsResult.rows,
    }),
    ...validateChatPushDeliverySchema({
      columns: chatPushDeliveryColumnsResult.rows,
      constraints: chatPushDeliveryConstraintsResult.rows,
    }),
    ...validateLegacyRealtimeDeliveryArchiveSchema({ columns: legacyRealtimeDeliveryArchiveColumnsResult.rows }),
    ...validateClientUpdateReceiptSchema({
      columns: clientUpdateReceiptColumnsResult.rows,
    }),
    ...validateChatSyncEventSchema({
      columns: chatSyncEventColumnsResult.rows,
      constraints: chatSyncEventConstraintsResult.rows,
    }),
  ];

  if (errors.length > 0) {
    throw new DatabaseSchemaMismatchError(errors);
  }
}
