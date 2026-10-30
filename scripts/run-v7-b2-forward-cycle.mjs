/**
 * Independent prospectively pinned V7 B2 PAPER-only checkpoint.
 * Reuses the already tested Phase B pure engine and its exact strict gates;
 * writes ONLY B2 files. V6 and original V7 Phase B histories are never read
 * for credits, nor modified, or backfilled.
 */
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { computeV7B2Fingerprint } from "../lib/trading/paper-v7-b2-fingerprint.mjs";
import {
  replayV7PhaseBLedger, runV7PhaseBForwardPaper,
} from "../lib/trading/paper-v7-phase-b-v6-parity.mjs";
import { evaluateDecisionDataGate } from "../lib/trading/decision-data-gate.mjs";
import { evaluatePaperFxEvidence } from "../lib/trading/paper-fx-evidence.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolve(root,"data");
const ledgerFile = resolve(dataDir,"paper-v7-b2-forward-ledger.json");
const daysFile = resolve(dataDir,"paper-v7-b2-forward-days.json");
const read = async name => JSON.parse(await readFile(resolve(dataDir,name),"utf8"));
const atomic = async (file, body) => {
  const temp = file+".tmp";
  await writeFile(temp, JSON.stringify(body,null,2)+"\n", {mode:0o600});
  await rename(temp,file);
};

const [approval, ledger, days, sourceHealth, intelligence, fxEvidence,
       marketSession, executionCoverage, terminal, committee] = await Promise.all([
  "paper-v7-b2-approval.json", "paper-v7-b2-forward-ledger.json",
  "paper-v7-b2-forward-days.json", "global-source-health.json",
  "intelligence-quality.json", "paper-fx-evidence.json", "paper-market-session.json",
  "execution-market-coverage.json", "terminal-intelligence.json",
  "investment-committee.json",
].map(read));

const fingerprint = await computeV7B2Fingerprint(root);
const nowIso = new Date().toISOString();
const nowMs = Date.parse(nowIso);
const previous = replayV7PhaseBLedger(ledger);
if (!previous.valid) throw Error("V7_B2_LEDGER_INTEGRITY_"+previous.reason);
if (days.mode!=="V7_PHASE_B_FORWARD_DAYS"
    ||days.campaignId!=="fenice-paper-v7-b2-2026-11-02"
    ||!Array.isArray(days.days)
    ||days.days.some((d,i,all)=>!d||typeof d.date!=="string"
       ||(i>0&&all[i-1].date>=d.date)
       ||d.brokerConnectivityAllowed!==false||d.liveTradingAllowed!==false))
  throw Error("V7_B2_DAYS_HISTORY_INVALID");

const baselineSha = approval.baselineCommit;
const currentSha = execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
let shaAncestor=false;
if (/^[a-f0-9]{40}$/.test(String(baselineSha||""))
    &&/^[a-f0-9]{40}$/.test(currentSha)) {
  try {
    execFileSync("git",["merge-base","--is-ancestor",baselineSha,currentSha],{cwd:root,stdio:"ignore"});
    shaAncestor=true;
  } catch { /* fail closed */ }
}
const start=Date.parse(approval.approvedAt||"");
const end=Date.parse(approval.expiresAt||"");
const authorizedWindow=Number.isFinite(start)&&Number.isFinite(end)
  &&start<=nowMs&&nowMs<end&&end-start>=30*86400000;
const fingerprintPinned=approval.approved===true&&approval.humanConfirmation===true
  &&approval.mode==="PAPER"&&approval.liveTradingAllowed===false
  &&approval.brokerConnectivityAllowed===false&&shaAncestor
  &&fingerprint.complete===true&&approval.coreFingerprint?.complete===true
  &&approval.coreFingerprint.digest===fingerprint.digest
  &&approval.coreFingerprint.domain===fingerprint.domain
  &&JSON.stringify(approval.coreFingerprint.files)===JSON.stringify(fingerprint.files);

