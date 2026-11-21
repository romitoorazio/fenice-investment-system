/** Phase 3 research-only position sizing. No executable orders, stops or broker access. */
export function sizeVirtualResearchPosition({capitalEur,referencePriceEur,stopDistancePct,perPositionRiskPct=1,maxAllocationPct=10,estimatedRoundTripFeesEur=0}={}){
 const valid=x=>typeof x==="number"&&Number.isFinite(x);
 if(!valid(capitalEur)||capitalEur<=0||!valid(referencePriceEur)||referencePriceEur<=0||
 !valid(stopDistancePct)||stopDistancePct<=0||stopDistancePct>=100||
 !valid(perPositionRiskPct)||perPositionRiskPct<=0||perPositionRiskPct>5||
 !valid(maxAllocationPct)||maxAllocationPct<=0||maxAllocationPct>25||
 !valid(estimatedRoundTripFeesEur)||estimatedRoundTripFeesEur<0)throw Error("INVALID_RESEARCH_POSITION_POLICY");
 const allocationCapEur=capitalEur*maxAllocationPct/100;
 const riskCapEur=capitalEur*perPositionRiskPct/100;
 const unitRiskEur=referencePriceEur*stopDistancePct/100;
 // Fees consume risk budget before any shares can be proposed.
 const maxByRisk=Math.max(0,Math.floor((riskCapEur-estimatedRoundTripFeesEur)/unitRiskEur));
 const maxByAllocation=Math.max(0,Math.floor(allocationCapEur/referencePriceEur));
 const referenceQuantity=Math.min(maxByRisk,maxByAllocation);
 const referenceNotionalEur=Number((referenceQuantity*referencePriceEur).toFixed(2));
 const plannedLossAtStopEur=Number((referenceQuantity*unitRiskEur+(referenceQuantity?estimatedRoundTripFeesEur:0)).toFixed(2));
 return {mode:"RESEARCH_ONLY",executable:false,stopGuaranteed:false,capitalEur,referenceQuantity,referenceNotionalEur,plannedLossAtStopEur,riskCapEur:Number(riskCapEur.toFixed(2)),allocationCapEur:Number(allocationCapEur.toFixed(2)),reason:referenceQuantity===0?"INSUFFICIENT_BUDGET_FOR_ONE_UNIT":null};
}
