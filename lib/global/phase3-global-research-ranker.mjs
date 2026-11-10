/** Phase 3: deterministic global opportunity ranking, research only. No orders or broker I/O. */
import {getVenue} from "./venue-registry.mjs";
const finite=x=>typeof x==="number"&&Number.isFinite(x);
export function rankGlobalResearchCandidates({candidates=[],capitalEur,perPositionRiskPct=1,maxAllocationPct=10,nowIso=new Date().toISOString()}={}){
 if(!Array.isArray(candidates)||!finite(capitalEur)||capitalEur<=0||!finite(perPositionRiskPct)||perPositionRiskPct<=0||perPositionRiskPct>5||!finite(maxAllocationPct)||maxAllocationPct<=0||maxAllocationPct>25||!Number.isFinite(Date.parse(nowIso)))throw Error("INVALID_RESEARCH_POLICY");
 const now=Date.parse(nowIso),seen=new Set(),ranked=[],excluded=[];
 for(const c of candidates){
  const key=`${c?.mic??""}:${c?.instrumentId??""}`;
  let reason=null;
  if(!getVenue(c?.mic)||typeof c?.instrumentId!=="string"||!c.instrumentId.startsWith(c.mic+":"))reason="UNKNOWN_INSTRUMENT_OR_VENUE";
  else if(seen.has(key))reason="DUPLICATE_INSTRUMENT";
  else if(!finite(c?.lastPrice)||c.lastPrice<=0||!finite(c?.fxToEur)||c.fxToEur<=0||!finite(c?.momentum20dPct)||!finite(c?.momentum5dPct)||!finite(c?.volatility20dPct)||c.volatility20dPct<=0||!finite(c?.spreadPct)||c.spreadPct<0)reason="INVALID_RESEARCH_METRICS";
  else if(!Number.isFinite(Date.parse(c?.observedAt))||Date.parse(c.observedAt)>now||now-Date.parse(c.observedAt)>86400000)reason="STALE_RESEARCH_DATA";
  else if(c?.synthetic!==true&&c?.provenanceVerified!==true)reason="UNVERIFIED_RESEARCH_SOURCE";
  if(reason){excluded.push({key,reason});continue;}
  seen.add(key);
  // A research heuristic, not a forecast: momentum adjusted for volatility and spread.
  const score=Number((0.6*c.momentum5dPct+0.4*c.momentum20dPct-0.35*c.volatility20dPct-1.5*c.spreadPct).toFixed(4));
  const maxNotionalEur=Number((capitalEur*maxAllocationPct/100).toFixed(2));
  const riskBudgetEur=Number((capitalEur*perPositionRiskPct/100).toFixed(2));
  const referenceUnitEur=c.lastPrice*c.fxToEur;
  const referenceQuantity=Math.max(0,Math.floor(maxNotionalEur/referenceUnitEur));
  ranked.push({mic:c.mic,instrumentId:c.instrumentId,score,synthetic:c.synthetic===true,classification:"RESEARCH_ONLY_NOT_EXECUTABLE",maxNotionalEur,riskBudgetEur,referenceQuantity,referencePriceEur:Number(referenceUnitEur.toFixed(6)),observedAt:c.observedAt});
 }
 ranked.sort((a,b)=>b.score-a.score||a.mic.localeCompare(b.mic)||a.instrumentId.localeCompare(b.instrumentId));
 return {mode:"GLOBAL_RESEARCH_ONLY",liveTradingAllowed:false,paperFillAuthorized:false,capitalEur,ranked,excluded};
}
