/**
 * Read-only PAPER certification calendar. This is a DISPLAY/DIAGNOSTIC check,
 * NOT certification, order authority, or permission to modify V6 approval.
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
  expiresAt?: string | null;
  liveTradingAllowed?: boolean;
  brokerConnectivityAllowed?: boolean;
};

const DAY_MS = 86_400_000;

function utcTime(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === new Date(value).toISOString()
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
  const nowValid = Number.isFinite(now) && now >= 0;
  const started = utcTime(campaign?.startedAt);
  const expires = utcTime(approval?.expiresAt);
  const durationDays = positiveInteger(campaign?.requiredDays);
  const requiredEvidenceDays = positiveInteger(campaign?.minEvidenceDays);
  const requiredFills = positiveInteger(campaign?.minPaperFills);
  const calendarValid = nowValid && started !== null && durationDays !== null
    && requiredEvidenceDays !== null && requiredFills !== null;
  const earliestTime = calendarValid ? started + durationDays * DAY_MS : null;
  const earliestValid = earliestTime !== null && Number.isSafeInteger(earliestTime);
  const earliestMaturityAt = earliestValid ? new Date(earliestTime).toISOString() : null;
  const authorizationExpiresAt = expires !== null ? new Date(expires).toISOString() : null;
  const approvalValid = approval?.approved === true && expires !== null
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
    && (utcTime(row.observedAt) as number) <= now) : [];
  const evidenceDays = new Set(eligibleRows.map((row) => row.date)).size;
  const lastRow = [...eligibleRows].sort((a, b) =>
    (utcTime(b.observedAt) || 0) - (utcTime(a.observedAt) || 0))[0];
  const reportedFills = Number.isSafeInteger(lastRow?.cumulativePaperFilled)
    && (lastRow?.cumulativePaperFilled ?? 0) >= 0 ? lastRow!.cumulativePaperFilled! : 0;
  const elapsedDays = calendarValid ? Math.max(0, Math.floor((now - started) / DAY_MS)) : 0;
  const daysToMinMaturity = earliestValid ? Math.max(0, Math.ceil((earliestTime - now) / DAY_MS)) : null;
  const numericalTargetsMet = calendarValid && earliestValid
    && now >= earliestTime && evidenceDays >= requiredEvidenceDays && reportedFills >= requiredFills;
  const ownerActionRequired = !calendarValid || !earliestValid || !approvalValid
    || authorizationExpired || deadlineBeforeMaturity;
  const state = !calendarValid || !earliestValid || !approvalValid
    ? "INVALID_POLICY"
    : authorizationExpired
      ? "AUTHORIZATION_EXPIRED"
      : deadlineBeforeMaturity
        ? "AUTHORIZATION_EXPIRES_BEFORE_MATURITY"
        : numericalTargetsMet ? "NUMERICAL_TARGETS_MET_REVIEW_ONLY" : "IN_PROGRESS";

  return {
    state,
    earliestMaturityAt,
    authorizationExpiresAt,
    deadlineBeforeMaturity,
    authorizationExpired,
    ownerActionRequired,
    approvalValid,
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
