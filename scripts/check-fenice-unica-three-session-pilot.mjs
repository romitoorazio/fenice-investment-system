/**
 * Three-session PAPER technical pilot, 4-6 Nov 2026.
 * READ ONLY. Reads the independent Fenice Unica audit and V8 audit-proof
 * samples; does not modify any strategy, campaign or broker state.
 * Never claims that a three-day pilot replaces a 30-day V8 certification.
 */
import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { auditFeniceUnica } from "./audit-fenice-unica-readonly.mjs";
import { PINNED_V8_FILES } from "./run-v8-technical-evidence.mjs";

export const SESSIONS = Object.freeze(["2026-11-04","2026-11-05","2026-11-06"]);
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const FINAL_CLOCK_UTC="21:15:00.000Z"; // after scheduled 21:00Z US close
const parseIso=value=>{
  const t=typeof value==="string"?Date.parse(value):NaN;
  return Number.isFinite(t)&&new Date(t).toISOString()===value?t:null;
};

export function validatePinnedV8Approval(approval, observedCoreBlobs, nowIso) {
  const now=parseIso(nowIso),start=parseIso(approval?.effectiveFrom);
  const end=parseIso(approval?.expiresAt);
  const sha=/^[a-f0-9]{40}$/;
  if(now===null||start===null||end===null||start>now||now>=end
    ||end-start<30*86400000
    ||approval?.approved!==true||approval.humanConfirmation!==true
    ||approval.approvalStatus!=="ACTIVE_PINNED_PAPER_ONLY"
    ||approval.mode!=="PAPER_TECHNICAL_V8"
    ||approval.prospectiveOnly!==true||approval.allowBackfill!==false
    ||approval.minCalendarDays!==30||approval.minEvidenceDays!==25
    ||approval.minTechnicalSamples!==10||approval.maxTechnicalSamples!==10
    ||approval.minIndependentSourceFamilies!==2
    ||approval.creditTowardV6!==false||approval.creditTowardB2!==false
    ||approval.liveTradingAllowed!==false
    ||approval.brokerConnectivityAllowed!==false
    ||approval.autoEnableLiveTrading!==false
    ||approval.paidServicesAuthorized!==false
    ||!sha.test(approval.baselineCommit||"")
    ||JSON.stringify(Object.keys(approval.coreFileBlobs||{}).sort())
      !==JSON.stringify([...PINNED_V8_FILES].sort())
    ||PINNED_V8_FILES.some(path=>
      !sha.test(approval.coreFileBlobs[path]||"")
      ||approval.coreFileBlobs[path]!==observedCoreBlobs?.[path])) {
    return {valid:false,reason:"V8_APPROVAL_POLICY_OR_PINNED_CORE_INVALID"};
  }
  return {valid:true,reason:null};
}

