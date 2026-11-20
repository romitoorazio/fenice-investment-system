import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessV8HourlyCiRecovery as check}
  from '../lib/trading/v8-hourly-ci-recovery-window.mjs';

const v8=(nowIso,upstreamName='Fenice Production CI',upstreamEvent='schedule')=>
  check({nowIso,workflowEvent:'workflow_run',upstreamName,upstreamEvent});
for(const [instant,allowed] of [
  ['2026-11-20T19:29:59.000Z',false],
  ['2026-11-20T19:30:00.000Z',true],
  ['2026-11-20T19:50:00.000Z',true],
  ['2026-11-20T20:15:00.000Z',true],
  ['2026-11-20T20:15:01.000Z',false],
  ['2026-07-20T18:30:00.000Z',true],
  ['2026-07-20T18:50:00.000Z',true],
  ['2026-07-20T19:16:00.000Z',false],
  ['2026-11-21T19:50:00.000Z',false],
  ['2026-07-19T18:50:00.000Z',false],
]){
  const r=v8(instant);
  assert.equal(r.allow,allowed,instant);
  assert.equal(r.isExchangeProof,false);
  assert.equal(r.grantsBrokerAccess,false);
  assert.equal(r.countsTowardsPaperCertification,false);
}
for(const upstreamEvent of ['push','pull_request','workflow_dispatch','workflow_run']){
  assert.equal(v8('2026-11-20T19:50:00.000Z','Fenice Production CI',upstreamEvent).allow,false);
}
assert.equal(v8('2026-11-20T19:50:00.000Z','Fake CI','schedule').allow,false);
assert.equal(v8('2026-11-20T19:50:00.000Z','Fenice PAPER Market-Open Readiness','schedule').allow,true,
  'Existing trusted readiness trigger stays available, but its session gate remains mandatory');
for(const workflowEvent of ['schedule','workflow_dispatch','push']){
  assert.equal(check({nowIso:'2026-11-20T19:50:00.000Z',workflowEvent}).allow,true);
}
assert.equal(check({nowIso:'2026-11-20T19:50:00.000Z',workflowEvent:'pull_request'}).allow,false);
for(const invalid of ['2026-11-20','2026-11-20T19:50:00Z','invalid','2026-11-20T99:50:00.000Z']){
  assert.throws(()=>v8(invalid),/EOD_AUTOPILOT_CLOCK_INVALID/);
}
const yaml=readFileSync('.github/workflows/paper-execution-lab.yml','utf8');
const observer=yaml.split('\n  observe:\n')[1];
assert(observer,'Original technical-only observer must remain');
assert.match(yaml,/workflows: \["Fenice PAPER Market-Open Readiness", "Fenice Production CI"\]/);
assert.match(observer,/github\.event\.workflow_run\.head_branch == 'main'/);
assert.match(observer,/github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
assert.match(observer,/github\.event\.workflow_run\.name == 'Fenice Production CI'/);
assert.match(observer,/github\.event\.workflow_run\.event == 'schedule'/);
assert.match(observer,/scripts\/check-v8-hourly-ci-recovery\.mjs/);
assert.match(observer,/steps\.ci_recovery\.outputs\.allow == 'true'/);
assert.match(observer,/steps\.today\.outputs\.allowed == 'true'/);
assert.match(observer,/steps\.session\.outputs\.allowed == 'true'/);
assert.match(observer,/FENICE_ALPACA_EXECUTION_PROBES: "6"/);
assert.match(observer,/V8_CAMPAIGN_SAFETY_BLOCK/);
assert.match(observer,/ENGINEERING_LEDGER_SAFETY_BLOCK/);
assert.match(observer,/node scripts\/run-v8-technical-evidence\.mjs/);
assert.doesNotMatch(observer,/DIRECTA_ORDER|LIVE_TRADING_RELEASED=true|submitDirectaOrder/);
console.log('PASS V8 bounded CI recovery: US DST/session timing, schedule-only trusted upstream, source budgets and virtual-only isolation.');
