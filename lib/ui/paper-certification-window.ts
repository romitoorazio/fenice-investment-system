/**
 * Read-only PAPER certification calendar. This is a DISPLAY/DIAGNOSTIC check,
 * NOT certification, order authority, or permission to modify V6 approval.
 * V6 approval covers NEW probe writes; its expiry cannot erase prior evidence
 * or prevent passive calendar maturation. Canonical gates remain authoritative.
 * Do not import into the fingerprinted PAPER execution pipeline.
 */
type EvidenceRow = {
  date?: string;
  observedAt?: string;
  cumulativePaperFilled?: number;
};
type Campaign = {
  startedAt?: string | null;
  requiredDays?: number;
  minEvidenceDays?: number;
  minPaperFills?: number;
  dailyEvidence?: EvidenceRow[];
};
type Approval = {
  approved?: boolean;
  approvedAt?: string | null;
  expiresAt?: string | null;
  mode?: string;
  humanConfirmation?: boolean;
  liveTradingAllowed?: boolean;
  brokerConnectivityAllowed?: boolean;
};

const DAY_MS = 86_400_000;

function utcTime(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  const canonicalInput = value.includes(".") ? value : value.replace(/Z$/, ".000Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === canonicalInput
    ? parsed : null;
}
function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\d$/.test(value)) return false;
  const n = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value;
}
function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * Counts below are REPORTED historical progress, not independently certified
 * fills or signed evidence. A temporal gate alone can never authorize LIVE.
 */
