/**
 * Three-session PAPER technical pilot, 4-6 Nov 2026.
 * READ ONLY. Reads the independent Fenice Unica audit and V8 audit-proof
 * samples; does not modify any strategy, campaign or broker state.
 * Never claims that a three-day pilot replaces a 30-day V8 certification.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { auditFeniceUnica } from "./audit-fenice-unica-readonly.mjs";

export const SESSIONS = Object.freeze(["2026-11-04","2026-11-05","2026-11-06"]);
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const FINAL_CLOCK_UTC="21:15:00.000Z"; // after scheduled 21:00Z US close
const parseIso=value=>{
  const t=typeof value==="string"?Date.parse(value):NaN;
  return Number.isFinite(t)&&new Date(t).toISOString()===value?t:null;
};

export function evaluateThreeSessionPilot({audit, v8Days, v8Samples, nowIso}) {
  const now=parseIso(nowIso);
  if(now===null)throw Error("PILOT_INVALID_CLOCK");
  const evidenceDates=new Set(audit.sourceClasses.technicalV8.validDates);
  const sampleEvents=v8Samples.events;
  const issues=[...audit.issues];
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
  const report=evaluateThreeSessionPilot({
    audit,v8Days,v8Samples,nowIso:new Date().toISOString(),
  });
  console.log(JSON.stringify(report,null,2));
  if(process.env.FENICE_PILOT_REPORT_PATH)
    await writeFile(process.env.FENICE_PILOT_REPORT_PATH,
      JSON.stringify(report,null,2)+"\n");
  if(report.issues.length)process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
