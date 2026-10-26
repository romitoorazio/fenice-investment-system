/**
 * Review a PINNED V7 isolated simulation candidate, never an authority gate.
 * Code/reference integrity is not a signed Phase B baseline. No runtime
 * caller can convert this diagnostic into permission to simulate fills.
 */
const int = x => typeof x === "number" && Number.isFinite(x);
const sha = x => typeof x === "string" && /^[a-f0-9]{40}$/.test(x);
const extract = (source, name) => {
  if (typeof source !== "string") return null;
  const re = new RegExp("^const " + name + " = ([0-9]+(?:\\.[0-9]+)?);$", "gm");
  const matches = [...source.matchAll(re)];
  return matches.length === 1 ? Number(matches[0][1]) : null;
};
export function assessV7PhaseBCandidate({ candidate, manifest, worldEngineSource,
  allPinnedGitBlobsMatch = false, v6FrozenUnchanged = false } = {}) {
  const reasons = [];
  const failIf = (condition, reason) => { if (condition) reasons.push(reason); };
  const limits = manifest?.proposedRiskLimits || {};
  const positionFraction = extract(worldEngineSource, "MAX_POSITION_FRACTION");
  const initialVirtualCashEuro = extract(worldEngineSource, "INITIAL_WORLD_PAPER_CASH_EURO");
  const candidateReferenceValid = candidate?.mode === "V7_PHASE_B_CODE_CANDIDATE_REVIEW"
    && candidate?.state === "REFERENCE_ONLY_NOT_CERTIFIED"
    && sha(candidate?.referenceCommitSha)
    && candidate?.limitations?.candidateBaselineApproved === false
    && candidate?.limitations?.phaseBFingerprintSigned === false
    && candidate?.security?.approvalGranted === false
    && candidate?.security?.canQueuePaperOrders === false
    && candidate?.security?.canSubmitBrokerOrders === false
    && candidate?.security?.liveTradingAllowed === false;
  failIf(!candidateReferenceValid, "PINNED_CANDIDATE_INVALID");
  failIf(allPinnedGitBlobsMatch !== true, "PINNED_GIT_BLOBS_UNVERIFIED");
  failIf(v6FrozenUnchanged !== true, "FROZEN_V6_CUSTODY_UNVERIFIED");
  failIf(manifest?.phase !== "PREPARATION_ONLY"
    || manifest?.authorization?.approved !== false
    || manifest?.authorization?.expiresAt !== null
    || manifest?.candidate?.candidateBaselineCommit !== null
    || manifest?.safety?.newPaperOrdersAllowed !== false
    || manifest?.safety?.liveTradingAllowed !== false
    || manifest?.safety?.changeConfiguredProviderKeysAllowed !== false,
  "OWNER_PREPARATION_IS_NOT_EXECUTION_AUTHORITY");
  const proposedCap = int(limits.maxCapitalPercentPerProbe)
    ? limits.maxCapitalPercentPerProbe / 100 : null;
  failIf(!int(positionFraction) || !int(proposedCap)
    || positionFraction > proposedCap, "V7_POSITION_CAP_EXCEEDS_PHASE_B_3_PERCENT");
  failIf(!int(initialVirtualCashEuro) || !int(proposedCap)
    || !int(limits.minTcaProbeNotionalEuro)
    || initialVirtualCashEuro * proposedCap < limits.minTcaProbeNotionalEuro,
  "V7_VIRTUAL_EQUITY_TOO_SMALL_FOR_MINIMUM_TCA_PROBE");
  failIf(!int(limits.maxOrdersPerDay) || limits.maxOrdersPerDay !== 1
    || !int(limits.maxProbeAttemptsTotal) || limits.maxProbeAttemptsTotal !== 20,
  "PHASE_B_DAILY_AND_TOTAL_ATTEMPT_POLICY_INVALID");
  // The existing isolated global engine does not presently incorporate
  // the separate Phase B campaign clock, owner-authenticated approval and
  // max-one-per-day / max-20-attempts ledger. These require a NEW isolated
  // wiring + end-to-end tests, not a string scan that could be spoofed.
  reasons.push("PHASE_B_DAILY_ATTEMPT_APPROVAL_AND_AUDIT_WIRING_NOT_REVIEWED");
  reasons.push("INDEPENDENT_V7_EXECUTION_SOURCE_RIGHTS_NOT_ATTESTED");
  reasons.push("NEW_PHASE_B_BASELINE_FINGERPRINT_AND_EXPIRY_NOT_APPROVED");
  return {
    state: reasons.length ? "CANDIDATE_BLOCKED_FOR_PHASE_B_EXECUTION" : "REVIEW_PENDING",
    reasons,
    referenceCommitSha: candidateReferenceValid ? candidate.referenceCommitSha : null,
    checkedPinnedGitBlobs: allPinnedGitBlobsMatch === true,
    v6FrozenUnchanged: v6FrozenUnchanged === true,
    worldEngineVirtualSeedEuro: initialVirtualCashEuro,
    worldEngineMaxPositionPercent: int(positionFraction) ? positionFraction * 100 : null,
    proposedMaxPerProbePercent: int(proposedCap) ? proposedCap * 100 : null,
    proposedMinProbeEuro: limits.minTcaProbeNotionalEuro ?? null,
    requiredFreshSourceFamilies: 2,
    candidateApprovedBaseline: false,
    phaseBApprovalPresent: false,
    maySubmitPaperIntents: false,
    mayProducePhaseBFills: false,
    maySubmitBrokerOrders: false,
    liveTradingAllowed: false,
    credentialChangesPerformed: false,
    reportOnly: true,
  };
}
