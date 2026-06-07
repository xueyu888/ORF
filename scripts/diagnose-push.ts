import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { env } from "../server/env";
import { createPgPoolConfig } from "../server/db/connectionOptions";
import { closeDb } from "../server/db/client";
import { isFirebasePushConfigured } from "../server/push/firebasePushClient";
import { isVivoPushConfigured } from "../server/push/vivoPushClient";
import { chatPushChannelId, sendPushToUsers } from "../server/push/pushService";

const { Pool } = pg;

const androidPackageName = "org.duckdns.orfxueyu.orf";

type CliArgs = {
  help: boolean;
  sendTest: boolean;
  teamId?: string;
  userEmail?: string;
  userId?: string;
  userName?: string;
};

type PushTableCheckRow = {
  table_name: string | null;
};

type ColumnNameRow = {
  column_name: string;
};

type DeviceCountRow = {
  count: string;
  enabled: boolean;
  platform: string;
};

type DeviceSampleRow = {
  app_build: string | null;
  app_version: string | null;
  device_label: string | null;
  device_manufacturer: string | null;
  device_model: string | null;
  enabled: boolean;
  google_play_services_available: boolean | null;
  last_client_update_pushed_at: string | null;
  last_client_update_version: string | null;
  last_seen_at: string | null;
  notification_permission: string | null;
  os_version: string | null;
  platform: string;
  revoked_at: string | null;
  sdk_int: number | null;
  team_id: string;
  updated_at: string;
  user_email: string | null;
  user_id: string;
  user_name: string;
};

type VendorDeviceCountRow = {
  count: string;
  enabled: boolean;
  platform: string;
  vendor: string;
};

type VendorDeviceSampleRow = {
  app_build: string | null;
  app_version: string | null;
  device_label: string | null;
  device_manufacturer: string | null;
  device_model: string | null;
  enabled: boolean;
  last_seen_at: string | null;
  notification_permission: string | null;
  os_version: string | null;
  platform: string;
  revoked_at: string | null;
  sdk_int: number | null;
  team_id: string;
  updated_at: string;
  user_email: string | null;
  user_id: string;
  user_name: string;
  vendor: string;
};

type RegistrationStatusCountRow = {
  count: string;
  platform: string;
  status: string;
};

type RegistrationStatusSampleRow = {
  app_build: string | null;
  app_version: string | null;
  detail: string | null;
  device_label: string | null;
  device_manufacturer: string | null;
  device_model: string | null;
  google_play_services_available: boolean | null;
  notification_permission: string | null;
  os_version: string | null;
  platform: string;
  reason: string | null;
  sdk_int: number | null;
  status: string;
  team_id: string;
  updated_at: string;
  user_email: string | null;
  user_id: string;
  user_name: string;
};

type VendorRegistrationStatusCountRow = {
  count: string;
  platform: string;
  status: string;
  vendor: string;
};

type VendorRegistrationStatusSampleRow = {
  app_build: string | null;
  app_version: string | null;
  detail: string | null;
  device_label: string | null;
  device_manufacturer: string | null;
  device_model: string | null;
  notification_permission: string | null;
  os_version: string | null;
  platform: string;
  reason: string | null;
  sdk_int: number | null;
  status: string;
  team_id: string;
  updated_at: string;
  user_email: string | null;
  user_id: string;
  user_name: string;
  vendor: string;
};

type TestRecipientRow = {
  team_id: string;
  user_email: string | null;
  user_id: string;
  user_name: string;
};

type GoogleServicesCheck = {
  found: boolean;
  packageNames: string[];
  packageMatches: boolean;
  path: string;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { help: false, sendTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--help" || item === "-h") {
      args.help = true;
    } else if (item === "--send-test") {
      args.sendTest = true;
    } else if (item === "--team-id") {
      args.teamId = requireValue(argv, index);
      index += 1;
    } else if (item === "--user-email") {
      args.userEmail = requireValue(argv, index);
      index += 1;
    } else if (item === "--user-id") {
      args.userId = requireValue(argv, index);
      index += 1;
    } else if (item === "--user-name") {
      args.userName = requireValue(argv, index);
      index += 1;
    } else {
      throw new Error(`未知参数：${item}`);
    }
  }
  return args;
}

