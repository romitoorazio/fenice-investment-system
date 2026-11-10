import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { computeV7B2Fingerprint } from "../lib/trading/paper-v7-b2-fingerprint.mjs";
import { replayV7PhaseBLedger } from "../lib/trading/paper-v7-phase-b-v6-parity.mjs";


/**
 * A renewed PAPER-only owner authorization has its own record; the Nov 2
 * original approval is never overwritten or credited into the new epoch.
 */
export function selectV7B2ActiveApproval(legacy, renewal = null) {
  if (!renewal) return legacy;
  const safe = renewal?.version === 1
    && renewal.mode === "PAPER" && renewal.approved === true
    && renewal.humanConfirmation === true
    && renewal.liveTradingAllowed === false
    && renewal.brokerConnectivityAllowed === false
    && renewal.allowBackfill === false
    && renewal.previousApprovalId === legacy?.approvalId
    && renewal.previousDigest === legacy?.coreFingerprint?.digest
    && renewal.approvalEvidence?.kind === "EXPLICIT_CHAT_OWNER_INSTRUCTION"
    && renewal.approvalEvidence?.instructionText ===
       "Sblocca la b2 è dimmi dettagliatamente cosa farai?"
    && renewal.approvalEvidence?.liveTradingExcluded === true
    && renewal.approvalEvidence?.brokerOrdersExcluded === true
    && renewal.approvalEvidence?.paidDataServicesAuthorized === false
    && /^[a-f0-9]{40}$/.test(renewal.baselineCommit || "")
    && /^[a-f0-9]{64}$/.test(renewal.coreFingerprint?.digest || "")
    && renewal.coreFingerprint?.complete === true
    && renewal.coreFingerprint?.domain === legacy?.coreFingerprint?.domain
    && JSON.stringify(renewal.coreFingerprint?.files) ===
       JSON.stringify(legacy?.coreFingerprint?.files)
    && Number.isFinite(Date.parse(renewal.approvedAt))
    && renewal.approvedAt === renewal.effectiveFrom
    && Date.parse(renewal.approvedAt) > Date.parse(legacy?.approvedAt || "")
    && Date.parse(renewal.expiresAt) - Date.parse(renewal.approvedAt) >= 30 * 86400000;
  if (!safe) throw Error("B2_RENEWAL_RECORD_INVALID_OR_UNSAFE");
  return {
    ...legacy,
    ...renewal,
    approvalId: legacy.approvalId,
    idPrefix: legacy.idPrefix,
    capitalEuro: legacy.capitalEuro,
    maxOrdersPerDay: legacy.maxOrdersPerDay,
    maxProbeAttemptsTotal: legacy.maxProbeAttemptsTotal,
    maxNotionalEuroPerOrder: legacy.maxNotionalEuroPerOrder,
    maxCapitalPercentPerProbe: legacy.maxCapitalPercentPerProbe,
    maxSingleAssetWeightPercentForProbe: legacy.maxSingleAssetWeightPercentForProbe,
    minTcaProbeNotionalEuro: legacy.minTcaProbeNotionalEuro,
    minCommitteeScore: legacy.minCommitteeScore,
    minValidationDataConfidence: legacy.minValidationDataConfidence,
    maxRiskScore: legacy.maxRiskScore,
    minCalendarDays: legacy.minCalendarDays,
    minEvidenceDays: legacy.minEvidenceDays,
    targetPaperFills: legacy.targetPaperFills,
    fxPolicy: legacy.fxPolicy,
    permittedDecisionStates: legacy.permittedDecisionStates,
    permittedCurrencies: legacy.permittedCurrencies,
    previousV6AndV7HistoryImmutable: true,
  };
}
export function readV7B2ActiveApproval(read) {
  const legacy = read("paper-v7-b2-approval.json");
  const path = resolve("data","paper-v7-b2-reapproval.json");
  return selectV7B2ActiveApproval(legacy,
    existsSync(path) ? read("paper-v7-b2-reapproval.json") : null);
}

