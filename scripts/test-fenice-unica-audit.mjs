import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditFeniceUnica} from "./audit-fenice-unica-readonly.mjs";

const source={
  v6:"paper-validation-campaign.json",
  oms:"paper-oms-state.json",
  v7b2:"paper-v7-b2-forward-ledger.json",
  v8Days:"paper-v8-technical-days.json",
  v8Samples:"paper-v8-technical-samples.json",
  v8Approval:"paper-v8-technical-approval.json",
};
const data=Object.fromEntries(Object.entries(source).map(([key,name])=>[
  key,JSON.parse(readFileSync(new URL("../data/"+name,import.meta.url),"utf8")),
]));
const report=auditFeniceUnica(data);
assert.deepEqual(report.issues,[]);
assert.equal(report.overallStatus,"EVIDENCE_INVENTORY_ONLY_NOT_CERTIFIED");
assert.equal(report.sourceClasses.historicalV6.strategyPaperFills,7);
assert.equal(report.sourceClasses.historicalV6.riskRejections,2);
assert(report.sourceClasses.historicalV6.independentlyScreenedOpenDays>=22);
assert(report.sourceClasses.technicalV8.simulatedTechnicalSamples>=1);
assert(report.comparisonOnly.distinctOpenEvidenceDates>=22);
assert(report.comparisonOnly.overlappingDates.includes("2026-11-03"));
assert.equal(report.sourceClasses.forwardB2.attempts,0);
assert.equal(report.safeguards.readOnly,true);
assert.equal(report.safeguards.crossCampaignCredit,false);
assert.equal(report.safeguards.liveTradingAllowed,false);
assert.equal(report.threeSessionTechnicalPilot.qualification.includes("not V8"),true);
assert.equal(report.threeSessionTechnicalPilot.additionalDistinctQualifiedOpenDaysToReach25,
  Math.max(0,25-report.comparisonOnly.distinctOpenEvidenceDates));

const mutate=fn=>{const clone=structuredClone(data);fn(clone);return auditFeniceUnica(clone);};
let broken=mutate(x=>{x.v6.dailyEvidence.push(structuredClone(x.v6.dailyEvidence[0]));});
assert(broken.issues.includes("V6_DUPLICATE_OR_INVALID_DATES"));
broken=mutate(x=>{x.v6.dailyEvidence.at(-1).cumulativePaperFilled+=4;});
assert(broken.issues.includes("V6_LEDGER_FILL_COUNT_MISMATCH"));
broken=mutate(x=>{x.oms.liveTradingAllowed=true;});
assert(broken.issues.includes("V6_OMS_OR_LIVE_SAFETY_INVALID"));
broken=mutate(x=>{x.v8Approval.creditTowardB2=true;});
assert(broken.issues.includes("V8_APPROVAL_OR_CROSS_CAMPAIGN_SAFETY_BLOCK"));
broken=mutate(x=>{x.v8Days.records[0].proof.fx.rate+=0.1;});
assert(broken.issues.some(x=>x.startsWith("V8_DAY_AUDIT_")));
broken=mutate(x=>{x.v8Samples.events[0].notionalEuro=50000;});
assert(broken.issues.some(x=>x.startsWith("V8_SAMPLE_AUDIT_")));
broken=mutate(x=>{x.v7b2.liveTradingAllowed=true;});
assert(broken.issues.includes("B2_SAFETY_OR_LEDGER_INVALID"));
const v6Flagged=mutate(x=>{
  const row=x.v6.dailyEvidence.find(d=>d.date==="2026-09-25");
  row.marketSession.evidence.state="CLOSED";
});
assert(!v6Flagged.sourceClasses.historicalV6.screenedDates.includes("2026-09-25"));

console.log("Fenice Unica read-only V6/V8 audit: PASS");
console.log(JSON.stringify({
  historicalV6OpenDays:report.sourceClasses.historicalV6.independentlyScreenedOpenDays,
  oldStrategyFills:report.sourceClasses.historicalV6.strategyPaperFills,
  separateCurrentV8Samples:report.sourceClasses.technicalV8.simulatedTechnicalSamples,
  overlap:report.comparisonOnly.overlappingDates,
  validDaysComparableOnly:report.comparisonOnly.distinctOpenEvidenceDates,
  READY:false,LIVE:false,
}));