function requireValue(argv: string[], index: number) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${argv[index]} 缺少参数值`);
  }
  return value;
}

function usage() {
  return [
      "用法：",
      "  npm run push:diagnose",
      "  npm run push:diagnose -- --send-test --user-email <email>",
      "  npm run push:diagnose -- --send-test --user-name <name> [--team-id <teamId>]",
    "",
    "说明：",
    "  默认只检查配置、数据库表和已注册设备，不打印 token、密码或 service account 内容。",
    "  --send-test 会按真实投递逻辑向匹配用户发送一条 Android 系统 Push 测试通知。",
  ].join("\n");
}

function checkGoogleServices(): GoogleServicesCheck {
  const filePath = path.resolve("android/app/google-services.json");
  if (!existsSync(filePath)) {
    return { found: false, packageMatches: false, packageNames: [], path: filePath };
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as {
      client?: Array<{ client_info?: { android_client_info?: { package_name?: string } } }>;
    };
    const packageNames = Array.from(
      new Set(
        (parsed.client ?? [])
          .map((client) => client.client_info?.android_client_info?.package_name?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    );
    return {
      found: true,
      packageMatches: packageNames.includes(androidPackageName),
      packageNames,
      path: filePath,
    };
  } catch {
    return { found: true, packageMatches: false, packageNames: [], path: filePath };
  }
}

function firebaseCredentialSource() {
  if (process.env.ORF_FIREBASE_SERVICE_ACCOUNT_JSON?.trim()) return "ORF_FIREBASE_SERVICE_ACCOUNT_JSON";
  if (process.env.ORF_FIREBASE_SERVICE_ACCOUNT_PATH?.trim()) return "ORF_FIREBASE_SERVICE_ACCOUNT_PATH";
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) return "GOOGLE_APPLICATION_CREDENTIALS";
  return "missing";
}

function vivoCredentialSummary() {
  const missing = [
    ["ORF_VIVO_PUSH_APP_ID", process.env.ORF_VIVO_PUSH_APP_ID],
    ["ORF_VIVO_PUSH_APP_KEY", process.env.ORF_VIVO_PUSH_APP_KEY],
    ["ORF_VIVO_PUSH_APP_SECRET", process.env.ORF_VIVO_PUSH_APP_SECRET],
  ].flatMap(([name, value]) => (typeof value === "string" && value.trim() ? [] : [name]));
  return missing.length === 0 ? "已配置" : `缺失（${missing.join(", ")}）`;
}

function printConfig() {
  const googleServices = checkGoogleServices();
  const credentialSource = firebaseCredentialSource();
  const localGoogleServicesBase64 = Boolean(process.env.ORF_ANDROID_GOOGLE_SERVICES_JSON_BASE64?.trim());

    console.log("== ORF Push 配置 ==");
    console.log(`ORF_PUSH_ENABLED: ${env.ORF_PUSH_ENABLED ? "true" : "false"}`);
    console.log(`Firebase 服务端凭据: ${credentialSource === "missing" ? "缺失" : `已配置（${credentialSource}）`}`);
  console.log(`Firebase Admin 可初始化条件: ${isFirebasePushConfigured() ? "满足" : "不满足"}`);
  console.log(`vivo Push 开关: ${env.ORF_VIVO_PUSH_ENABLED ? "true" : "false"}`);
  console.log(`vivo 服务端凭据: ${vivoCredentialSummary()}`);
  console.log(`vivo 服务端可发送条件: ${isVivoPushConfigured() ? "满足" : "不满足"}`);
  console.log(`本机 google-services.json: ${googleServices.found ? "存在" : "缺失"}`);
  if (googleServices.found) {
    const packageText = googleServices.packageNames.length > 0 ? googleServices.packageNames.join(", ") : "未解析到 package_name";
    console.log(`google-services.json 包名: ${packageText}`);
    console.log(`Android 包名匹配 ${androidPackageName}: ${googleServices.packageMatches ? "是" : "否"}`);
  }
  console.log(`本地 ORF_ANDROID_GOOGLE_SERVICES_JSON_BASE64: ${localGoogleServicesBase64 ? "存在" : "缺失或未暴露"}`);
  console.log("");
}

async function tableExists(pool: pg.Pool) {
  return namedTableExists(pool, "push_devices");
}

async function namedTableExists(pool: pg.Pool, tableName: string) {
  const result = await pool.query<PushTableCheckRow>("SELECT to_regclass($1)::text AS table_name", [tableName]);
  return Boolean(result.rows[0]?.table_name);
}

async function printDeviceState(pool: pg.Pool) {
  const exists = await tableExists(pool);
  console.log("== ORF Push 设备表 ==");
  console.log(`push_devices 表: ${exists ? "存在" : "缺失"}`);
  if (!exists) {
    console.log("建议先运行 npm run db:migrate。");
    console.log("");
    return false;
  }

  const counts = await pool.query<DeviceCountRow>(
    `
      SELECT platform, enabled, count(*)::text AS count
      FROM push_devices
      GROUP BY platform, enabled
      ORDER BY platform, enabled DESC
    `,
  );
  if (counts.rows.length === 0) {
    console.log("已注册设备: 0");
  } else {
    for (const row of counts.rows) {
      console.log(`${row.platform} / ${row.enabled ? "启用" : "停用"}: ${row.count}`);
    }
  }

  const columns = await pushDeviceColumns(pool);
  const samples = await pool.query<DeviceSampleRow>(
    `
      SELECT
        d.team_id,
        d.user_id::text,
        u.name AS user_name,
        u.email AS user_email,
        d.platform,
        d.enabled,
        d.app_version,
        d.app_build,
        d.device_label,
        ${optionalColumn(columns, "device_manufacturer", "text")},
        ${optionalColumn(columns, "device_model", "text")},
        ${optionalColumn(columns, "os_version", "text")},
        ${optionalColumn(columns, "sdk_int", "integer")},
        ${optionalColumn(columns, "google_play_services_available", "boolean")},
        ${optionalColumn(columns, "notification_permission", "text")},
        d.last_client_update_version,
        d.last_client_update_pushed_at::text,
        d.last_seen_at::text,
        d.revoked_at::text,
        d.updated_at::text
      FROM push_devices d
      LEFT JOIN users u ON u.id = d.user_id
      ORDER BY d.updated_at DESC
      LIMIT 20
    `,
  );
  if (samples.rows.length > 0) {
    console.log("最近设备样本（不含 token）:");
    for (const row of samples.rows) {
      console.log(
        [
          `- ${row.user_name}`,
          row.user_email ? `<${row.user_email}>` : "",
          `team=${row.team_id}`,
          `platform=${row.platform}`,
          `enabled=${row.enabled}`,
          `version=${row.app_version ?? "unknown"}`,
          `device=${deviceSummary(row)}`,
          `gms=${gmsSummary(row.google_play_services_available)}`,
          `notification=${row.notification_permission ?? "unknown"}`,
          `lastSeen=${row.last_seen_at ?? "never"}`,
          row.revoked_at ? `revokedAt=${row.revoked_at}` : "",
        ].filter(Boolean).join(" "),
      );
    }
  }
  console.log("");
  return true;
}

async function printVendorDeviceState(pool: pg.Pool) {
  const exists = await namedTableExists(pool, "push_vendor_devices");
  console.log("== ORF 厂商 Push 设备表 ==");
  console.log(`push_vendor_devices 表: ${exists ? "存在" : "缺失"}`);
  if (!exists) {
    console.log("建议先运行 npm run db:migrate。");
    console.log("");
    return false;
  }

  const counts = await pool.query<VendorDeviceCountRow>(
    `
      SELECT vendor, platform, enabled, count(*)::text AS count
      FROM push_vendor_devices
      GROUP BY vendor, platform, enabled
      ORDER BY vendor, platform, enabled DESC
    `,
  );
  if (counts.rows.length === 0) {
    console.log("已注册厂商设备: 0");
  } else {
    for (const row of counts.rows) {
      console.log(`${row.vendor} / ${row.platform} / ${row.enabled ? "启用" : "停用"}: ${row.count}`);
    }
  }

  const samples = await pool.query<VendorDeviceSampleRow>(
    `
      SELECT
        d.team_id,
        d.user_id::text,
        u.name AS user_name,
        u.email AS user_email,
        d.vendor,
        d.platform,
        d.enabled,
        d.app_version,
        d.app_build,
        d.device_label,
        d.device_manufacturer,
        d.device_model,
        d.os_version,
        d.sdk_int,
        d.notification_permission,
        d.last_seen_at::text,
        d.revoked_at::text,
        d.updated_at::text
      FROM push_vendor_devices d
      LEFT JOIN users u ON u.id = d.user_id
      ORDER BY d.updated_at DESC
      LIMIT 20
    `,
  );
  if (samples.rows.length > 0) {
    console.log("最近厂商设备样本（不含 RegID/token）:");
    for (const row of samples.rows) {
      console.log(
        [
          `- ${row.user_name}`,
          row.user_email ? `<${row.user_email}>` : "",
          `team=${row.team_id}`,
          `vendor=${row.vendor}`,
          `platform=${row.platform}`,
          `enabled=${row.enabled}`,
          `version=${row.app_version ?? "unknown"}`,
          `device=${vendorDeviceSummary(row)}`,
          `notification=${row.notification_permission ?? "unknown"}`,
          `lastSeen=${row.last_seen_at ?? "never"}`,
          row.revoked_at ? `revokedAt=${row.revoked_at}` : "",
        ].filter(Boolean).join(" "),
      );
    }
  }
  console.log("");
  return true;
}

async function printRegistrationStatusState(pool: pg.Pool) {
  const exists = await namedTableExists(pool, "push_registration_statuses");
  console.log("== ORF Push 注册状态 ==");
  console.log(`push_registration_statuses 表: ${exists ? "存在" : "缺失"}`);
  if (!exists) {
    console.log("建议先运行 npm run db:migrate。");
    console.log("");
    return;
  }

  const counts = await pool.query<RegistrationStatusCountRow>(
    `
      SELECT platform, status, count(*)::text AS count
      FROM push_registration_statuses
      GROUP BY platform, status
      ORDER BY platform, status
    `,
  );
  if (counts.rows.length === 0) {
    console.log("已上报注册状态: 0");
  } else {
    for (const row of counts.rows) {
      console.log(`${row.platform} / ${row.status}: ${row.count}`);
    }
  }

  const samples = await pool.query<RegistrationStatusSampleRow>(
    `
      SELECT
        s.team_id,
        s.user_id::text,
        u.name AS user_name,
        u.email AS user_email,
        s.platform,
        s.status,
        s.reason,
        s.detail,
        s.app_version,
        s.app_build,
        s.device_label,
        s.device_manufacturer,
        s.device_model,
        s.os_version,
        s.sdk_int,
        s.google_play_services_available,
        s.notification_permission,
        s.updated_at::text
      FROM push_registration_statuses s
      LEFT JOIN users u ON u.id = s.user_id
      ORDER BY s.updated_at DESC
      LIMIT 20
    `,
  );
  if (samples.rows.length > 0) {
    console.log("最近注册状态样本（不含 token）:");
    for (const row of samples.rows) {
      console.log(
        [
          `- ${row.user_name}`,
          row.user_email ? `<${row.user_email}>` : "",
          `team=${row.team_id}`,
          `platform=${row.platform}`,
          `status=${row.status}`,
          row.reason ? `reason=${row.reason}` : "",
          row.detail ? `detail=${row.detail}` : "",
          `version=${row.app_version ?? "unknown"}`,
          `device=${registrationDeviceSummary(row)}`,
          `gms=${gmsSummary(row.google_play_services_available)}`,
          `notification=${row.notification_permission ?? "unknown"}`,
          `updated=${row.updated_at}`,
        ].filter(Boolean).join(" "),
      );
    }
  }
  console.log("");
}

async function printVendorRegistrationStatusState(pool: pg.Pool) {
  const exists = await namedTableExists(pool, "push_vendor_registration_statuses");
  console.log("== ORF 厂商 Push 注册状态 ==");
  console.log(`push_vendor_registration_statuses 表: ${exists ? "存在" : "缺失"}`);
  if (!exists) {
    console.log("建议先运行 npm run db:migrate。");
    console.log("");
    return;
  }

  const counts = await pool.query<VendorRegistrationStatusCountRow>(
    `
      SELECT vendor, platform, status, count(*)::text AS count
      FROM push_vendor_registration_statuses
      GROUP BY vendor, platform, status
      ORDER BY vendor, platform, status
    `,
  );
  if (counts.rows.length === 0) {
    console.log("已上报厂商注册状态: 0");
  } else {
    for (const row of counts.rows) {
      console.log(`${row.vendor} / ${row.platform} / ${row.status}: ${row.count}`);
    }
  }

  const samples = await pool.query<VendorRegistrationStatusSampleRow>(
    `
      SELECT
        s.team_id,
        s.user_id::text,
        u.name AS user_name,
        u.email AS user_email,
        s.vendor,
        s.platform,
        s.status,
        s.reason,
        s.detail,
        s.app_version,
        s.app_build,
        s.device_label,
        s.device_manufacturer,
        s.device_model,
        s.os_version,
        s.sdk_int,
        s.notification_permission,
        s.updated_at::text
      FROM push_vendor_registration_statuses s
      LEFT JOIN users u ON u.id = s.user_id
      ORDER BY s.updated_at DESC
      LIMIT 20
    `,
  );
  if (samples.rows.length > 0) {
    console.log("最近厂商注册状态样本（不含 RegID/token）:");
    for (const row of samples.rows) {
      console.log(
        [
          `- ${row.user_name}`,
          row.user_email ? `<${row.user_email}>` : "",
          `team=${row.team_id}`,
          `vendor=${row.vendor}`,
          `platform=${row.platform}`,
          `status=${row.status}`,
          row.reason ? `reason=${row.reason}` : "",
          row.detail ? `detail=${row.detail}` : "",
          `version=${row.app_version ?? "unknown"}`,
          `device=${vendorRegistrationDeviceSummary(row)}`,
          `notification=${row.notification_permission ?? "unknown"}`,
          `updated=${row.updated_at}`,
        ].filter(Boolean).join(" "),
      );
    }
  }
  console.log("");
}

async function pushDeviceColumns(pool: pg.Pool) {
  const result = await pool.query<ColumnNameRow>(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = ANY(current_schemas(false))
        AND table_name = 'push_devices'
    `,
  );
  return new Set(result.rows.map((row) => row.column_name));
}

