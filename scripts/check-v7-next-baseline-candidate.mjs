import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { computeV7PhaseBFingerprint } from "../lib/trading/paper-v7-phase-b-forward-fingerprint.mjs";
import { resolve } from "node:path";

export function assessNextBaselineCandidate({
  candidate, approval, observedFingerprint, oldLedger, oldDays, v6Campaign
}) {
  const reasons = [];
  const next = candidate?.proposedCoreFingerprint || {};
  const consent = candidate?.prospectiveApproval || {};
  const approvedDigest = approval?.coreFingerprint?.digest;
  if (candidate?.mode !== "V7_NEXT_BASELINE_CANDIDATE_ONLY"
      || candidate?.status !== "PREPARED_NOT_AUTHORIZED") reasons.push("CANDIDATE_SCOPE_INVALID");
  if (next.algorithm !== "sha256" || next.domain !== "FENICE_V7_PHASE_B_FORWARD_CORE_V1"
    || next.digest !== observedFingerprint?.digest || observedFingerprint?.complete !== true
    || !/^[a-f0-9]{64}$/.test(String(next.digest||"")))
    reasons.push("CANDIDATE_CORE_FINGERPRINT_MISMATCH");
  if (next.digest === approvedDigest || candidate?.currentApprovedFingerprintDigest !== approvedDigest
    || approval?.approved !== true || approval?.humanConfirmation !== true
    || approval?.liveTradingAllowed !== false || approval?.brokerConnectivityAllowed !== false)
    reasons.push("PREVIOUS_APPROVAL_MISMATCH");
  if (consent.approved !== false || consent.humanConfirmation !== false
    || consent.baselineCommit !== null || consent.approvedAt !== null
    || consent.expiresAt !== null || consent.explicitConsentRequired !== true
    || consent.liveTradingAllowed !== false || consent.brokerConnectivityAllowed !== false
    || consent.allowBackfill !== false || consent.carryForwardHistoricalFills !== 0
    || consent.minCalendarDays < 30 || consent.minEvidenceDays < 25
    || consent.minGenuineForwardPaperFills < 10 || consent.maxOrdersPerDay !== 1
    || consent.minCommitteeScore !== 70)
    reasons.push("UNAUTHORIZED_OR_LOOSENED_NEXT_APPROVAL");
  if (oldLedger?.mode !== "V7_PHASE_B_FORWARD_PAPER"
    || oldLedger?.liveTradingAllowed !== false || oldLedger?.brokerConnectivityAllowed !== false
    || !Array.isArray(oldLedger?.attempts)
    || oldDays?.mode !== "V7_PHASE_B_FORWARD_DAYS"
    || !Array.isArray(oldDays?.days)
    || oldDays.days.some(day=>day.liveTradingAllowed !== false
      || day.brokerConnectivityAllowed !== false)
    || v6Campaign?.liveTradingAllowed !== false
    || !Array.isArray(v6Campaign?.dailyEvidence))
    reasons.push("PREVIOUS_EVIDENCE_UNSAFE_OR_MISSING");
  return {
    candidatePrepared: reasons.length === 0,
    activationAllowed: false,
    certificationReady: false,
    liveTradingAllowed: false,
    brokerConnectivityAllowed: false,
    oldCampaignResetAllowed: false,
    reasons: reasons.length ? reasons : ["CANDIDATE_PREPARED_SEPARATE_APPROVAL_AND_FORWARD_LEDGER_REQUIRED"],
    currentApprovedDigest: approvedDigest || null,
    proposedDigest: next.digest || null,
    retainedPriorV7Days: oldDays?.days?.length ?? null,
    retainedPriorV7Attempts: oldLedger?.attempts?.length ?? null,
  };
}

async function main() {
  const load = (p) => JSON.parse(readFileSync(resolve("data",p),"utf8"));
  const fingerprint = await computeV7PhaseBFingerprint(resolve("."));
  const report = assessNextBaselineCandidate({
    candidate:load("paper-v7-next-baseline-candidate.json"),
    approval:load("paper-v7-phase-b-approval.json"),
    observedFingerprint:fingerprint,
    oldLedger:load("paper-v7-phase-b-forward-ledger.json"),
    oldDays:load("paper-v7-phase-b-forward-days.json"),
    v6Campaign:load("paper-validation-campaign.json"),
  });
  console.log("Fenice next baseline preflight: "+JSON.stringify(report));
  if (!report.candidatePrepared || report.activationAllowed !== false) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  await main();
}
