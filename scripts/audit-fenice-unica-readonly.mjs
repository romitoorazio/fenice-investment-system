/**
 * FENICE UNICA - read-only compatibility/inventory audit.
 *
 * Historical V6 PAPER fills, V8 engineering samples, and market-evidence days
 * are different evidence classes. This report does NOT transfer credit among
 * campaigns, prove profitability or authorize LIVE trading.
 */
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { replayV8Days } from "./run-v8-technical-evidence.mjs";
import { replayExecutionLabLedger } from "./run-paper-execution-lab.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const dateRe=/^\d{4}-\d{2}-\d{2}$/;
const validDate=value=>typeof value==="string"&&dateRe.test(value)
  &&!Number.isNaN(Date.parse(value+"T00:00:00.000Z"));
const sortedUnique=values=>[...new Set(values)].sort();
const resultDateSet=items=>sortedUnique(items.map(x=>x.date));
const eligibleV6Day=(d,digest)=>d
  &&validDate(d.date)
  &&d.observedAt?.slice(0,10)===d.date
  &&d.validationFingerprint?.digest===digest
  &&d.validationFingerprint?.complete===true
  &&d.marketSession?.evidence?.state==="OPEN"
  &&d.marketSession?.evidence?.authoritative===true
  &&d.marketSession?.decision?.allowed===true
  &&d.decisionDataGate?.ready===true
  &&d.executionMarketCoverage?.ready===true
  &&d.marketFxEvidence?.readyNow===true
  &&d.reconciliationBalanced===true
  &&d.auditChainValid===true
  &&d.liveTradingAllowed===false
  &&d.brokerConnectivityAllowed===false
  &&d.liveOrders===0;

