/**
 * GitHub Actions preflight. Only writes an output flag for the next step.
 * It cannot access private records, prices, broker or Vercel credentials.
 */
import {appendFileSync} from 'node:fs';
import {assessOneGlobalHourlyCiRecovery} from '../lib/trading/one-global-hourly-ci-recovery-window.mjs';

const assessment=assessOneGlobalHourlyCiRecovery({
  nowIso:new Date().toISOString(),
  workflowEvent:process.env.FENICE_WORKFLOW_EVENT,
  upstreamName:process.env.FENICE_UPSTREAM_WORKFLOW||'',
  upstreamEvent:process.env.FENICE_UPSTREAM_EVENT||'',
});
if(assessment.isExchangeProof!==false)throw Error('HOURLY_CI_MUST_NOT_CLAIM_MARKET_PROOF');
const flag=assessment.shouldInvoke?'true':'false';
if(!process.env.GITHUB_OUTPUT)throw Error('HOURLY_CI_GITHUB_OUTPUT_REQUIRED');
appendFileSync(process.env.GITHUB_OUTPUT,'should_invoke='+flag+'\n');
console.log('ONE_GLOBAL_HOURLY_CI_RECOVERY='+JSON.stringify({
  outcome:assessment.reason,willAttemptOriginalCycle:assessment.shouldInvoke,
  createsSignal:false,createsFill:false,certifiesPhase9:false,
  marketEvidenceAuthenticated:false,brokerConnectivityAllowed:false,liveTradingAllowed:false
}));
