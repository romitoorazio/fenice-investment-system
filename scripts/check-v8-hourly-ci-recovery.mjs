import {appendFileSync} from 'node:fs';
import {assessV8HourlyCiRecovery} from '../lib/trading/v8-hourly-ci-recovery-window.mjs';

const decision=assessV8HourlyCiRecovery({
  nowIso:new Date().toISOString(),
  workflowEvent:process.env.FENICE_WORKFLOW_EVENT,
  upstreamName:process.env.FENICE_UPSTREAM_WORKFLOW||'',
  upstreamEvent:process.env.FENICE_UPSTREAM_EVENT||'',
});
if(!process.env.GITHUB_OUTPUT||decision.isExchangeProof!==false
  ||decision.grantsBrokerAccess!==false||decision.countsTowardsPaperCertification!==false)
  throw Error('V8_HOURLY_CI_RECOVERY_INVALID');
appendFileSync(process.env.GITHUB_OUTPUT,'allow='+(decision.allow?'true':'false')+'\n');
console.log('V8_HOURLY_CI_PREFLIGHT='+JSON.stringify({
  state:decision.reason,allow:decision.allow,marketSessionProven:false,
  sourcePricesVerified:false,createsFill:false,certifiedTrades:0,
  brokerConnectivityAllowed:false,liveTradingAllowed:false,
}));
