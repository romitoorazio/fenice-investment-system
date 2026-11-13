/** Phase 3 virtual portfolio research allocation: no orders, fills or broker connections. */
import {buildPhase3GlobalRadar} from "./phase3-global-radar.mjs";
export function buildPhase3ResearchPortfolio({candidates=[],capitalEur,perPositionRiskPct=1,maxAllocationPct=10,maxPortfolioAllocationPct=40,maxPortfolioRiskPct=4,estimatedRoundTripFeesEur=0,nowIso}={}){
 const valid=x=>typeof x==="number"&&Number.isFinite(x);
 if(!valid(maxPortfolioAllocationPct)||maxPortfolioAllocationPct<=0||maxPortfolioAllocationPct>100||!valid(maxPortfolioRiskPct)||maxPortfolioRiskPct<=0||maxPortfolioRiskPct>20)throw Error("INVALID_PORTFOLIO_RESEARCH_POLICY");
 const radar=buildPhase3GlobalRadar({candidates,capitalEur,perPositionRiskPct,maxAllocationPct,estimatedRoundTripFeesEur,nowIso});
 let remainingAllocation=capitalEur*maxPortfolioAllocationPct/100;
 let remainingRisk=capitalEur*maxPortfolioRiskPct/100;
 const selected=[],skipped=[];
 for(const candidate of radar.opportunities){
  const qty=candidate.referenceQuantity;
  if(!Number.isSafeInteger(qty)||qty<=0||!Number.isFinite(candidate.referencePriceEur)||candidate.referencePriceEur<=0||!Number.isFinite(candidate.plannedLossAtStopEur)){
   skipped.push({mic:candidate.mic,instrumentId:candidate.instrumentId,reason:candidate.reason??"INVALID_POSITION"});continue;
  }
  const unitRisk=(candidate.plannedLossAtStopEur-estimatedRoundTripFeesEur)/qty;
  if(!Number.isFinite(unitRisk)||unitRisk<=0){skipped.push({mic:candidate.mic,instrumentId:candidate.instrumentId,reason:"INVALID_RISK_ESTIMATE"});continue;}
  const byAllocation=Math.floor((remainingAllocation+1e-9)/candidate.referencePriceEur);
  const byRisk=Math.floor((remainingRisk-estimatedRoundTripFeesEur+1e-9)/unitRisk);
  const selectedQuantity=Math.max(0,Math.min(qty,byAllocation,byRisk));
  if(selectedQuantity===0){skipped.push({mic:candidate.mic,instrumentId:candidate.instrumentId,reason:"PORTFOLIO_BUDGET_EXHAUSTED"});continue;}
  const notional=selectedQuantity*candidate.referencePriceEur;
  const plannedRisk=selectedQuantity*unitRisk+estimatedRoundTripFeesEur;
  remainingAllocation-=notional;remainingRisk-=plannedRisk;
  selected.push({...candidate,referenceQuantity:selectedQuantity,referenceNotionalEur:Number(notional.toFixed(2)),plannedLossAtStopEur:Number(plannedRisk.toFixed(2)),executable:false});
 }
 return {mode:"PHASE3_PORTFOLIO_RESEARCH_ONLY",liveTradingAllowed:false,paperFillAuthorized:false,capitalEur,maxPortfolioAllocationPct,maxPortfolioRiskPct,selected,skipped,excluded:radar.excluded,allocatedNotionalEur:Number((capitalEur*maxPortfolioAllocationPct/100-remainingAllocation).toFixed(2)),plannedPortfolioLossAtStopEur:Number((capitalEur*maxPortfolioRiskPct/100-remainingRisk).toFixed(2)),stopGuaranteed:false};
}
