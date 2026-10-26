/**
 * V7 Phase B PAPER budget screening only.
 *
 * Pure arithmetic for hypothetical PAPER intents. Neither a caller-provided
 * ledger nor a successful number check establishes authentication, quote
 * rights, source quorum, venue OPEN, an immutable Phase B ledger or authority
 * to run a PAPER simulator. In particular this module NEVER returns an
 * execution grant, even for a numerically valid input.
 */
const positive = n => typeof n === "number" && Number.isFinite(n) && n > 0;
const nonnegative = n => typeof n === "number" && Number.isFinite(n) && n >= 0;
const utcTimestamp = value => {
  if (typeof value !== "string"
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) && new Date(t).toISOString() === value ? t : null;
};
const id = value => typeof value === "string" && /^[A-Za-z0-9._-]{8,80}$/.test(value);
const symbol = value => typeof value === "string" && /^[A-Z0-9][A-Z0-9._:-]{0,23}$/.test(value);

export function assessV7PhaseBProposedPaperBudget({
  limits, virtualEquityEuro, virtualCashEuro, currentAssetExposureEuro = 0,
  intent, previousPhaseBAttempts = [], nowMs = Date.now(),
} = {}) {
  const reasons = [];
  const requireOk = (ok,code) => { if (!ok) reasons.push(code); };
  // This is an exact policy profile, not a dynamically loosenable cap.
  const policyValid = limits?.maxOrdersPerDay === 1
    && limits?.maxProbeAttemptsTotal === 20
    && limits?.minTcaProbeNotionalEuro === 250
    && limits?.maxNotionalEuroPerOrder === 300
    && limits?.maxCapitalPercentPerProbe === 3
    && limits?.maxSingleAssetWeightPercentForProbe === 15
    && limits?.minGenuineNewPhaseFills === 10
    && limits?.minCalendarDays === 30
    && limits?.minEvidenceDays === 25;
  requireOk(policyValid,"PHASE_B_POLICY_NOT_EXACTLY_APPROVED_LIMITS");
  requireOk(Number.isSafeInteger(nowMs) && nowMs >= 946684800000
    && nowMs <= 8.64e15,"PHASE_B_CLOCK_INVALID");
  requireOk(positive(virtualEquityEuro) && positive(virtualCashEuro)
    && virtualCashEuro <= virtualEquityEuro
    && nonnegative(currentAssetExposureEuro)
    && currentAssetExposureEuro <= virtualEquityEuro,
  "VIRTUAL_CAPITAL_OR_EXPOSURE_INVALID");
  const notional = intent?.proposedNotionalEuro;
  const intentAt = utcTimestamp(intent?.createdAt);
  const amountValid = positive(notional) && Number.isSafeInteger(nowMs)
    && positive(virtualEquityEuro)
    && notional >= 250 && notional <= 300
    && notional <= virtualCashEuro
    && notional <= virtualEquityEuro * .03
    && nonnegative(currentAssetExposureEuro)
    && currentAssetExposureEuro + notional <= virtualEquityEuro * .15;
  requireOk(amountValid,"NOTIONAL_EXCEEDS_PHASE_B_BUDGET_OR_MINIMUM");
  requireOk(id(intent?.id) && symbol(intent?.symbol)
    && ["BUY","SELL"].includes(intent?.side)
    && intentAt !== null
    && Number.isSafeInteger(nowMs) && intentAt <= nowMs
    && nowMs - intentAt <= 180_000
    && intent?.phase === "V7_PHASE_B",
  "INTENT_ID_TIME_SIDE_OR_PHASE_INVALID");

  let priorValid = Array.isArray(previousPhaseBAttempts)
    && previousPhaseBAttempts.length <= 20;
  const seen = new Set(), recordedDates = new Set();
  if (priorValid) for (const item of previousPhaseBAttempts) {
    const ms = utcTimestamp(item?.createdAt);
    if (item?.phase !== "V7_PHASE_B" || !id(item?.id) || seen.has(item.id)
      || ms === null || ms > nowMs
      || !["ATTEMPTED","SIM_FILLED","RISK_REJECTED"].includes(item?.status)) {
      priorValid = false;
      break;
    }
    const day = item.createdAt.slice(0,10);
    if (recordedDates.has(day)) {
      priorValid = false;
      break;
    }
    recordedDates.add(day);
    seen.add(item.id);
  }
  requireOk(priorValid,"PRIOR_PHASE_B_ATTEMPTS_UNVERIFIABLE_OR_DUPLICATE");
  requireOk(priorValid && previousPhaseBAttempts.length < 20,
    "PHASE_B_TOTAL_20_ATTEMPT_CAP_REACHED");
  requireOk(priorValid && !seen.has(intent?.id), "DUPLICATE_PHASE_B_INTENT");
  requireOk(priorValid && intentAt !== null
    && !recordedDates.has(intent.createdAt.slice(0,10)),
  "PHASE_B_ONE_ATTEMPT_PER_UTC_DAY");

  return {
    state: reasons.length ? "NUMERIC_PHASE_B_SCREEN_BLOCKED"
      : "NUMERIC_ONLY_NOT_AUTHORIZED",
    reasons,
    proposedVirtualNotionalEuro: positive(notional) ? notional : null,
    virtualEquityEuro: positive(virtualEquityEuro) ? virtualEquityEuro : null,
    proposedCapEuro: positive(virtualEquityEuro)
      ? Math.min(300,virtualEquityEuro * .03) : null,
    recordedPhaseBAttempts: priorValid ? previousPhaseBAttempts.length : null,
    numericalScreenOnly: true,
    // Independently signed owner approval, live source rights, real market
    // evidence and an immutable audited writer are NOT passed to this API.
    approvalVerified: false,
    sourceRightsVerified: false,
    finalBaselineVerified: false,
    appendOnlyLedgerVerified: false,
    canQueueSimulatedPaperOrder: false,
    canCreatePhaseBFill: false,
    canSubmitBrokerOrder: false,
    liveTradingAllowed: false,
    modifiesV6: false,
    credentialChangesPerformed: false,
  };
}