export function summarizePaperCertificationWindow(
  campaign: Campaign | null | undefined,
  approval: Approval | null | undefined,
  now: number = Date.now(),
) {
  const nowValid = Number.isSafeInteger(now) && now >= 0 && now <= 8.64e15;
  const started = utcTime(campaign?.startedAt);
  const expires = utcTime(approval?.expiresAt);
  const approvedAt = utcTime(approval?.approvedAt);
  const durationDays = positiveInteger(campaign?.requiredDays);
  const requiredEvidenceDays = positiveInteger(campaign?.minEvidenceDays);
  const requiredFills = positiveInteger(campaign?.minPaperFills);
  const calendarValid = nowValid && started !== null && started <= now && durationDays !== null
    && requiredEvidenceDays !== null && requiredFills !== null;
  const earliestTime = calendarValid ? started + durationDays * DAY_MS : null;
  const earliestValid = earliestTime !== null && Number.isSafeInteger(earliestTime);
  const earliestMaturityAt = earliestValid ? new Date(earliestTime).toISOString() : null;
  const authorizationExpiresAt = expires !== null ? new Date(expires).toISOString() : null;
  const approvalValid = approval?.approved === true && expires !== null && nowValid
    && approvedAt !== null && approvedAt <= now && expires > approvedAt
    && started !== null && started >= approvedAt && started < expires
    && approval?.mode === "PAPER" && approval?.humanConfirmation === true
    && approval?.liveTradingAllowed === false && approval?.brokerConnectivityAllowed === false;
  const authorizationExpired = expires !== null && nowValid && now >= expires;
  const deadlineBeforeMaturity = earliestValid && expires !== null && expires < earliestTime;
  const rows = Array.isArray(campaign?.dailyEvidence) ? campaign.dailyEvidence : [];
  const currentDay = nowValid ? new Date(now).toISOString().slice(0, 10) : "";
  const startedDay = started !== null ? new Date(started).toISOString().slice(0, 10) : "";
  const eligibleRows = calendarValid ? rows.filter((row) =>
    validDay(row?.date) && row.date >= startedDay && row.date <= currentDay
    && utcTime(row?.observedAt) !== null
    && (utcTime(row.observedAt) as number) >= started
    && (utcTime(row.observedAt) as number) <= now
    && row.date === new Date(utcTime(row.observedAt)!).toISOString().slice(0, 10)) : [];
  const evidenceDays = new Set(eligibleRows.map((row) => row.date)).size;
  const lastRow = [...eligibleRows].sort((a, b) =>
    (utcTime(b.observedAt) || 0) - (utcTime(a.observedAt) || 0))[0];
  const reportedFills = Number.isSafeInteger(lastRow?.cumulativePaperFilled)
    && (lastRow?.cumulativePaperFilled ?? 0) >= 0 ? lastRow!.cumulativePaperFilled! : 0;
  const authorizedRows = expires === null ? [] : eligibleRows.filter(row => utcTime(row.observedAt)! <= expires);
  const lastAuthorizedRow = [...authorizedRows].sort((a, b) => utcTime(b.observedAt)! - utcTime(a.observedAt)!)[0];
  const authorizedReportedFills = Number.isSafeInteger(lastAuthorizedRow?.cumulativePaperFilled)
    && (lastAuthorizedRow?.cumulativePaperFilled ?? 0) >= 0 ? lastAuthorizedRow!.cumulativePaperFilled! : 0;
  const postExpiryFillIncreaseDetected = expires !== null && eligibleRows.some(row =>
    utcTime(row.observedAt)! > expires && Number.isSafeInteger(row.cumulativePaperFilled)
    && row.cumulativePaperFilled! > authorizedReportedFills);
  const fillCounterRegressionDetected = reportedFills < authorizedReportedFills;
  const elapsedDays = calendarValid ? Math.max(0, Math.floor((now - started) / DAY_MS)) : 0;
  const daysToMinMaturity = earliestValid ? Math.max(0, Math.ceil((earliestTime - now) / DAY_MS)) : null;
  const numericalTargetsMet = calendarValid && earliestValid
    && now >= earliestTime && evidenceDays >= requiredEvidenceDays
    && authorizedReportedFills >= requiredFills && reportedFills >= authorizedReportedFills
    && !postExpiryFillIncreaseDetected;
  const fillTargetReportedMet = requiredFills !== null && authorizedReportedFills >= requiredFills;
  const newProbeWindowOpen = calendarValid && earliestValid && approvalValid && !authorizationExpired;
  const approvalRenewalRequiredForMissingFills = authorizationExpired && !fillTargetReportedMet;
  const ownerActionRequired = !calendarValid || !earliestValid || !approvalValid
    || approvalRenewalRequiredForMissingFills || postExpiryFillIncreaseDetected || fillCounterRegressionDetected;
  const state = !calendarValid || !earliestValid || !approvalValid
    ? "INVALID_POLICY"
    : fillCounterRegressionDetected ? "FILL_COUNTER_REGRESSION_REVIEW_REQUIRED"
    : postExpiryFillIncreaseDetected ? "POST_EXPIRY_FILL_INCREASE_REVIEW_REQUIRED"
      : numericalTargetsMet ? "NUMERICAL_TARGETS_MET_REVIEW_ONLY"
      : authorizationExpired
        ? fillTargetReportedMet ? "POST_APPROVAL_OBSERVATION" : "AUTHORIZATION_EXPIRED"
        : deadlineBeforeMaturity ? "POST_APPROVAL_OBSERVATION_PLANNED" : "IN_PROGRESS";

  return {
    state,
    earliestMaturityAt,
    authorizationExpiresAt,
    deadlineBeforeMaturity,
    authorizationExpired,
    ownerActionRequired,
    approvalValid,
    approvalScope: "NEW_PAPER_PROBES_ONLY" as const,
    newProbeWindowOpen,
    fillTargetReportedMet,
    authorizedReportedFills,
    postExpiryFillIncreaseDetected,
    fillCounterRegressionDetected,
    approvalRenewalRequiredForMissingFills,
    campaignMaturityRequiresActiveApproval: false as const,
    postExpiryObservationAllowed: calendarValid && earliestValid && approvalValid,
    elapsedDays,
    requiredDays: durationDays,
    evidenceDays,
    requiredEvidenceDays,
    reportedFills,
    requiredFills,
    latestEvidenceDate: lastRow?.date ?? null,
    daysToMinMaturity,
    numericalTargetsMet,
    // No numeric calculation or historical record can unlock trading.
    liveTradingAllowed: false,
    brokerConnectivityAllowed: false,
    certified: false,
  };
}