export function evaluateThreeSessionPilot({
  audit, v8Days, v8Samples, v8Approval, observedCoreBlobs, nowIso,
}) {
  const now=parseIso(nowIso);
  if(now===null)throw Error("PILOT_INVALID_CLOCK");
  const evidenceDates=new Set(audit.sourceClasses.technicalV8.validDates);
  const sampleEvents=v8Samples.events;
  const issues=[...audit.issues];
  const pinned=validatePinnedV8Approval(v8Approval,observedCoreBlobs,nowIso);
  if(!pinned.valid)issues.push(pinned.reason);
  if(audit.safeguards.liveTradingAllowed!==false
    ||audit.safeguards.brokerConnectivityAllowed!==false
    ||audit.safeguards.crossCampaignCredit!==false
    ||audit.safeguards.readOnly!==true)issues.push("PILOT_SAFETY_POLICY_INVALID");
  const sessions=SESSIONS.map(date=>{
    const receipts=v8Days.records.filter(rec=>rec.date===date);
    const samples=sampleEvents.filter(e=>e.occurredAt.slice(0,10)===date);
    const evidenceOk=evidenceDates.has(date)&&receipts.length===1
      &&receipts[0].certificationScope==="V8_TECHNICAL_ONLY"
      &&receipts[0].liveTradingAllowed===false
      &&receipts[0].brokerConnectivityAllowed===false;
    const sampleOk=samples.length===1
      &&samples[0].status==="SIMULATED_EXECUTION"
      &&samples[0].simulated===true
      &&samples[0].certificationCredit===0
      &&samples[0].liveTradingAllowed===false
      &&samples[0].brokerConnectivityAllowed===false;
    const close=Date.parse(date+"T"+FINAL_CLOCK_UTC);
    const state=evidenceOk&&sampleOk&&issues.length===0?"PASS":
      now<close?"AWAITING_EVIDENCE":"INCOMPLETE";
    const reasons=[];
    if(!evidenceOk)reasons.push("MISSING_VERIFIED_OPEN_MARKET_DAY");
    if(!sampleOk)reasons.push("MISSING_UNIQUE_V8_PROSPECTIVE_SAMPLE");
    return {
      date,state,recordCount:receipts.length,sampleCount:samples.length,
      evidenceSource:"V8_PINNED_CAMPAIGN_ONLY",reasons:state==="PASS"?[]:reasons,
    };
  });
  const passed=sessions.filter(x=>x.state==="PASS").length;
  const ready=passed===3 && issues.length===0;
  const finished=now>=Date.parse("2026-11-06T"+FINAL_CLOCK_UTC);
  return {
    version:1,mode:"FENICE_UNICA_THREE_SESSION_TECHNICAL_PILOT",
    generatedAt:nowIso,
    status:ready?"PILOT_TECNICO_PASS":finished?"PILOT_TECNICO_INCOMPLETE":"COLLECTING",
    sessions,passedSessions:passed,requiredSessions:3,
    pinnedV8ApprovalVerified:pinned.valid,
    issues,legacyEvidenceInventory:{
      V6EligibleComparableOpenDays:audit.sourceClasses.historicalV6.independentlyScreenedOpenDays,
      V6StrategyPaperFills:audit.sourceClasses.historicalV6.strategyPaperFills,
      V7PhaseBAttempts:audit.sourceClasses.historicalV7PhaseB.attempts,
      V7B2Attempts:audit.sourceClasses.forwardB2.attempts,
      V8SamplesAllTime:audit.sourceClasses.technicalV8.simulatedTechnicalSamples,
    },
    certification:{ 
      threeDayPilotIs30DayV8Certification:false,
      countsHistoricalFillsAsV8:false,
      investmentSignalQualityCertified:false,
      qualifiesForBrokerLive:false,
      mustContinueExistingV8Campaign:true,
    },
    safeguards:{
      readOnly:true,
      performsBrokerActions:false,
      liveTradingAllowed:false,
      brokerConnectivityAllowed:false,
    },
  };
}
async function main(){
  const read=async filename=>JSON.parse(await readFile(resolve(ROOT,"data",filename),"utf8"));
  const [v6,oms,v7PhaseB,v7PhaseBDays,v7b2,v7b2Days,legacyLab,v8Days,v8Samples,v8Approval]=await Promise.all([
    "paper-validation-campaign.json","paper-oms-state.json",
    "paper-v7-phase-b-forward-ledger.json","paper-v7-phase-b-forward-days.json",
    "paper-v7-b2-forward-ledger.json","paper-v7-b2-forward-days.json",
    "paper-execution-lab-ledger.json","paper-v8-technical-days.json",
    "paper-v8-technical-samples.json","paper-v8-technical-approval.json",
  ].map(read));
  const audit=auditFeniceUnica({
    v6,oms,v7PhaseB,v7PhaseBDays,v7b2,v7b2Days,legacyLab,
    v8Days,v8Samples,v8Approval,
  });
  const observedCoreBlobs=Object.fromEntries(PINNED_V8_FILES.map(path=>[
    path,execFileSync("git",["hash-object",path],{
      cwd:ROOT,encoding:"utf8",
    }).trim(),
  ]));
  const report=evaluateThreeSessionPilot({
    audit,v8Days,v8Samples,v8Approval,observedCoreBlobs,
    nowIso:new Date().toISOString(),
  });
  console.log(JSON.stringify(report,null,2));
  if(process.env.FENICE_PILOT_REPORT_PATH)
    await writeFile(process.env.FENICE_PILOT_REPORT_PATH,
      JSON.stringify(report,null,2)+"\n");
  if(report.issues.length)process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