if (!authorizedWindow || !fingerprintPinned) {
  console.log(JSON.stringify({mode:"V7_B2_PAPER",state:"BLOCKED",
    reason:!authorizedWindow?"APPROVAL_WINDOW_NOT_ACTIVE":"CORE_NOT_PINNED_OR_APPROVED",
    fingerprint:fingerprint.digest,liveTradingAllowed:false,brokerConnectivityAllowed:false}));
  process.exitCode=2;
} else {
  const result=runV7PhaseBForwardPaper({
    approval,expectedFingerprint:{...approval.coreFingerprint,baselineCommit:baselineSha},
    observedFingerprint:fingerprint,ledger,sourceHealth,intelligence,fxEvidence,
    marketSession,executionCoverage,terminal,committee,nowIso,
  });
  const fill=result.state==="V7_PHASE_B_PAPER_FILL_RECORDED";
  if ((fill && (result.newPaperFills!==1||result.ledger.attempts.length!==ledger.attempts.length+1))
      ||(!fill&&result.newPaperFills!==0))
    throw Error("V7_B2_INCONSISTENT_FILL_COUNTER");

  // A genuine validated forward day requires a fresh, independently authoritative
  // OPEN session and paper-capable sources; a zero-fill NO_CANDIDATE day may be valid.
  const decision=evaluateDecisionDataGate({sourceHealth,intelligence,now:nowMs});
  const fx=evaluatePaperFxEvidence({fxEvidence,approval,now:nowMs});
  const sessionAt=Date.parse(marketSession?.evidence?.observedAt||"");
  const coverageAt=Date.parse(executionCoverage?.generatedAt||"");
  const closeAt=Date.parse(marketSession?.nextClose||"");
  const eligibleRows=Array.isArray(executionCoverage?.rows)
    ? executionCoverage.rows.filter(row=>row?.paperEligible===true
      &&Number(row.independentSourceFamilies)>=2
      &&["GREEN","CAUTION"].includes(row.state)).length : 0;
  const sourceProof=decision.ready===true&&fx.ready===true
    &&marketSession?.configured===true
    &&marketSession?.evidence?.authoritative===true
    &&marketSession?.evidence?.state==="OPEN"
    &&marketSession?.decision?.allowed===true
    &&marketSession?.liveTradingAllowed===false
    &&Number.isFinite(sessionAt)&&sessionAt<=nowMs&&nowMs-sessionAt<=120000
    &&Number.isFinite(closeAt)&&closeAt-nowMs>=5*60000
    &&executionCoverage?.policy?.liveTradingAllowed===false
    &&Number(executionCoverage?.policy?.minIndependentSourceFamilies)>=2
    &&Number(executionCoverage?.paperEligibleSymbols)>=3
    &&eligibleRows>=3
    &&Number.isFinite(coverageAt)&&coverageAt<=nowMs&&nowMs-coverageAt<=120000;
  if (fill&&!sourceProof) throw Error("V7_B2_FILL_WITHOUT_VALID_OPEN_MARKET_PROOF");
  const verified=replayV7PhaseBLedger(result.ledger);
  if (!verified.valid) throw Error("V7_B2_POST_FILL_RECONCILIATION_FAILED");

  const day=nowIso.slice(0,10);
  const existing=days.days.find(d=>d.date===day);
  const record={
    date:day,checkedAt:nowIso,fingerprintPinned:true,
    marketEvidenceValid:sourceProof,validatedForwardDay:sourceProof,
    fillCount:verified.fills,noNewFillReason:fill?null:(result.reason||result.state),
    brokerConnectivityAllowed:false,liveTradingAllowed:false,
  };
  const nextDays={
    ...days,
    days:existing
      ? days.days.map(d=>d.date===day?{...record,
          marketEvidenceValid:d.marketEvidenceValid||record.marketEvidenceValid,
          validatedForwardDay:d.validatedForwardDay||record.validatedForwardDay}:d)
      :[...days.days,record],
  };
  if (fill) await atomic(ledgerFile,result.ledger);
  if (JSON.stringify(days)!==JSON.stringify(nextDays)) await atomic(daysFile,nextDays);
  console.log(JSON.stringify({
    mode:"V7_B2_PAPER_FORWARD_ONLY",state:fill?"PAPER_FILL":"OBSERVATION_ONLY",
    reason:fill?null:record.noNewFillReason,observedAt:nowIso,
    marketEvidenceValid:sourceProof,fillToday:fill?1:0,
    totalB2Fills:verified.fills,validB2Days:nextDays.days.filter(x=>x.validatedForwardDay).length,
    fingerprint:fingerprint.digest,liveTradingAllowed:false,brokerConnectivityAllowed:false,
    modifiesV6:false,modifiesOriginalV7PhaseB:false,
  }));
}
