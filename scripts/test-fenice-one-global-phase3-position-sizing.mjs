import assert from "node:assert/strict";
import {sizeVirtualResearchPosition} from "../lib/global/phase3-research-position-sizing.mjs";
const base={capitalEur:1000,referencePriceEur:20,stopDistancePct:10,perPositionRiskPct:1,maxAllocationPct:10,estimatedRoundTripFeesEur:2};
const a=sizeVirtualResearchPosition(base);
assert.equal(a.referenceQuantity,4);
assert.equal(a.referenceNotionalEur,80);
assert.equal(a.plannedLossAtStopEur,10);
assert.equal(a.riskCapEur,10);
assert.equal(a.allocationCapEur,100);
assert.equal(a.executable,false);assert.equal(a.stopGuaranteed,false);
const b=sizeVirtualResearchPosition({...base,stopDistancePct:1,estimatedRoundTripFeesEur:0});
assert.equal(b.referenceQuantity,5);
assert.equal(b.referenceNotionalEur,100);
const c=sizeVirtualResearchPosition({...base,estimatedRoundTripFeesEur:11});
assert.equal(c.referenceQuantity,0);assert.equal(c.plannedLossAtStopEur,0);
assert.equal(c.reason,"INSUFFICIENT_BUDGET_FOR_ONE_UNIT");
for(const overrides of [{capitalEur:0},{referencePriceEur:0},{stopDistancePct:0},{stopDistancePct:100},{perPositionRiskPct:6},{maxAllocationPct:26},{estimatedRoundTripFeesEur:-1}]){
 assert.throws(()=>sizeVirtualResearchPosition({...base,...overrides}),/INVALID_RESEARCH_POSITION_POLICY/);
}
console.log("FENICE phase 3 virtual position risk sizing: PASS");
