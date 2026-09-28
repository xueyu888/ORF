import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { tsImport } from 'tsx/esm/api';
import { loadEnvFile, createPgPoolConfig } from './db-connection.mjs';

// A reviewed manifest repairs associations only; it cannot award points or close goals.
pg.types.setTypeParser(1082, value => value);
const { isAchievementPeriod } = await tsImport('../src/domain/achievementPeriod.ts', import.meta.url);
const manifestPath = process.argv.find(arg => arg.startsWith('--manifest='))?.slice(11);
assert(manifestPath, 'Required: --manifest=<reviewed JSON> [--apply]');
const raw = fs.readFileSync(manifestPath, 'utf8');
const plan = JSON.parse(raw);
assert(plan.actorUserId && plan.reason?.trim());
assert(Array.isArray(plan.groups) && plan.groups.length > 0);
assert.equal(new Set(plan.groups.map(group => group.eventId)).size, plan.groups.length);
assert.equal(new Set(plan.groups.map(group => group.objectiveId)).size, plan.groups.length);
const ledgerIds = plan.groups.flatMap(group => group.ledger.map(row => row.id));
assert.equal(new Set(ledgerIds).size, ledgerIds.length);
for (const group of plan.groups) {
  assert(isAchievementPeriod(group.achievementPeriod));
  assert(group.ledger.length > 0 && group.evidence?.trim());
  assert(Number.isFinite(Date.parse(group.eventCreatedAt)));
  assert.equal(new Set(group.ledger.map(row => row.created_at)).size, 1);
  assert.equal(new Set(group.ledger.map(row => row.reason)).size, 1);
  assert(group.ledger.every(row => row.objective_id === group.objectiveId && row.team_id === group.teamId && row.settlement_event_id === null));
}
loadEnvFile(process.env.ORF_ENV_FILE ?? '/home/xue/.config/orf/orf.env');
const pool = new pg.Pool(createPgPoolConfig(process.env.DATABASE_URL));
const client = await pool.connect();
const apply = process.argv.includes('--apply');
const receiptPath = `${manifestPath}.${apply ? 'applied' : 'preview'}.json`;
const receipt = { phase: 'prepared', apply, at: new Date().toISOString(), manifestSha256: createHash('sha256').update(raw).digest('hex'), groups: [] };
try {
  await client.query('BEGIN');
  const { rows: roles } = await client.query("SELECT m.team_id,m.role FROM team_members m JOIN users u ON u.id=m.user_id WHERE u.id=$1 AND u.status='active'", [plan.actorUserId]);
  assert(plan.groups.every(group => roles.some(role => role.team_id === group.teamId && role.role === 'admin')));
  for (const group of plan.groups) {
    const { rows: [objective] } = await client.query('SELECT to_jsonb(o) AS data FROM objectives o WHERE id=$1 FOR UPDATE', [group.objectiveId]);
    assert(objective && objective.data.team_id === group.teamId);
    assert.equal(objective.data.flow_status, group.expectedFlowStatus);
    const ids = group.ledger.map(row => row.id);
    const { rows } = await client.query('SELECT to_jsonb(l) AS data FROM point_ledger l WHERE id=ANY($1) ORDER BY id FOR UPDATE', [ids]);
    assert.equal(rows.length, ids.length);
    const { rows: existing } = await client.query("SELECT *,created_at::text AS exact_created_at FROM objective_settlement_events WHERE id=$1 OR (objective_id=$2 AND kind='historicalLedgerRestore') FOR UPDATE", [group.eventId, group.objectiveId]);
    assert(existing.length <= 1);
    const alreadyApplied = existing.length === 1;
    for (const { data: row } of rows) {
      const expected = group.ledger.find(item => item.id === row.id);
      assert.deepEqual(row, { ...expected, settlement_event_id: alreadyApplied ? group.eventId : null });
    }
    const { rows: [total] } = await client.query('SELECT round(sum(points::numeric),2)::text AS points FROM point_ledger WHERE id=ANY($1)', [ids]);
    assert.equal(total.points, group.points);
    if (alreadyApplied) {
      const event = existing[0];
      assert.equal(event.id, group.eventId);
      assert.equal(event.objective_id, group.objectiveId);
      assert.equal(event.team_id, group.teamId);
      assert.equal(event.kind, 'historicalLedgerRestore');
      assert.equal(Number(event.settlement_points).toFixed(2), group.points);
      assert.equal(event.achievement_start, group.achievementPeriod.start);
      assert.equal(event.achievement_end, group.achievementPeriod.end);
      const { rows: [dateCheck] } = await client.query('SELECT $1::timestamptz=$2::timestamptz AS same', [event.exact_created_at, group.eventCreatedAt]);
      assert(dateCheck.same);
    } else if (apply) {
      const reason = `${plan.reason}\n${group.evidence}\n原记录说明：${group.ledger[0].reason}`;
      await client.query(`INSERT INTO objective_settlement_events
        (id,team_id,objective_id,kind,base_points,multiplier,settlement_points,reason,created_by_user_id,created_at,achievement_start,achievement_end)
        VALUES($1,$2,$3,'historicalLedgerRestore',$4,1,$4,$5,$6,$7::timestamptz,$8::date,$9::date)`,
      [group.eventId, group.teamId, group.objectiveId, group.points, reason, plan.actorUserId, group.eventCreatedAt, group.achievementPeriod.start, group.achievementPeriod.end]);
      const update = await client.query('UPDATE point_ledger SET settlement_event_id=$1 WHERE id=ANY($2) AND settlement_event_id IS NULL', [group.eventId, ids]);
      assert.equal(update.rowCount, ids.length);
      await client.query(`INSERT INTO settlement_period_corrections
        (id,settlement_event_id,old_start,old_end,new_start,new_end,reason,actor_user_id,created_at)
        VALUES($1,$2,NULL,NULL,$3::date,$4::date,$5,$6,now())`,
      ['historical-link-audit-' + randomUUID(), group.eventId, group.achievementPeriod.start, group.achievementPeriod.end, reason + '\n关联原流水：' + ids.join(', '), plan.actorUserId]);
      const { rows: after } = await client.query('SELECT to_jsonb(l) AS data FROM point_ledger l WHERE id=ANY($1) ORDER BY id', [ids]);
      for (const { data: row } of after) assert.deepEqual(row, { ...group.ledger.find(item => item.id === row.id), settlement_event_id: group.eventId });
      const { rows: [afterObjective] } = await client.query('SELECT to_jsonb(o) AS data FROM objectives o WHERE id=$1', [group.objectiveId]);
      assert.deepEqual(afterObjective, objective);
    }
    receipt.groups.push({ eventId: group.eventId, objectiveId: group.objectiveId, ledgerIds: ids, points: group.points, eventCreatedAt: group.eventCreatedAt, achievementPeriod: group.achievementPeriod, alreadyApplied });
  }
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  await client.query(apply ? 'COMMIT' : 'ROLLBACK');
  receipt.phase = apply ? 'committed' : 'preview';
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ apply, groups: receipt.groups.length, ledgerRows: ledgerIds.length, newlyRestored: apply ? receipt.groups.filter(group => !group.alreadyApplied).length : 0 }));
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