function optionalColumn(columns: Set<string>, columnName: string, postgresType: string) {
  return columns.has(columnName) ? `d.${columnName}` : `null::${postgresType} AS ${columnName}`;
}

function deviceSummary(row: DeviceSampleRow) {
  const parts = [row.device_manufacturer, row.device_model, row.os_version ? `Android ${row.os_version}` : null, row.sdk_int ? `SDK ${row.sdk_int}` : null]
    .map((item) => item?.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join("/") : row.device_label ?? "unknown";
}

function gmsSummary(value: boolean | null) {
  if (value === true) return "available";
  if (value === false) return "unavailable";
  return "unknown";
}

function registrationDeviceSummary(row: RegistrationStatusSampleRow) {
  const parts = [row.device_manufacturer, row.device_model, row.os_version ? `Android ${row.os_version}` : null, row.sdk_int ? `SDK ${row.sdk_int}` : null]
    .map((item) => item?.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join("/") : row.device_label ?? "unknown";
}

function vendorDeviceSummary(row: VendorDeviceSampleRow) {
  const parts = [row.device_manufacturer, row.device_model, row.os_version ? `Android ${row.os_version}` : null, row.sdk_int ? `SDK ${row.sdk_int}` : null]
    .map((item) => item?.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join("/") : row.device_label ?? "unknown";
}

function vendorRegistrationDeviceSummary(row: VendorRegistrationStatusSampleRow) {
  const parts = [row.device_manufacturer, row.device_model, row.os_version ? `Android ${row.os_version}` : null, row.sdk_int ? `SDK ${row.sdk_int}` : null]
    .map((item) => item?.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join("/") : row.device_label ?? "unknown";
}

async function loadTestRecipients(pool: pg.Pool, args: CliArgs) {
  if (!args.userId && !args.userEmail && !args.userName) {
    throw new Error("--send-test 必须配合 --user-id、--user-email 或 --user-name，避免误发给全员。");
  }

  const params: string[] = [];
  const conditions = [
    "COALESCE(u.status, 'active') = 'active'",
  ];

  if (args.teamId) {
    params.push(args.teamId);
    conditions.push(`tm.team_id = $${params.length}`);
  }
  if (args.userId) {
    params.push(args.userId);
    conditions.push(`u.id::text = $${params.length}`);
  }
  if (args.userEmail) {
    params.push(args.userEmail.toLowerCase());
    conditions.push(`lower(u.email) = $${params.length}`);
  }
  if (args.userName) {
    params.push(args.userName);
    conditions.push(`u.name = $${params.length}`);
  }

  const result = await pool.query<TestRecipientRow>(
    `
      SELECT tm.team_id, u.id::text AS user_id, u.name AS user_name, u.email AS user_email
      FROM users u
      INNER JOIN team_members tm ON tm.user_id = u.id
      WHERE ${conditions.join("\n        AND ")}
      ORDER BY tm.team_id, u.name
    `,
    params,
  );
  return result.rows;
}

async function sendTestPush(pool: pg.Pool, args: CliArgs) {
  console.log("== ORF Push 测试发送 ==");
  if (!env.ORF_PUSH_ENABLED) {
    throw new Error("ORF Push 未启用：需要 ORF_PUSH_ENABLED=true。");
  }
  if (!isFirebasePushConfigured() && !isVivoPushConfigured()) {
    throw new Error("没有可用的系统 Push 服务端通道：需要配置 Firebase 或 vivo Push。");
  }

  const recipients = await loadTestRecipients(pool, args);
  if (recipients.length === 0) {
    throw new Error("没有找到匹配的活跃 ORF 用户。请确认 --user-id、--user-email 或 --user-name。");
  }

  const teams = Array.from(new Set(recipients.map((recipient) => recipient.team_id)));
  if (teams.length !== 1) {
    throw new Error("匹配到多个 team 的用户，请加 --team-id 缩小范围。");
  }

  const result = await sendPushToUsers({
    body: "如果手机后台或锁屏能看到这条通知，ORF Android Push 链路已经打通。",
    channelId: chatPushChannelId,
    collapseKey: "orf-push-diagnostic",
    data: {
      diagnostic: "true",
      targetPath: "/chat",
      teamId: teams[0] ?? "",
    },
    kind: "diagnostic.push",
    recipientUserIds: recipients.map((recipient) => recipient.user_id),
    tag: `orf-push-diagnostic-${Date.now()}`,
    teamId: teams[0] ?? "",
    targetPath: "/chat",
    title: "ORF Push 诊断",
  });

  const users = Array.from(new Set(recipients.map((recipient) => `${recipient.user_name}${recipient.user_email ? ` <${recipient.user_email}>` : ""}`)));
  console.log(`目标用户: ${users.join(", ")}`);
  console.log(`目标设备数: ${result.targetDeviceCount}`);
  console.log(`投递成功: ${result.successCount}`);
  console.log(`投递失败: ${result.failureCount}`);
  console.log(`无效 token: ${result.invalidTokenCount}`);
  if (result.targetDeviceCount === 0) {
    console.log("没有可投递设备。请先安装新版 APK，打开应用、登录并授权通知；vivo 设备还需要厂商 Push RegID 注册成功。");
  }
  console.log("");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  printConfig();

  const pool = new Pool(createPgPoolConfig(env.DATABASE_URL));
  try {
    const hasPushTable = await printDeviceState(pool);
    const hasVendorPushTable = await printVendorDeviceState(pool);
    await printRegistrationStatusState(pool);
    await printVendorRegistrationStatusState(pool);
    if (args.sendTest) {
      if (!hasPushTable && !hasVendorPushTable) throw new Error("Push 设备表不存在，不能发送测试 Push。");
      await sendTestPush(pool, args);
    }
  } finally {
    await pool.end();
    await closeDb().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
