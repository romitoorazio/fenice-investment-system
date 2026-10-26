/**
 * Advisory-only Phase B preparation safety check.
 *
 * Cannot issue an approval, stage a PAPER fill, read provider secrets,
 * touch V6 custody, or authorize broker/LIVE execution. Even a PASS here
 * means only that the unapproved proposal is internally coherent.
 */
const sha40 = x => typeof x === "string" && /^[a-f0-9]{40}$/.test(x);
const sha64 = x => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
const blockedFlags = [
  "newPaperOrdersAllowed", "brokerConnectivityAllowed",
  "brokerSubmissionAllowed", "liveTradingAllowed", "v6ApprovalRenewalAllowed",
  "v6EvidenceMutationAllowed", "oldFillsCountAsNewAllowed",
  "backdatingAllowed", "changeConfiguredProviderKeysAllowed",
  "autoApprovalAllowed", "autoPhaseBActivationAllowed",
];
const originalLimitFields = [
  "maxProbeAttemptsTotal", "maxOrdersPerDay", "minTcaProbeNotionalEuro",
  "maxNotionalEuroPerOrder", "maxCapitalPercentPerProbe",
  "maxSingleAssetWeightPercentForProbe", "minCommitteeScore",
  "minValidationDataConfidence", "maxRiskScore",
];
const iso = x => typeof x === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)
  && Number.isFinite(Date.parse(x)) && new Date(x).toISOString() === x;
const isPlainFalse = (obj, key) => obj !== null && typeof obj === "object"
  && Object.prototype.hasOwnProperty.call(obj, key) && obj[key] === false;
const allNull = (obj, keys) => keys.every(key => obj?.[key] === null);

