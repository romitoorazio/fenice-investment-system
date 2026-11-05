// Independent PAPER-next preflight. This module cannot place orders or mutate ledgers.
// A new campaign must explicitly pin its own reviewed code fingerprint and owner consent.
export function assessPaperNextActivation({ approval, fingerprint, campaign, ledger, now }) {
  const block = (reason) => ({ allowed: false, reason, liveTradingAllowed: false });
  const nowMs = Date.parse(String(now ?? ""));
  if (!Number.isFinite(nowMs)) return block("INVALID_CLOCK");
  if (approval?.mode !== "PAPER" || campaign?.mode !== "PAPER" || ledger?.mode !== "PAPER")
    return block("PAPER_ONLY_REQUIRED");
  for (const record of [approval, campaign, ledger]) {
    if (record.liveTradingAllowed !== false || record.brokerConnectivityAllowed !== false)
      return block("LIVE_OR_BROKER_LOCK_INVALID");
  }
  if (approval.approved !== true || approval.humanConfirmation !== true)
    return block("EXPLICIT_APPROVAL_REQUIRED");
  if (!approval.approvalId || approval.approvalId !== campaign.approvalId)
    return block("CAMPAIGN_APPROVAL_MISMATCH");
  if (!fingerprint?.complete || !/^[a-f0-9]{64}$/.test(String(fingerprint.digest ?? "")))
    return block("FINGERPRINT_INCOMPLETE");
  if (approval.fingerprintDigest !== fingerprint.digest
    || campaign.fingerprintDigest !== fingerprint.digest)
    return block("FINGERPRINT_MISMATCH");
  if (!/^[a-f0-9]{40}$/.test(String(campaign.baselineCommit ?? ""))
    || campaign.baselineCommit !== approval.baselineCommit)
    return block("BASELINE_COMMIT_MISMATCH");
  const start = Date.parse(String(approval.approvedAt ?? ""));
  const end = Date.parse(String(approval.expiresAt ?? ""));
  if (!Number.isFinite(start) || !Number.isFinite(end)
    || end <= start || nowMs < start || nowMs >= end)
    return block("OUTSIDE_APPROVED_WINDOW");
  if (approval.allowBackfill !== false || approval.historicalFillsCredited !== 0)
    return block("HISTORICAL_CREDIT_FORBIDDEN");
  if (!Array.isArray(ledger.attempts) || ledger.attempts.length !== 0
    || Object.keys(ledger.positions ?? {}).length !== 0)
    return block("NEW_LEDGER_MUST_START_AT_GENESIS");
  if (approval.maxOrdersPerDay !== 1
    || !Number.isFinite(approval.minCommitteeScore) || approval.minCommitteeScore < 70
    || !Number.isFinite(approval.minValidationDataConfidence) || approval.minValidationDataConfidence < 90
    || !Number.isFinite(approval.maxRiskScore) || approval.maxRiskScore > 75 || approval.maxRiskScore < 0
    || !Number.isFinite(approval.maxNotionalEuroPerOrder) || approval.maxNotionalEuroPerOrder > 300 || approval.maxNotionalEuroPerOrder <= 0
    || !Number.isFinite(approval.maxCapitalPercentPerProbe) || approval.maxCapitalPercentPerProbe > 3 || approval.maxCapitalPercentPerProbe <= 0
    || !Number.isFinite(approval.maxSingleAssetWeightPercentForProbe) || approval.maxSingleAssetWeightPercentForProbe > 15 || approval.maxSingleAssetWeightPercentForProbe <= 0)
    return block("RISK_LIMITS_NOT_PRESERVED");
  return { allowed: true, reason: "ISOLATED_PAPER_BASELINE_APPROVED", liveTradingAllowed: false };
}
