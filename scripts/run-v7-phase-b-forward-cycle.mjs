/**
 * GitHub Actions V7 Phase B PAPER-only independent forward cycle.
 * This is not a brokerage client; old V6 OMS and logs never get modified.
 * Only genuinely executed simulated probes count, with date & evidence hash.
 */
import {readFile,writeFile,rename} from "node:fs/promises";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";
import {computeV7PhaseBFingerprint} from "../lib/trading/paper-v7-phase-b-forward-fingerprint.mjs";
import {freshV7PhaseBLedger,replayV7PhaseBLedger,runV7PhaseBForwardPaper}
  from "../lib/trading/paper-v7-phase-b-v6-parity.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=async p=>JSON.parse(await readFile(resolve(root,"data",p),"utf8"));
const pathLedger=resolve(root,"data/paper-v7-phase-b-forward-ledger.json");
const pathDays=resolve(root,"data/paper-v7-phase-b-forward-days.json");
const write=async(path,obj)=>{
  const tmp=path+".tmp";
  await writeFile(tmp,JSON.stringify(obj,null,2)+"\n",{mode:0o600});
  await rename(tmp,path);
};
const allowedKeys=[
  "paper-v7-phase-b-approval.json",
  "paper-v7-phase-b-forward-ledger.json",
  "paper-v7-phase-b-forward-days.json",
  "global-source-health.json",
  "intelligence-quality.json",
  "paper-fx-evidence.json",
  "paper-market-session.json",
  "execution-market-coverage.json",
  "terminal-intelligence.json",
  "investment-committee.json",
];
const values=await Promise.all(allowedKeys.map(read));
const [approval,ledger,days,sourceHealth,intelligence,fxEvidence,
  marketSession,executionCoverage,terminal,committee]=values;
const fingerprint=await computeV7PhaseBFingerprint(root);
const nowIso=new Date().toISOString();
const observed=replayV7PhaseBLedger(ledger);
if(!observed.valid)throw Error("V7_PHASE_B_EXISTING_LEDGER_TAMPER_OR_BALANCE_ERROR");
if(days.mode!=="V7_PHASE_B_FORWARD_DAYS"||!Array.isArray(days.days)
  ||days.days.some((x,i,a)=>!x||typeof x.date!=="string"
    ||(i>0&&a[i-1].date>=x.date)
    ||x.liveTradingAllowed!==false
    ||x.brokerConnectivityAllowed!==false))throw Error("V7_PHASE_B_INVALID_DAILY_HISTORY");

let committed=false,reason="NOT_STARTED",nextLedger=ledger;
const sha=approval.baselineCommit;
const actualSha=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
const baseExists=/^[a-f0-9]{40}$/.test(sha)
  &&/^[a-f0-9]{40}$/.test(actualSha);
let shaAncestor=false;
if(baseExists){
  try{execFileSync("git",["merge-base","--is-ancestor",sha,actualSha],{cwd:root});
    shaAncestor=true}catch{/* fail closed */}
}
const frozen=approval.coreFingerprint;
const fingerprintPinned=shaAncestor&&fingerprint.complete===true
  &&frozen?.complete===true&&frozen?.digest===fingerprint.digest
  &&frozen?.domain===fingerprint.domain
  &&JSON.stringify(frozen.files)===JSON.stringify(fingerprint.files);
if(fingerprintPinned){
  const out=runV7PhaseBForwardPaper({
    approval,expectedFingerprint:{...frozen,baselineCommit:sha},
    observedFingerprint:fingerprint,ledger,
    sourceHealth,intelligence,fxEvidence,marketSession,executionCoverage,
    terminal,committee,nowIso,
  });
  reason=out.reason||out.state;
  nextLedger=out.ledger;
  if(out.state==="V7_PHASE_B_PAPER_FILL_RECORDED"){
    if(out.newPaperFills!==1
      ||nextLedger.attempts.length!==ledger.attempts.length+1)
      throw Error("V7_PHASE_B_UNCERTIFIED_FILL_ATTEMPT");
    committed=true;
  }else if(out.newPaperFills!==0)throw Error("V7_PHASE_B_FAKE_FILL_COUNTER");
}else reason="BASELINE_NOT_PINNED_OR_CHANGED";

// A daily observation is a forward checkpoint; only a successful market
// eligibility check can qualify for 25 VALID days. Mere running does NOT.
// This provisional evidence is deliberately NOT marked valid automatically.
const date=nowIso.slice(0,10);
const already=days.days.some(d=>d.date===date);
const updatedDays=already?days:{
  ...days,days:[...days.days,{date,checkedAt:nowIso,
    fingerprintPinned,marketEvidenceValid:committed,
    validatedForwardDay:committed,
    fillCount:nextLedger.attempts.filter(e=>e.status==="PAPER_FILLED").length,
    noNewFillReason:committed?null:reason,
    brokerConnectivityAllowed:false,liveTradingAllowed:false,
  }],
};
if(!fingerprintPinned){
  console.log(JSON.stringify({state:"NO_FILL",reason,codeFingerprint:fingerprint.digest,
    pinnedFingerprint:frozen?.digest??null,
    liveTradingAllowed:false,brokerConnectivityAllowed:false}));
  process.exit(0);
}
if(committed)await write(pathLedger,nextLedger);
if(!already)await write(pathDays,updatedDays);
const verified=replayV7PhaseBLedger(nextLedger);
if(!verified.valid)throw Error("POST_CYCLE_LEDGER_RECONCILIATION_FAILED");
console.log(JSON.stringify({
  state:committed?"V7_FORWARD_PAPER_FILL":"V7_FORWARD_OBSERVATION_ONLY",
  reason,fillToday:committed?1:0,forwardFills:verified.fills,
  validEvidenceDays:updatedDays.days.filter(d=>d.validatedForwardDay).length,
  attempts:verified.attempts,baselineCommit:sha,
  fingerprint:fingerprint.digest,liveTradingAllowed:false,
  brokerConnectivityAllowed:false,modifiesV6:false,
}));
