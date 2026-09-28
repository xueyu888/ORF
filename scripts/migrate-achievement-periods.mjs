import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import pg from 'pg';
import {tsImport} from 'tsx/esm/api';
import {loadEnvFile,createPgPoolConfig} from './db-connection.mjs';
pg.types.setTypeParser(1082, value => value);
const {isAchievementPeriod}=await tsImport('../src/domain/achievementPeriod.ts',import.meta.url);
const manifestPath=process.argv.find(a=>a.startsWith('--manifest='))?.slice(11);
if(!manifestPath)throw Error('Required: --manifest=<reviewed JSON> [--apply]; no automatic date inference');
const raw=fs.readFileSync(manifestPath,'utf8');const plan=JSON.parse(raw);
assert(plan.actorUserId&&plan.reason?.trim());assert(Array.isArray(plan.events)&&plan.events.length>0);
assert.equal(new Set(plan.events.map(e=>e.id)).size,plan.events.length);
for(const e of plan.events)assert(isAchievementPeriod(e.achievementPeriod));
loadEnvFile(process.env.ORF_ENV_FILE??'/home/xue/.config/orf/orf.env');
const pool=new pg.Pool(createPgPoolConfig(process.env.DATABASE_URL));const c=await pool.connect();
const receipt={phase:'prepared',at:new Date().toISOString(),manifestSha256:createHash('sha256').update(raw).digest('hex'),apply:process.argv.includes('--apply'),events:[]};
try{
 await c.query('BEGIN');
 const {rows:roles}=await c.query("SELECT m.team_id,m.role FROM team_members m JOIN users u ON u.id=m.user_id WHERE u.id=$1 AND u.status='active'",[plan.actorUserId]);
 assert(plan.events.every(e=>roles.some(r=>r.team_id===e.teamId&&r.role==='admin')),'Active team administrator required');
 for(const item of plan.events){
  const {rows:[e]}=await c.query('SELECT e.*,o.cycle FROM objective_settlement_events e JOIN objectives o ON o.id=e.objective_id WHERE e.id=$1 FOR UPDATE OF e',[item.id]);
  assert(e);assert.equal(e.objective_id,item.objectiveId);assert.equal(e.team_id,item.teamId);assert.equal(e.cycle,item.expectedCycle);
  const old={start:e.achievement_start,end:e.achievement_end};
  const same=old.start===item.achievementPeriod.start&&old.end===item.achievementPeriod.end;
  if(!same){assert.deepEqual(old,item.expectedPeriod);}
  receipt.events.push({id:e.id,old,new:item.achievementPeriod,createdAt:e.created_at,points:e.settlement_points,alreadyApplied:same});
  if(receipt.apply&&!same){
   await c.query('INSERT INTO settlement_period_corrections(id,settlement_event_id,old_start,old_end,new_start,new_end,reason,actor_user_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())', ['period-migration-'+randomUUID(),e.id,old.start,old.end,item.achievementPeriod.start,item.achievementPeriod.end,plan.reason,plan.actorUserId]);
   await c.query('UPDATE objective_settlement_events SET achievement_start=$2::date,achievement_end=$3::date WHERE id=$1',[e.id,item.achievementPeriod.start,item.achievementPeriod.end]);
  }
 }
 // Receipt write failure prevents commit; manifest + receipt provide recovery evidence.
 fs.writeFileSync(manifestPath+'.'+(receipt.apply?'applied':'preview')+'.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
 await c.query(receipt.apply?'COMMIT':'ROLLBACK');
 receipt.phase=receipt.apply?'committed':'preview';
 fs.writeFileSync(manifestPath+'.'+(receipt.apply?'applied':'preview')+'.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({applied:receipt.apply,events:receipt.events.length,points:receipt.events.reduce((n,e)=>n+Number(e.points),0)}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
