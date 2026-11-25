/** Safety contract: retries only via the pre-existing trusted ONE GLOBAL cloud writer. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newOneGlobalEodPaperLedger} from '../lib/trading/one-global-eod-paper.mjs';
import {planPrivateEodSignalCycle} from '../lib/trading/one-global-private-eod-autopilot.mjs';

const workflow=readFileSync('.github/workflows/one-global-eod-private-paper.yml','utf8');
const research=readFileSync('.github/workflows/world-v7-eod-research.yml','utf8');
const worldCollection=readFileSync('.github/workflows/world-market-collection.yml','utf8');
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
// Extra late US EOD attempt never widens the in-process New York gate.
assert.equal((trigger.match(/- cron: "15 21-22 \* \* 1-5"/g)||[]).length,1,
  'exactly one bounded US post-close recovery cron');
// Simulate each scheduled US slot across EST/EDT using the real existing
// fail-closed autopilot. The runner cannot force a research SIGNAL or FILL.
const emptyOriginal=newOneGlobalEodPaperLedger();
const canProbe=nowIso=>planPrivateEodSignalCycle({nowIso,originalLedger:emptyOriginal}).expectedPostcloseWindow;
assert.equal(canProbe('2026-07-13T21:15:00.000Z'),true,'17:15 EDT summer retry');
assert.equal(canProbe('2026-11-16T22:15:00.000Z'),true,'17:15 EST winter retry');
assert.equal(canProbe('2026-11-16T21:15:00.000Z'),false,'16:15 EST pre-close must fail closed');
assert.equal(canProbe('2026-07-13T22:15:00.000Z'),true,'18:15 EDT delayed retry within window');
assert.equal(canProbe('2026-07-13T23:00:00.000Z'),false,'19:00 EDT old close must be rejected');


const recovery=trigger.split("  workflow_run:\n")[1];
assert(recovery,"workflow_run fallback trigger must exist");
assert.match(recovery,/workflows: \["Fenice Production Deploy", "Fenice World V7 EOD Research", "Fenice Production CI", "Fenice Foundation", "Fenice ONE GLOBAL — Unified PAPER Evidence", "Fenice World Market Collection"\]/);
assert.match(originalJob,/github\.event\.workflow_run\.name == 'Fenice Foundation'/);
assert.match(originalJob,/github\.event\.workflow_run\.name == 'Fenice ONE GLOBAL — Unified PAPER Evidence'/);
assert.match(originalJob,/github\.event\.workflow_run\.name == 'Fenice World Market Collection'/);
const autonomous=readFileSync('.github/workflows/autonomy.yml','utf8');
const unified=readFileSync('.github/workflows/fenice-unica-paper-cycle.yml','utf8');
assert.match(autonomous,/name: Fenice Foundation/);
assert.match(autonomous,/- cron: "17 \*\/3 \* \* \*"/);
assert.match(unified,/name: Fenice ONE GLOBAL — Unified PAPER Evidence/);
assert.match(unified,/- cron: "25 22 \* \* \*"/);
assert.match(worldCollection,/name: Fenice World Market Collection/);
assert.match(worldCollection,/- cron: "23 \* \* \* \*"/);
assert.match(recovery,/types: \[completed\]/);
assert.match(recovery,/branches: \[main\]/);
assert.match(research,/name: Fenice World V7 EOD Research/);
assert.match(research,/- cron: "40 23 \* \* 1-5"/,
  'the independent late-night recovery must remain scheduled');

assert.match(originalJob,/github\.ref == 'refs\/heads\/main'/);
assert.match(originalJob,/github\.event_name == 'schedule'/);
assert.match(originalJob,/github\.event_name == 'workflow_dispatch'/);
assert.match(originalJob,/github\.event_name == 'workflow_run' && github\.event\.workflow_run\.conclusion == 'success'/);
assert.match(originalJob,/github\.event\.workflow_run\.head_branch == 'main'/);
assert.match(originalJob,/github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
assert.match(originalJob,/github\.event\.workflow_run\.name == 'Fenice Production CI'/);
assert.match(originalJob,/github\.event\.workflow_run\.event == 'schedule'/);
assert.match(originalJob,/steps\.ci_recovery\.outputs\.should_invoke == 'true'/);
assert.match(originalJob,/scripts\/check-one-global-hourly-ci-recovery\.mjs/);
assert.match(originalJob,/id-token: write/);
assert.match(originalJob,/ref: main/);
assert.match(originalJob,/persist-credentials: false/);
assert.match(originalJob,/node scripts\/invoke-one-global-cloud-signal-cycle\.mjs/);
const replayPolicy=originalJob.split('FENICE_RECHECK_HISTORICAL_FILLS: ')[1]?.split('\n')[0];
assert(replayPolicy?.includes("github.event_name == 'workflow_dispatch'"));
assert(!replayPolicy.includes("workflow_run"),"no workflow completion may trigger historical fill replay");
assert.equal(replayPolicy.trim(),"${{ github.event_name == 'workflow_dispatch' || (github.event_name == 'schedule' && github.event.schedule == '15 0 * * 2-6') }}","only explicit dispatch and the daily audit slot may replay historical fills");
assert(replayPolicy.includes("github.event_name == 'schedule' && github.event.schedule == '15 0 * * 2-6'"));
assert(workflow.includes('cron: "15 0 * * 2-6"'));

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

const historicalCba=workflow.split('  cloud-asx-cba-next-session:')[1].split('    runs-on:')[0];
assert.match(historicalCba,/if: github.ref == 'refs\/heads\/main' && github.event_name == 'workflow_dispatch'\s*$/);
