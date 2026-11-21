/** Research-only global radar: combines scoring and virtual risk budgets without orders. */
import {rankGlobalResearchCandidates} from "./phase3-global-research-ranker.mjs";
import {sizeVirtualResearchPosition} from "./phase3-research-position-sizing.mjs";
export function buildPhase3GlobalRadar({candidates=[],capitalEur,perPositionRiskPct=1,maxAllocationPct=10,estimatedRoundTripFeesEur=0,nowIso}={}){
 const ranked=rankGlobalResearchCandidates({candidates,capitalEur,perPositionRiskPct,maxAllocationPct,nowIso});
 const byKey=new Map(candidates.map(c=>[`${c?.mic}:${c?.instrumentId}`,c]));
 const opportunities=ranked.ranked.map(item=>{
  const source=byKey.get(`${item.mic}:${item.instrumentId}`);
  const stopDistancePct=source?.stopDistancePct;
  if(typeof stopDistancePct!=="number"||!Number.isFinite(stopDistancePct)||stopDistancePct<=0||stopDistancePct>=100)
   return {...item,referenceQuantity:0,plannedLossAtStopEur:null,reason:"STOP_DISTANCE_REQUIRED",executable:false};
  const size=sizeVirtualResearchPosition({capitalEur,referencePriceEur:item.referencePriceEur,stopDistancePct,perPositionRiskPct,maxAllocationPct,estimatedRoundTripFeesEur});
  return {...item,referenceQuantity:size.referenceQuantity,referenceNotionalEur:size.referenceNotionalEur,plannedLossAtStopEur:size.plannedLossAtStopEur,reason:size.reason,executable:false};
 });
 return {mode:"PHASE3_GLOBAL_RESEARCH_ONLY",liveTradingAllowed:false,paperFillAuthorized:false,capitalEur,opportunities,excluded:ranked.excluded};
}
