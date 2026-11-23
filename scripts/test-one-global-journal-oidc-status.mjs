import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicOneGlobalJournalReadOnlySummary as summarize} from '../lib/trading/one-global-cloud-journal-readonly-summary.mjs';

const report=summarize({
  state:'ORIGINAL_JOURNAL_VALID_PRIVATE',journalEventCount:9,pendingSignalCount:1,
  virtualBuyCount:2,virtualSellCount:0,
  signalWindows:{withinRegularWindowCount:1,elapsedRegularWindowCount:0,
    pendingCbaPilot:{signalId:'secret'},internalToken:'never-log'},
  sourceSnapshotHash:'private-hash',providerReceipts:[{secret:'do-not-log'}],
  positions:{sensitive:true},ownerConsent:'secret',etag:'private-version',
});
assert.deepEqual(report,{
  state:'ORIGINAL_JOURNAL_VALID_PRIVATE',
  originalJournalValid:true,journalEventCount:9,pendingSignalCount:1,
  virtualBuyCount:2,virtualSellCount:0,
  withinRegularWindowCount:1,elapsedRegularWindowCount:0,
  journalMutationAllowed:false,brokerConnectivityAllowed:false,
  liveTradingAllowed:false,
});
assert.equal(JSON.stringify(report).includes('secret'),false);
assert.equal(JSON.stringify(report).includes('private'),false);
const corrupt=summarize({state:'ORIGINAL_JOURNAL_REPLAY_INVALID',
  journalEventCount:500,pendingSignalCount:99,virtualBuyCount:12,virtualSellCount:8,
  signalWindows:{withinRegularWindowCount:5,elapsedRegularWindowCount:2}});
assert.equal(corrupt.originalJournalValid,false);
for(const key of ['journalEventCount','pendingSignalCount','virtualBuyCount',
  'virtualSellCount','withinRegularWindowCount','elapsedRegularWindowCount'])
  assert.equal(corrupt[key],null,'invalid journal must not report trusted count: '+key);
const unknown=summarize({state:'INCIDENT_SECRET_DETAILS',token:'secret',journalEventCount:1});
assert.equal(unknown.state,'PRIVATE_JOURNAL_STATUS_UNAVAILABLE');
assert.equal(unknown.originalJournalValid,false);
assert.equal(summarize(null).state,'PRIVATE_JOURNAL_STATUS_UNAVAILABLE');
assert.equal(summarize({state:'ORIGINAL_JOURNAL_VALID_PRIVATE',
  journalEventCount:-1,pendingSignalCount:1.5}).originalJournalValid,false);

const route=readFileSync('app/api/paper/one-global-private-signal-cycle/route.js','utf8');
assert.match(route,/authorizeOneGlobalCloudWorkflow/);
assert.match(route,/AUDIT_JOURNAL_STATUS_READ_ONLY/);
assert.match(route,/publicOneGlobalJournalReadOnlySummary/);
assert.match(route,/inspectOneGlobalPrivateEodCloudStatus/);
assert.match(route,/if\(input\.action==='AUDIT_JOURNAL_STATUS_READ_ONLY'\)/);
assert.match(route,/runOneGlobalCloudPaperCycle/);
const workflow=readFileSync('.github/workflows/one-global-eod-private-paper.yml','utf8');
assert.match(workflow,/journal_status_read_only:/);
assert.match(workflow,/steps\.ci_recovery\.outputs\.should_invoke == 'true' && inputs\.journal_status_read_only != true/);
assert.match(workflow,/github\.event_name == 'workflow_dispatch' && inputs\.journal_status_read_only == true/);
assert.match(workflow,/node scripts\/invoke-one-global-private-status\.mjs/);
assert.match(workflow,/cloud-asx-cba-next-session:[\s\S]*?inputs\.journal_status_read_only != true/);
assert.match(workflow,/cloud-dual-eod-research:[\s\S]*?inputs\.journal_status_read_only != true/);
assert.match(workflow,/safe-diagnostic-only:[\s\S]*?inputs\.journal_status_read_only != true/);
const runner=readFileSync('scripts/invoke-one-global-private-status.mjs','utf8');
assert.match(runner,/AUDIT_JOURNAL_STATUS_READ_ONLY/);
assert.doesNotMatch(runner,/RESEARCH_SIGNAL_CYCLE|\.compareAndSwap\(|\.put\(|\.del\(/);
assert.doesNotMatch(runner,/console\.log\(text\)|console\.log\(value\)/);
console.log('PASS: OIDC journal probe is read-only, fail-closed, fixed action; private details redacted.');
