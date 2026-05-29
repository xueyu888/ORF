import "dotenv/config";
import pg from "pg";
import { createPgPoolConfig } from "../server/db/connectionOptions";

const { Pool } = pg;

type LedgerAuditRow = {
  created_at: string;
  ledger_id: string;
  member_name: string;
  objective_id: string;
  objective_title: string | null;
  points: number;
  reason: string;
  team_id: string;
  team_name: string | null;
  user_email: string | null;
};

function auditTeamId() {
  return process.env.ORF_AUDIT_TEAM_ID ?? "team-ai-app";
}

function reasonsFor(row: LedgerAuditRow) {
  const reasons: string[] = [];
  const text = `${row.ledger_id} ${row.objective_id} ${row.member_name} ${row.objective_title ?? ""} ${row.reason} ${row.user_email ?? ""}`;

  if (/\be2e\b/i.test(text) || /e2e/i.test(row.user_email ?? "")) {
    reasons.push("e2e marker");
  }

  if (/\bdemo\b/i.test(row.ledger_id) || /\bdemo\b/i.test(row.objective_id)) {
    reasons.push("demo seed id");
  }

  if (/^(test|测试)/i.test((row.objective_title ?? "").trim())) {
    reasons.push("test-like objective title");
  }

  if (/^(123+\d*|撒打算)$/.test((row.objective_title ?? "").trim())) {
    reasons.push("manual scratch objective title");
  }

  return reasons;
}

async function main() {
  const connectionString = process.env.DATABASE_URL ?? process.env.REMOTE_DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or REMOTE_DATABASE_URL is required.");
  }

  const teamId = auditTeamId();
  const pool = new Pool(createPgPoolConfig(connectionString));
  try {
    const result = await pool.query<LedgerAuditRow>(
      `
        SELECT
          pl.id AS ledger_id,
          pl.team_id,
          t.name AS team_name,
          pl.objective_id,
          o.title AS objective_title,
          pl.member_name,
          pl.points,
          pl.reason,
          pl.created_at::text AS created_at,
          u.email AS user_email
        FROM point_ledger pl
        LEFT JOIN teams t ON t.id = pl.team_id
        LEFT JOIN objectives o ON o.id = pl.objective_id AND o.team_id = pl.team_id
        LEFT JOIN users u ON u.id = pl.user_id
        WHERE pl.team_id = $1
        ORDER BY pl.created_at DESC, pl.id
      `,
      [teamId],
    );
    const suspicious = result.rows
      .map((row) => ({ ...row, auditReasons: reasonsFor(row) }))
      .filter((row) => row.auditReasons.length > 0);

    console.log(JSON.stringify({
      checkedLedgerRows: result.rowCount,
      mode: "dry-run",
      suspiciousLedgerRows: suspicious.length,
      teamId,
      rows: suspicious,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

await main();
