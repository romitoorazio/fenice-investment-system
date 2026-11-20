import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessOneGlobalHourlyCiRecovery as gate}
  from '../lib/trading/one-global-hourly-ci-recovery-window.mjs';

const date='2026-11-20T18:51:00.000Z';
const scheduledFrom=(upstreamName,time,upstreamEvent='schedule')=>gate({
  nowIso:time,workflowEvent:'workflow_run',upstreamName,upstreamEvent,
});
const scheduled=(time)=>scheduledFrom('Fenice Production CI',time);
const should=(time,expected,reason)=>{
  const x=scheduled(time);
  assert.equal(x.shouldInvoke,expected,time);
  assert.equal(x.reason,reason,time);
  assert.equal(x.isExchangeProof,false,'A clock window is never source evidence');
};
should('2026-11-20T18:51:00.000Z',true,'EU_POSTCLOSE_RECOVERY_WINDOW');
should('2026-11-20T19:52:00.000Z',true,'EU_POSTCLOSE_RECOVERY_WINDOW');
should('2026-11-20T20:52:00.000Z',false,'OUTSIDE_EXISTING_POSTCLOSE_WINDOWS');
should('2026-11-20T21:50:00.000Z',true,'US_POSTCLOSE_RECOVERY_WINDOW');
should('2026-11-20T23:55:00.000Z',true,'US_POSTCLOSE_RECOVERY_WINDOW');
should('2026-11-20T23:56:00.000Z',false,'OUTSIDE_EXISTING_POSTCLOSE_WINDOWS');
should('2026-07-20T16:52:00.000Z',true,'EU_POSTCLOSE_RECOVERY_WINDOW');
should('2026-07-20T18:52:00.000Z',true,'EU_POSTCLOSE_RECOVERY_WINDOW');
should('2026-07-20T19:52:00.000Z',false,'OUTSIDE_EXISTING_POSTCLOSE_WINDOWS');
should('2026-07-20T20:52:00.000Z',true,'US_POSTCLOSE_RECOVERY_WINDOW');
should('2026-11-21T18:51:00.000Z',false,'OUTSIDE_EXISTING_POSTCLOSE_WINDOWS');
should('2026-11-21T21:50:00.000Z',false,'OUTSIDE_EXISTING_POSTCLOSE_WINDOWS');
for(const [upstreamName,upstreamEvent] of [
  ['Fenice Production CI','push'],
  ['Fenice Production CI','pull_request'],
  ['Fake CI','schedule'],
  ['Fenice Production Ci','schedule'],
  ['Fenice Foundation','push'],
  ['Fenice Foundation','workflow_dispatch'],
  ['Fenice Foundation','pull_request'],
  ['Fenice ONE GLOBAL — Unified PAPER Evidence','push'],
  ['Fenice ONE GLOBAL — Unified PAPER Evidence','workflow_dispatch'],
  ['Fenice ONE GLOBAL — Unified PAPER Evidence','pull_request'],
]){
  const result=gate({nowIso:date,workflowEvent:'workflow_run',upstreamName,upstreamEvent});
  assert.equal(result.shouldInvoke,false,'Untrusted hourly fallback must never invoke private PAPER');
}
for(const upstreamName of ['Fenice Foundation','Fenice ONE GLOBAL — Unified PAPER Evidence']){
  for(const instant of [
    '2026-11-20T18:51:00.000Z','2026-11-20T21:50:00.000Z',
    '2026-07-20T16:52:00.000Z','2026-07-20T20:52:00.000Z',
  ])assert.equal(scheduledFrom(upstreamName,instant).shouldInvoke,true,upstreamName+' '+instant);
  for(const instant of [
    '2026-11-20T20:52:00.000Z','2026-11-20T23:56:00.000Z',
    '2026-11-21T21:50:00.000Z',
  ])assert.equal(scheduledFrom(upstreamName,instant).shouldInvoke,false,upstreamName+' '+instant);
}
for(const upstreamName of ['Fenice Production Deploy','Fenice World V7 EOD Research']){
  assert.equal(gate({nowIso:date,workflowEvent:'workflow_run',upstreamName}).shouldInvoke,true,
    'Original protected fallback must not regress');
}
for(const workflowEvent of ['schedule','workflow_dispatch']){
  assert.equal(gate({nowIso:date,workflowEvent}).shouldInvoke,true,
    'Original production triggers must not be altered');
}
assert.equal(gate({nowIso:date,workflowEvent:'pull_request'}).shouldInvoke,false);
for(const nowIso of ['2026-11-20','garbage','2026-11-20T18:51:00Z','2026-11-20T25:51:00.000Z'])
  assert.throws(()=>scheduled(nowIso),/CLOCK_INVALID/);

const yaml=readFileSync('.github/workflows/one-global-eod-private-paper.yml','utf8');
const header=yaml.split('\njobs:\n')[0];
const writer=yaml.split('\n  cloud-original-private-signal-cycle:\n')[1]
  ?.split(/\n  (?:cloud-|safe-)[a-z-]+:\n/)[0];
assert(writer,'Only existing original private OIDC writer can be triggered');
assert.match(header,/workflows: \["Fenice Production Deploy", "Fenice World V7 EOD Research", "Fenice Production CI", "Fenice Foundation", "Fenice ONE GLOBAL — Unified PAPER Evidence"\]/);
const foundation=readFileSync('.github/workflows/autonomy.yml','utf8');
const unified=readFileSync('.github/workflows/fenice-unica-paper-cycle.yml','utf8');
assert.match(foundation,/name: Fenice Foundation/);
assert.match(foundation,/- cron: "17 \*\/3 \* \* \*"/);
assert.match(unified,/name: Fenice ONE GLOBAL — Unified PAPER Evidence/);
assert.match(unified,/- cron: "25 22 \* \* \*"/);
assert.match(writer,/github\.event\.workflow_run\.name == 'Fenice Production CI'/);
assert.match(writer,/github\.event\.workflow_run\.name == 'Fenice Foundation'/);
assert.match(writer,/github\.event\.workflow_run\.name == 'Fenice ONE GLOBAL — Unified PAPER Evidence'/);
assert.match(writer,/github\.event\.workflow_run\.event == 'schedule'/);
assert.match(writer,/github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
assert.match(writer,/github\.event\.workflow_run\.head_branch == 'main'/);
assert.match(writer,/steps\.ci_recovery\.outputs\.should_invoke == 'true'/);
assert.match(writer,/scripts\/check-one-global-hourly-ci-recovery\.mjs/);
assert.match(writer,/scripts\/invoke-one-global-cloud-signal-cycle\.mjs/);
assert.match(writer,/id-token: write/);
assert.doesNotMatch(writer,/secrets\.|ALPHA_VANTAGE_API_KEY|EODHD_API_TOKEN|DIRECTA/);
console.log('PASS original PAPER recovery: existing CI/Foundation/unified scheduled origins only, exchange-local windows, no private writes or expanded windows.');