export function auditFeniceUnica({
  v6,oms,v7PhaseB,v7PhaseBDays,v7b2,v7b2Days,legacyLab,v8Days,v8Samples,v8Approval,
}) {
  const issues=[];
  const initial=v6?.baselineFingerprint?.digest;
  const v6Days=v6?.dailyEvidence||[];
  if(!initial || v6?.baselineFingerprint?.complete!==true
    ||!Array.isArray(v6Days)) issues.push("V6_BASELINE_OR_DAYS_UNVERIFIED");
  const dates=v6Days.map(x=>x.date);
  if(sortedUnique(dates).length!==v6Days.length
     ||v6Days.some(x=>!validDate(x.date)))issues.push("V6_DUPLICATE_OR_INVALID_DATES");
  if(oms?.mode!=="PAPER"||oms?.liveTradingAllowed!==false
    ||oms?.brokerConnectivityAllowed!==false
    ||!Array.isArray(oms?.executions))issues.push("V6_OMS_OR_LIVE_SAFETY_INVALID");
  const filled=oms?.executions?.filter(e=>e.status==="PAPER_FILLED")||[];
  const rejected=oms?.executions?.filter(e=>e.status==="RISK_REJECTED")||[];
  const fillDates=sortedUnique(filled.map(e=>e.filledAt?.slice(0,10)));
  if(filled.some(e=>!e.filledAt||!validDate(e.filledAt.slice(0,10))
    ||!e.clientOrderId?.startsWith("fenice-paper-validation-v6-")))
    issues.push("V6_FILL_ORIGIN_UNVERIFIED");
  if(v6Days.at(-1)?.cumulativePaperFilled!==filled.length)
    issues.push("V6_LEDGER_FILL_COUNT_MISMATCH");
  if(v8Approval?.approved!==true
    ||v8Approval?.liveTradingAllowed!==false
    ||v8Approval?.brokerConnectivityAllowed!==false
    ||v8Approval?.creditTowardV6!==false
    ||v8Approval?.creditTowardB2!==false)
    issues.push("V8_APPROVAL_OR_CROSS_CAMPAIGN_SAFETY_BLOCK");
  const v8Audit=replayV8Days(v8Days,v8Approval);
  if(!v8Audit.valid)issues.push("V8_DAY_AUDIT_"+v8Audit.reason);
  const v8Ledger=replayExecutionLabLedger(v8Samples);
  if(!v8Ledger.valid)issues.push("V8_SAMPLE_AUDIT_"+v8Ledger.reason);
  const activated=Date.parse(v8Approval?.effectiveFrom||"");
  if(!Number.isFinite(activated)||v8Samples?.events?.some(e=>
    Date.parse(e.occurredAt)<activated))issues.push("V8_PREAPPROVAL_SAMPLE");
  if(v7b2?.liveTradingAllowed!==false
    ||v7b2?.brokerConnectivityAllowed!==false
    ||!Array.isArray(v7b2?.attempts))
    issues.push("B2_SAFETY_OR_LEDGER_INVALID");
  if(v7PhaseB?.liveTradingAllowed!==false
    ||v7PhaseB?.brokerConnectivityAllowed!==false
    ||!Array.isArray(v7PhaseB?.attempts)
    ||v7PhaseBDays?.liveTradingAllowed!==false
    ||!Array.isArray(v7PhaseBDays?.days))
    issues.push("V7_PHASE_B_HISTORY_OR_LIVE_SAFETY_INVALID");
  if(v7b2Days?.liveTradingAllowed!==false
    ||!Array.isArray(v7b2Days?.days))
    issues.push("B2_DAY_HISTORY_OR_LIVE_SAFETY_INVALID");
  const legacyLabReplay=replayExecutionLabLedger(legacyLab);
  if(!legacyLabReplay.valid)
    issues.push("PRE_V8_ENGINEERING_LAB_AUDIT_"+legacyLabReplay.reason);

  const legacyV6Rows=v6Days.filter(d=>eligibleV6Day(d,initial));
  const v6StrictDates=resultDateSet(legacyV6Rows);
  const v8ValidDates=v8Audit.valid?resultDateSet(v8Days.records):[];
  const mergedDistinctDates=sortedUnique([...v6StrictDates,...v8ValidDates]);
  const sharedDates=v6StrictDates.filter(date=>v8ValidDates.includes(date));
  const v8Events=v8Ledger.valid?v8Samples.events:[];
  const researchFills=filled.length,technicalSamples=v8Events.length;
  return {
    version:1,mode:"FENICE_UNICA_READONLY_EVIDENCE_INVENTORY",
    overallStatus:issues.length?"AUDIT_BLOCKED":"EVIDENCE_INVENTORY_ONLY_NOT_CERTIFIED",
    issues,
    sourceClasses:{
      historicalV6:{version:"V6",fingerprint:initial,observedDays:v6Days.length,
        independentlyScreenedOpenDays:v6StrictDates.length,
        screenedDates:v6StrictDates,
        strategyPaperFills:researchFills,riskRejections:rejected.length,
        fillDates,eligibility:"historical-comparative-only"},
      technicalV8:{version:"V8",effectiveFrom:v8Approval?.effectiveFrom,
        approved:v8Approval?.approved===true,validDays:v8ValidDates.length,
        validDates:v8ValidDates,simulatedTechnicalSamples:technicalSamples,
        eligibility:"current-campaign-only"},
      historicalV7PhaseB:{
        version:"V7_PHASE_B",attempts:v7PhaseB?.attempts?.length||0,
        observations:v7PhaseBDays?.days?.length||0,
        dates:v7PhaseBDays?.days?.map(d=>d.date)||[],
        daysWithoutVerifiedMarketEvidence:
          v7PhaseBDays?.days?.filter(d=>d.marketEvidenceValid!==true).length||0,
        eligibility:"historical-comparative-only-not-transferable"},
      forwardB2:{version:"V7_B2",attempts:v7b2?.attempts?.length||0,
        observations:v7b2Days?.days?.length||0,
        daysWithoutVerifiedMarketEvidence:
          v7b2Days?.days?.filter(d=>d.marketEvidenceValid!==true).length||0,
        eligibility:"independent-existing-campaign"},
      previousEngineeringLab:{
        version:"ENGINEERING_LAB_PRE_V8",
        simulatedSamples:legacyLabReplay.valid?legacyLab.events.length:0,
        eligibility:"historical-comparative-only-not-transferable"},
    },
    comparisonOnly:{
      distinctOpenEvidenceDates:mergedDistinctDates.length,
      distinctDates:mergedDistinctDates,overlappingDates:sharedDates,
      mixedDifferentClassesEventCount:researchFills+technicalSamples,
      warning:"Historical strategy fills and virtual technical samples are NOT equivalent; neither fills nor dates are transferred into V8 or B2.",
    },
    threeSessionTechnicalPilot:{
      additionalDistinctQualifiedOpenDaysToReach25:Math.max(0,25-mergedDistinctDates.length),
      earliestCandidateSessions:["2026-11-04","2026-11-05","2026-11-06"],
      target:"3 successful prospective OPEN-market technical/integration observations",
      qualification:"pilot only; not V8 30/25/10 certification or broker/LIVE readiness",
    },
    safeguards:{readOnly:true,modifiesHistoricLedgers:false,
      crossCampaignCredit:false,investmentSignalQualityCertified:false,
      liveTradingAllowed:false,brokerConnectivityAllowed:false},
  };
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const read=async n=>JSON.parse(await readFile(resolve(root,"data",n),"utf8"));
  const [
    v6,oms,v7PhaseB,v7PhaseBDays,v7b2,v7b2Days,
    legacyLab,v8Days,v8Samples,v8Approval,
  ]=await Promise.all([
    "paper-validation-campaign.json","paper-oms-state.json",
    "paper-v7-phase-b-forward-ledger.json","paper-v7-phase-b-forward-days.json",
    "paper-v7-b2-forward-ledger.json","paper-v7-b2-forward-days.json",
    "paper-execution-lab-ledger.json",
    "paper-v8-technical-days.json","paper-v8-technical-samples.json",
    "paper-v8-technical-approval.json",
  ].map(read));
  const result=auditFeniceUnica({
    v6,oms,v7PhaseB,v7PhaseBDays,v7b2,v7b2Days,
    legacyLab,v8Days,v8Samples,v8Approval,
  });
  console.log(JSON.stringify(result,null,2));
  if(result.issues.length)process.exitCode=2;
}