export function assessV7PhaseBPreparation({
  manifest, approvalV6, campaignV6, ledgerV6, queueV6, continuationV6,
  nowMs = Date.now(),
} = {}) {
  const reasons = [];
  const test = (ok, reason) => { if (!ok) reasons.push(reason); };
  const m = manifest ?? {}, custody = m.v6Custody ?? {};
  const candidate = m.candidate ?? {}, next = m.authorization ?? {};
  const limits = m.proposedRiskLimits ?? {};
  const safety = m.safety ?? {}, intent = m.ownerInstruction ?? {};
  const original = continuationV6?.v6 ?? {};
  const validClock = Number.isSafeInteger(nowMs) && nowMs > Date.parse("2026-10-24T21:59:59.000Z");
  test(validClock, "CLOCK_NOT_POST_V6_EXPIRY");
  test(m.schemaVersion === 1 && m.mode === "PAPER_V7_PHASE_B_PREPARATION"
    && m.phase === "PREPARATION_ONLY" && m.createdOn === "2026-10-26",
    "MANIFEST_NOT_PREPARATION_ONLY");
  test(intent.scope === "PREPARE_ONLY" && intent.identityIndependentlyAuthenticated === false
    && intent.authorizesExecution === false && intent.authorizesNewPaperFills === false,
    "OWNER_PREPARATION_SCOPE_ESCALATED");
  test(blockedFlags.every(k => isPlainFalse(safety,k)), "UNSAFE_ACTIVATION_OR_CREDENTIAL_FLAGS");
  test(candidate.repository === "romitoorazio/fenice-investment-system"
    && sha40(candidate.referenceMainSha)
    && candidate.candidateBaselineCommit === null
    && candidate.candidateFingerprintSha256 === null
    && candidate.independentlyReviewed === false
    && candidate.riskCoreTimestampFixReviewed === false
    && candidate.marketDataGateReviewed === false,
  "UNVERIFIED_PHASE_B_BASELINE_CANNOT_BE_DECLARED_CERTIFIED");
  test(allNull(next,["approvalId","approvedAt","expiresAt","ownerSignatureVerification"])
    && next.approved === false && next.explicitPaperOnlyConsentVerified === false,
  "NEW_PAPER_AUTHORIZATION_MUST_BE_SEPARATELY_VERIFIED");
  test(custody.preserveReadOnly === true && custody.carryForwardHistoricalFillCredits === 0
    && custody.originalApprovalId === original.originalApprovalId
    && custody.originalExpiresAt === original.originalExpiresAt
    && custody.originalBaselineCommit === original.baselineCommit
    && custody.originalFingerprintSha256 === original.baselineDigest
    && sha40(custody.originalBaselineCommit) && sha64(custody.originalFingerprintSha256),
  "V6_CUSTODY_REFERENCE_INVALID");
  test(approvalV6?.approved === true && approvalV6?.mode === "PAPER"
    && approvalV6?.humanConfirmation === true
    && approvalV6?.approvalId === custody.originalApprovalId
    && approvalV6?.expiresAt === custody.originalExpiresAt
    && iso(approvalV6?.expiresAt)
    && Date.parse(approvalV6.expiresAt) < nowMs
    && approvalV6?.liveTradingAllowed === false
    && approvalV6?.brokerConnectivityAllowed === false,
  "ORIGINAL_V6_APPROVAL_NOT_PRESERVED_AND_EXPIRED");
  test(continuationV6?.phase === "PREPARATION_NOT_EXECUTION"
    && continuationV6?.absoluteRestrictions?.mayRenewV6Approval === false
    && continuationV6?.absoluteRestrictions?.mayStageNewProbesAfterOriginalExpiry === false
    && continuationV6?.absoluteRestrictions?.mayCountOldFillsAsNewPhaseFills === false,
  "V6_CONTINUATION_RESTRICTION_CHANGED");
  test(campaignV6?.version === 6
    && campaignV6?.baselineCommit === custody.originalBaselineCommit
    && campaignV6?.baselineFingerprint?.complete === true
    && campaignV6?.baselineFingerprint?.digest === custody.originalFingerprintSha256
    && campaignV6?.liveTradingAllowed === false
    && Array.isArray(campaignV6?.dailyEvidence)
    && campaignV6.dailyEvidence.length > 0,
  "V6_CAMPAIGN_FINGERPRINT_OR_HISTORY_INVALID");
  const events = Array.isArray(campaignV6?.dailyEvidence) ? campaignV6.dailyEvidence : [];
  let fillCount = 0, previousDate = "";
  let integrityOk = true;
  for (const event of events) {
    const day = event?.date;
    const increment = event?.newPaperFills;
    const cumul = event?.cumulativePaperFilled;
    if (typeof day !== "string" || !/^\d{4}-\d\d-\d\d$/.test(day)
      || day <= previousDate || !Number.isSafeInteger(increment) || increment < 0
      || !Number.isSafeInteger(cumul) || cumul !== fillCount + increment
      || (day > "2026-10-24" && increment !== 0)
      || event?.validationFingerprint?.digest !== custody.originalFingerprintSha256
      || event?.auditChainValid !== true || event?.reconciliationBalanced !== true
      || event?.liveTradingAllowed !== false) integrityOk = false;
    if (Number.isSafeInteger(increment) && increment >= 0) fillCount += increment;
    previousDate = day;
  }
  test(integrityOk, "V6_HISTORY_IMMUTABILITY_OR_POST_EXPIRY_FILL_INVALID");
  const executions = ledgerV6?.executions;
  const genuineFills = Array.isArray(executions)
    ? executions.filter(row => row?.status === "PAPER_FILLED").length : null;
  test(genuineFills !== null && genuineFills === fillCount
    && ledgerV6?.mode === "PAPER"
    && ledgerV6?.liveTradingAllowed === false
    && ledgerV6?.brokerConnectivityAllowed === false
    && ledgerV6?.reconciliation?.balanced === true
    && Array.isArray(ledgerV6?.reconciliation?.breaks)
    && ledgerV6.reconciliation.breaks.length === 0
    && Array.isArray(ledgerV6?.auditChain)
    && ledgerV6.auditChain.length === executions.length
    && queueV6?.mode === "PAPER"
    && Array.isArray(queueV6?.orders) && queueV6.orders.length === 0,
  "V6_LEDGER_AUDIT_OR_QUEUE_INCONSISTENT");
  test(limits.minCalendarDays === campaignV6?.requiredDays
    && limits.minEvidenceDays === campaignV6?.minEvidenceDays
    && limits.minGenuineNewPhaseFills === campaignV6?.minPaperFills,
  "PHASE_B_CERTIFICATION_MINIMUMS_CHANGED");
  test(originalLimitFields.every(k => limits[k] === approvalV6?.[k]
    && Number.isFinite(limits[k]))
    && JSON.stringify(limits.permittedDecisionStates) === JSON.stringify(approvalV6?.permittedDecisionStates)
    && JSON.stringify(limits.permittedCurrencies) === JSON.stringify(approvalV6?.permittedCurrencies)
    && JSON.stringify(limits.fxPolicy) === JSON.stringify(approvalV6?.fxPolicy),
  "PHASE_B_RISK_LIMITS_MORE_PERMISSIVE_OR_UNVERIFIABLE");

  const state = reasons.length ? "PREPARATION_INTEGRITY_BLOCKED" : "PREPARATION_SAFE_UNAPPROVED";
  return {
    state,
    reasons,
    referenceCandidateSha: sha40(candidate.referenceMainSha) ? candidate.referenceMainSha : null,
    historicalV6FillCount: genuineFills,
    historicalV6FillsCreditedToPhaseB: 0,
    newPhaseBFills: 0,
    newPhaseBStartedAt: null,
    newPhaseBApprovalExpiry: null,
    ownerPreparationInstructionAcknowledged: intent.scope === "PREPARE_ONLY",
    separatelyVerifiedOwnerApproval: false,
    technicalBaselineCertified: false,
    phaseBPaperCertified: false,
    // A passing preparation check MUST NEVER provide execution authority.
    allowsNewPaperFills: false,
    brokerSubmissionAllowed: false,
    liveTradingAllowed: false,
    credentialChangesPerformed: false,
    mutatesV6: false,
    diagnosticOnly: true,
  };
}
