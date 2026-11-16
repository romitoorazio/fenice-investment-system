/** Safety contract: retries only via the pre-existing trusted ONE GLOBAL cloud writer. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync('.github/workflows/one-global-eod-private-paper.yml','utf8');
const research=readFileSync('.github/workflows/world-v7-eod-research.yml','utf8');
const trigger=workflow.split('\njobs:\n')[0];
const originalJob=workflow.split('\n  cloud-original-private-signal-cycle:\n')[1]
  ?.split(/\n  (?:cloud-|safe-)[a-z-]+:\n/)[0];
assert(originalJob,'trusted original cloud cycle job must exist');

// Preserve the original EU post-close windows, with exactly one extra set of
// off-minute retries. No new writer, new broker path or widened evidence gate.
assert.match(trigger,/- cron: "15 17-19 \* \* 1-5"/);
assert.equal((trigger.match(/- cron: "41 17-18 \* \* 1-5"/g)||[]).length,1,
  'only one bounded EU off-minute recovery schedule');
assert.match(trigger,/- cron: "45 20 \* \* 1-5"/);
assert.match(trigger,/- cron: "45 21 \* \* 1-5"/);
assert.match(trigger,/workflow_run:\n\s+workflows: \["Fenice Production Deploy", "Fenice World V7 EOD Research"\]\n\s+types: \[completed\]\n\s+branches: \[main\]/);
assert.match(research,/name: Fenice World V7 EOD Research/);
assert.match(research,/- cron: "40 23 \* \* 1-5"/,
  'the independent late-night recovery must remain scheduled');

assert.match(originalJob,/github\.ref == 'refs\/heads\/main'/);
assert.match(originalJob,/github\.event_name == 'schedule'/);
assert.match(originalJob,/github\.event_name == 'workflow_dispatch'/);
assert.match(originalJob,/github\.event_name == 'workflow_run' && github\.event\.workflow_run\.conclusion == 'success'/);
assert.match(originalJob,/id-token: write/);
assert.match(originalJob,/ref: main/);
assert.match(originalJob,/persist-credentials: false/);
assert.match(originalJob,/node scripts\/invoke-one-global-cloud-signal-cycle\.mjs/);
assert.doesNotMatch(originalJob,/secrets\.|ALPHA_VANTAGE_API_KEY|EODHD_API_TOKEN|DIRECTA/);

const runner=readFileSync('scripts/invoke-one-global-cloud-signal-cycle.mjs','utf8');
const auth=readFileSync('lib/trading/one-global-cloud-workflow-auth.mjs','utf8');
assert.match(runner,/GITHUB_REF!=='refs\/heads\/main'/);
assert.match(runner,/ACTIONS_ID_TOKEN_REQUEST_URL/);
assert.match(runner,/oneGlobalActionsCycleSummary/);
assert.match(auth,/\.github\/workflows\/one-global-eod-private-paper\.yml@refs\/heads\/main/);
assert.match(auth,/\['schedule','workflow_dispatch','workflow_run'\]/);
assert.match(auth,/c\.ref!=='refs\/heads\/main'/);

// The same engine settles first, then looks for new signals; it verifies the
// original private journal, applies the strict next-session/48h rules and CAS.
const cycle=readFileSync('lib/trading/one-global-cloud-paper-cycle.mjs','utf8');
const settlement=readFileSync('lib/trading/one-global-cloud-settlement.mjs','utf8');
assert.match(cycle,/runOneGlobalCloudSettlementCycle/);
assert.match(settlement,/STRICT_NEXT_SESSION_48H_WINDOW_ELAPSED/);
assert.match(settlement,/atomicCompareAndSwap/);
console.log('PASS ONE GLOBAL: independent EU and overnight recovery, main-only OIDC, original ledger/CAS and strict 48h gates retained; no Directa.');
