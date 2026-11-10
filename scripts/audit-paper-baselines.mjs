/**
 * Baseline reconciliation as evidence, NOT a re-sign or an excuse to turn off
 * frozen-core controls. Frozen V6, signed B2 approval and pinned V8 stay intact.
 */
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { computeV7B2Fingerprint } from "../lib/trading/paper-v7-b2-fingerprint.mjs";
import { PINNED_V8_FILES, replayV8Days } from "./run-v8-technical-evidence.mjs";
import { replayExecutionLabLedger } from "./run-paper-execution-lab.mjs";

const ROOT=resolve(fileURLToPath(import.meta.url),"../..");
const run=(bin,args)=>execFileSync(bin,args,{cwd:ROOT,encoding:"utf8"}).trim();
const blob=(ref,path)=>{try{return run("git",["rev-parse",ref+":"+path]);}catch{return null;}};
const read=n=>JSON.parse(readFileSync(resolve(ROOT,"data",n),"utf8"));
export function summarizeBaseline({v6,v6Drift,b2,b2Fingerprint,v8,v8Drift,v8Replay,v8Samples}) {
  return {
    schemaVersion:1,mode:"READ_ONLY_BASELINE_RECONCILIATION",
    examinedAt:new Date().toISOString(),
    v6:{
      baselineCommit:v6.baselineCommit,
      protectedFileCount:v6.baselineFingerprint.files.length,
      drift:v6Drift,driftCount:v6Drift.length,
      status:v6Drift.length?"HISTORICAL_BASELINE_DRIFT_REQUIRES_DELIBERATE_RETIREMENT_OR_RECERTIFICATION":"PINNED",
      historyPreserved:true,
    },
    v7B2:{
      baselineCommit:b2.baselineCommit,
      approvedFingerprint:b2.coreFingerprint.digest,
      observedFingerprint:b2Fingerprint.digest,
      driftCount:b2Fingerprint.digest===b2.coreFingerprint.digest?0:1,
      status:b2Fingerprint.digest===b2.coreFingerprint.digest?"PINNED":
        "BLOCKED_REQUIRES_EXACT_PROSPECTIVE_OWNER_APPROVAL",
      oldApprovalUntouched:true,
    },
    v8:{
      baselineCommit:v8.baselineCommit,
      drift:v8Drift,driftCount:v8Drift.length,
      sourceDaysReplayValid:v8Replay.valid,
      sourceDays:v8Replay.valid?v8Replay.validDays:0,
      technicalSampleReplayValid:v8Samples.valid,
      samples:v8Samples.valid?v8Samples.simulatedExecutions:0,
      status:!v8Drift.length&&v8Replay.valid&&v8Samples.valid?"PINNED_COLLECTION_ACTIVE":"BLOCKED",
      coreUnchanged:true,
    },
    safety:{
      automaticRepinning:false,backfillAllowed:false,
      liveTradingAllowed:false,brokerConnectivityAllowed:false,
      retiredCampaignsNeverCountAsForwardEvidence:true,
    },
    ownerActionNeeded:v6Drift.length>0||b2Fingerprint.digest!==b2.coreFingerprint.digest,
  };
}
async function main() {
  const v6=read("paper-validation-campaign.json");
  const b2=read("paper-v7-b2-approval.json");
  const v8=read("paper-v8-technical-approval.json");
  const v6Drift=v6.baselineFingerprint.files.map(path=>({
    path,approvedBlob:blob(v6.baselineCommit,path),currentBlob:blob("HEAD",path)
  })).filter(x=>x.approvedBlob!==x.currentBlob);
  const v8Drift=PINNED_V8_FILES.map(path=>({
    path,approvedBlob:v8.coreFileBlobs[path],currentBlob:blob("HEAD",path)
  })).filter(x=>x.approvedBlob!==x.currentBlob);
  const report=summarizeBaseline({
    v6,v6Drift,b2,b2Fingerprint:await computeV7B2Fingerprint(ROOT),v8,v8Drift,
    v8Replay:replayV8Days(read("paper-v8-technical-days.json"),v8),
    v8Samples:replayExecutionLabLedger(read("paper-v8-technical-samples.json")),
  });
  const json=JSON.stringify(report,null,2)+"\n";
  console.log(json);
  const p=process.argv.indexOf("--output");
  if(p>=0&&process.argv[p+1])writeFileSync(resolve(process.argv[p+1]),json);
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    "## Frozen PAPER baselines (no automatic reapproval)\n"+
    "- V6 drift: "+report.v6.driftCount+" files; frozen approval preserved\n"+
    "- V7 B2: "+report.v7B2.status+"\n"+
    "- V8: "+report.v8.status+"; "+report.v8.sourceDays+" days / "+
      report.v8.samples+" technical samples\n");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