export function assessV7B2Preflight({approval,fingerprint,ledger,days,nowMs,shaAncestor}) {
  const blocked = reason=>({allowed:false,reason});
  if (!Number.isSafeInteger(nowMs)||nowMs<=0) return blocked("INVALID_CLOCK");
  if (approval?.liveTradingAllowed!==false||approval?.brokerConnectivityAllowed!==false
    ||ledger?.liveTradingAllowed!==false||ledger?.brokerConnectivityAllowed!==false
    ||days?.liveTradingAllowed!==false||days?.brokerConnectivityAllowed!==false)
    return blocked("LIVE_OR_BROKER_SAFETY_FAILURE");
  if (approval?.approved!==true||approval?.humanConfirmation!==true
    ||approval?.mode!=="PAPER") return blocked("NOT_PROSPECTIVELY_APPROVED");
  if (approval?.idPrefix!=="fenice-v7-b2-2026-"
    ||approval?.allowBackfill!==false||approval?.v6HistoricalFillsCredited!==0
    ||approval?.maxOrdersPerDay!==1||approval?.minCommitteeScore!==70
    ||approval?.minEvidenceDays<25||approval?.minCalendarDays<30
    ||approval?.targetPaperFills<10)
    return blocked("B2_POLICY_OR_HISTORY_CREDIT_INVALID");
  const start=Date.parse(approval.approvedAt||"");
  const end=Date.parse(approval.expiresAt||"");
  if (!Number.isFinite(start)||!Number.isFinite(end)
    ||end-start<30*86400000||nowMs<start||nowMs>=end)
    return blocked("OUTSIDE_APPROVED_FORWARD_WINDOW");
  if (!shaAncestor||!fingerprint?.complete
    ||approval?.coreFingerprint?.complete!==true
    ||approval.coreFingerprint.domain!==fingerprint.domain
    ||approval.coreFingerprint.digest!==fingerprint.digest
    ||JSON.stringify(approval.coreFingerprint.files)!==JSON.stringify(fingerprint.files))
    return blocked("FROZEN_CORE_FINGERPRINT_NOT_PINNED");
  const replay=replayV7PhaseBLedger(ledger);
  if (!replay.valid) return blocked("B2_LEDGER_TAMPER_"+replay.reason);
  if (days?.mode!=="V7_PHASE_B_FORWARD_DAYS"
    ||days.campaignId!=="fenice-paper-v7-b2-2026-11-02"
    ||!Array.isArray(days.days)
    ||days.days.some((d,i,all)=>!d||typeof d.date!=="string"
      ||(i>0&&all[i-1].date>=d.date)
      ||d.liveTradingAllowed!==false||d.brokerConnectivityAllowed!==false))
    return blocked("B2_DAILY_HISTORY_INVALID");
  // Preserve historical attempts for replay without accrediting earlier fills.
  if (approval?.previousApprovalId && ledger.attempts.some(e =>
    Date.parse(e.occurredAt || "") < Date.parse(approval.approvedAt)
    && e.status === "PAPER_FILLED"))
    return blocked("B2_PREVIOUS_EPOCH_FILLS_REQUIRE_INDEPENDENT_ACCOUNTING");
  if (replay.fills>=10||replay.attempts>=20) return blocked("B2_TOTAL_ATTEMPT_LIMIT");
  const today=new Date(nowMs).toISOString().slice(0,10);
  if (ledger.attempts.some(a=>a.occurredAt?.slice(0,10)===today)
    ||days.days.some(d=>d.date===today&&(d.marketEvidenceValid===true||d.fillCount>0)))
    return blocked("B2_DAY_ALREADY_CONFIRMED");
  return {allowed:true,reason:"FORWARD_PAPER_ONLY_OPEN_MARKET_CHECK_REQUIRED"};
}

async function main() {
  const read=n=>JSON.parse(readFileSync(resolve("data",n),"utf8"));
  const approval=readV7B2ActiveApproval(read);
  const ledger=read("paper-v7-b2-forward-ledger.json");
  const days=read("paper-v7-b2-forward-days.json");
  const fingerprint=await computeV7B2Fingerprint(".");
  let shaAncestor=false;
  const sha=approval.baselineCommit;
  if (/^[a-f0-9]{40}$/.test(String(sha||""))) {
    try {
      execFileSync("git",["merge-base","--is-ancestor",sha,"HEAD"],{stdio:"ignore"});
      shaAncestor=true;
    } catch { /* fail closed */ }
  }
  const decision=assessV7B2Preflight({
    approval,ledger,days,fingerprint,nowMs:Date.now(),shaAncestor
  });
  console.log("Fenice V7 B2 preflight: "+JSON.stringify({
    ...decision,mode:"PAPER_ONLY",observedFingerprint:fingerprint.digest,
    liveTradingAllowed:false,brokerConnectivityAllowed:false,
  }));
  const out=process.argv.includes("--github-output")?process.argv[process.argv.indexOf("--github-output")+1]:null;
  if (out) appendFileSync(out,"allowed="+decision.allowed+"\nreason="+decision.reason+"\n");
  if (decision.reason.startsWith("LIVE_OR_BROKER")||
      decision.reason.startsWith("B2_LEDGER_TAMPER")||
      decision.reason==="B2_DAILY_HISTORY_INVALID") process.exitCode=2;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
