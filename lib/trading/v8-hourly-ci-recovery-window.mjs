/**
 * Read-only delivery preflight for the existing, strictly technical V8 lab.
 * Only one narrow New York afternoon window; no exchange session or quote
 * evidence is implied, and no private PAPER journal or broker is touched.
 */
import {privateEodNewYorkClock} from './one-global-private-eod-autopilot.mjs';

export function assessV8HourlyCiRecovery({
  nowIso,workflowEvent,upstreamName='',upstreamEvent=''
}={}){
  const clock=privateEodNewYorkClock(nowIso);
  const result={isExchangeProof:false,grantsBrokerAccess:false,
    countsTowardsPaperCertification:false};
  if(workflowEvent==='workflow_run'){
    if(upstreamName==='Fenice PAPER Market-Open Readiness')
      return {...result,allow:true,reason:'EXISTING_MARKET_OPEN_RECOVERY'};
    if(upstreamName!=='Fenice Production CI'||upstreamEvent!=='schedule')
      return {...result,allow:false,reason:'UNTRUSTED_CI_EVENT'};
    // The hourly CI runs at :47 UTC. One afternoon opportunity, not
    // unlimited refetches or an extension of the original market session.
    const open=!['Sat','Sun'].includes(clock.weekday)
      &&clock.minute>=14*60+30&&clock.minute<=15*60+15;
    return {...result,allow:open,
      reason:open?'BOUNDED_HOURLY_CI_TECHNICAL_OBSERVATION':'OUTSIDE_TECHNICAL_OBSERVATION_WINDOW'};
  }
  if(['schedule','workflow_dispatch','push'].includes(workflowEvent))
    return {...result,allow:true,reason:'ORIGINAL_LAB_EVENT'};
  return {...result,allow:false,reason:'UNEXPECTED_EVENT_REJECTED'};
}
