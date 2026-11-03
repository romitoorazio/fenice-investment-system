/**
 * Temporary 4-6 Nov 2026 PAPER-only recovery gate.
 * Dispatches the existing pinned V8 laboratory ONLY when a legitimate
 * prospective technical sample/day is missing. Never trades or writes ledgers.
 */
import { readFile, appendFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PINNED_V8_FILES, replayV8Days } from "./run-v8-technical-evidence.mjs";
import { replayExecutionLabLedger } from "./run-paper-execution-lab.mjs";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const dates=new Set(["2026-11-04","2026-11-05","2026-11-06"]);
const SHA=/^[a-f0-9]{40}$/;
const millis=value=>{
  const t=typeof value==="string"?Date.parse(value):NaN;
  return Number.isFinite(t)&&new Date(t).toISOString()===value?t:null;
};

export function evaluateV8PilotRecovery({
  nowIso,approval,days,samples,observedCoreBlobs,
}) {
  const now=millis(nowIso);
  if(now===null)return {dispatch:false,reason:"INVALID_CLOCK"};
  const date=nowIso.slice(0,10);
  if(!dates.has(date))return {dispatch:false,reason:"NOT_THREE_PILOT_DATES",date};
  // US November session 14:30-21:00 UTC; allow execution only from 14:45
  // and stop well before market close so the existing engine rechecks prices.
  const startWindow=Date.parse(date+"T14:45:00.000Z");
  const endWindow=Date.parse(date+"T20:00:00.000Z");
  if(now<startWindow||now>=endWindow)
    return {dispatch:false,reason:"OUTSIDE_US_MARKET_RECOVERY_WINDOW",date};

  const effective=millis(approval?.effectiveFrom),expires=millis(approval?.expiresAt);
  if(effective===null||expires===null||now<effective||now>=expires
    ||expires-effective<30*86400000
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
    ||!SHA.test(approval.baselineCommit||""))
    return {dispatch:false,reason:"V8_APPROVAL_POLICY_OR_TIME_BLOCK",date};

  if(JSON.stringify(Object.keys(approval.coreFileBlobs||{}).sort())
      !==JSON.stringify([...PINNED_V8_FILES].sort())
    ||PINNED_V8_FILES.some(path=>!SHA.test(approval.coreFileBlobs[path]||"")
      ||approval.coreFileBlobs[path]!==observedCoreBlobs?.[path]))
    return {dispatch:false,reason:"V8_PINNED_CORE_DRIFT",date};

  const dayAudit=replayV8Days(days,approval);
  const sampleAudit=replayExecutionLabLedger(samples);
  if(!dayAudit.valid||!sampleAudit.valid)
    return {dispatch:false,reason:"V8_EVIDENCE_REPLAY_BLOCKED",date};

  if(samples.events.some(e=>
      Date.parse(e.occurredAt)<effective||Date.parse(e.occurredAt)>=expires)
    ||days.records.some(e=>
      Date.parse(e.observedAt)<effective||Date.parse(e.observedAt)>=expires))
    return {dispatch:false,reason:"V8_OUT_OF_WINDOW_PROOF",date};

  const dateSamples=samples.events.filter(e=>e.occurredAt.slice(0,10)===date);
  const dateRecords=days.records.filter(d=>d.date===date);
  if(dateSamples.length>1||dateRecords.length>1)
    return {dispatch:false,reason:"V8_DUPLICATE_DAY_IN_LEDGER",date};

  if(dateSamples.length===1&&dateRecords.length===1)
    return {dispatch:false,reason:"ALREADY_COMPLETE_FOR_TODAY",date};
  if(samples.events.length>=10)
    return {dispatch:false,reason:"V8_SAMPLE_BUDGET_ALREADY_EXHAUSTED",date};

  return {
    dispatch:true,reason:"MISSING_PROSPECTIVE_V8_PAPER_PROOF",
    date,missingSample:dateSamples.length===0,
    missingValidDay:dateRecords.length===0,
    mode:"PAPER_TECHNICAL_ONLY",
    noBrokerConnectivity:true,noLiveTrading:true,
  };
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const read=async filename=>JSON.parse(await readFile(resolve(ROOT,"data",filename),"utf8"));
  const [approval,days,samples]=await Promise.all([
    "paper-v8-technical-approval.json",
    "paper-v8-technical-days.json",
    "paper-v8-technical-samples.json",
  ].map(read));
  const observedCoreBlobs=Object.fromEntries(PINNED_V8_FILES.map(path=>[
    path,execFileSync("git",["hash-object",path],{
      cwd:ROOT,encoding:"utf8",
    }).trim(),
  ]));
  const result=evaluateV8PilotRecovery({
    approval,days,samples,observedCoreBlobs,nowIso:new Date().toISOString(),
  });
  console.log("V8 PAPER pilot recovery gate: "+JSON.stringify(result));
  if(process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT,
      "needed="+String(result.dispatch)+"\n");
}
