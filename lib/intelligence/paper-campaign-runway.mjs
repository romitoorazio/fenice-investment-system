const DAY_MS = 86_400_000;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function isWeekday(date) {
  const day = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

function utcDayStartMs(date) {
  return Date.parse(`${date}T00:00:00.000Z`);
}

function datesInclusive(startDate, endDate) {
  const rows = [];
  let cursor = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  while (Number.isFinite(cursor) && cursor <= end) {
    rows.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += DAY_MS;
  }
  return rows;
}

export function evaluatePaperCampaignRunway({
  now = Date.now(),
  campaign,
  approval,
  cumulativePaperFills = 0,
  probesPerDay = new Map(),
  recoveryWindowStartMinuteUtc = 875,
  recoveryWindowEndMinuteUtc = 1170,
} = {}) {
  const nowMs = Number(now);
  if (!Number.isFinite(nowMs)) throw new Error("INVALID_RUNWAY_CLOCK");

  const today = new Date(nowMs).toISOString().slice(0, 10);
  const expiresAtMs = Date.parse(String(approval?.expiresAt || ""));
  const expiryDate = Number.isFinite(expiresAtMs) ? new Date(expiresAtMs).toISOString().slice(0, 10) : null;
  const startedAtMs = Date.parse(String(campaign?.startedAt || ""));
  const requiredDays = Math.max(1, Math.floor(finite(campaign?.requiredDays, 30)));
  const targetFills = Math.max(0, Math.floor(finite(approval?.targetPaperFills, campaign?.minPaperFills ?? 10)));
  const maxOrdersPerDay = Math.max(1, Math.floor(finite(approval?.maxOrdersPerDay, 1)));
  const fills = Math.max(0, Math.floor(finite(cumulativePaperFills, 0)));
  const remainingFills = Math.max(0, targetFills - fills);

  // Canonical V6 maturity uses floor((now - startedAt) / DAY_MS) >= requiredDays.
  // Therefore 30 required days means 30 full elapsed 24h periods, not "start day = day 1".
  const calendarMaturityAtMs = Number.isFinite(startedAtMs)
    ? startedAtMs + requiredDays * DAY_MS
    : null;
  const calendarMaturityAt = Number.isFinite(calendarMaturityAtMs)
    ? new Date(calendarMaturityAtMs).toISOString()
    : null;
  const approvalExpiresAt = Number.isFinite(expiresAtMs) ? new Date(expiresAtMs).toISOString() : null;
  const maturityBeforeApprovalExpiry = Number.isFinite(calendarMaturityAtMs) && Number.isFinite(expiresAtMs)
    ? calendarMaturityAtMs <= expiresAtMs
    : false;
  const maturityApprovalBufferHours = Number.isFinite(calendarMaturityAtMs) && Number.isFinite(expiresAtMs)
    ? Math.round(((expiresAtMs - calendarMaturityAtMs) / 3_600_000) * 10) / 10
    : null;
  // The approval authorizes NEW PAPER probe writes. It does not invalidate
  // already-recorded evidence or prevent passive calendar maturation after
  // the final authorized fill. Keep this distinction explicit so a campaign
  // is never reset or extended merely because maturity falls after expiry.
  const maturityWindowState = maturityApprovalBufferHours === null
    ? "UNKNOWN"
    : maturityBeforeApprovalExpiry
      ? (maturityApprovalBufferHours < 24 ? "TIGHT" : "SAFE")
      : "POST_APPROVAL_OBSERVATION";

  const opportunitySlots = [];
  if (expiryDate && expiresAtMs >= nowMs) {
    for (const date of datesInclusive(today, expiryDate)) {
      if (!isWeekday(date)) continue;
      const dayStartMs = utcDayStartMs(date);
      const windowStartMs = dayStartMs + recoveryWindowStartMinuteUtc * 60_000;
      const windowEndMs = dayStartMs + recoveryWindowEndMinuteUtc * 60_000;
      const effectiveStartMs = Math.max(windowStartMs, nowMs);
      const effectiveEndMs = Math.min(windowEndMs, expiresAtMs);
      if (effectiveStartMs > effectiveEndMs) continue;

      const used = date === today ? Math.max(0, Math.floor(finite(probesPerDay?.get?.(date), 0))) : 0;
      const capacity = Math.max(0, maxOrdersPerDay - used);
      for (let i = 0; i < capacity; i += 1) opportunitySlots.push(date);
    }
  }

  const availableProbeSlotsBeforeExpiry = opportunitySlots.length;
  const fillSlotBuffer = availableProbeSlotsBeforeExpiry - remainingFills;
  const earliestTargetFillDate = remainingFills === 0
    ? today
    : opportunitySlots[remainingFills - 1] || null;
  const fillRunwayState = remainingFills === 0
    ? "TARGET_REACHED"
    : fillSlotBuffer < 0
      ? "INSUFFICIENT"
      : fillSlotBuffer <= 2
        ? "TIGHT"
        : "SAFE";

  return {
    generatedAt: new Date(nowMs).toISOString(),
    approvalExpiresAt,
    approvalExpired: !Number.isFinite(expiresAtMs) || expiresAtMs < nowMs,
    approvalScope: "NEW_PAPER_PROBES_ONLY",
    campaignMaturityRequiresActiveApproval: false,
    postExpiryObservationAllowed: true,
    calendarMaturityAt,
    maturityBeforeApprovalExpiry,
    maturityApprovalBufferHours,
    maturityWindowState,
    targetFills,
    cumulativePaperFills: fills,
    remainingFills,
    maxOrdersPerDay,
    availableProbeSlotsBeforeExpiry,
    fillSlotBuffer,
    earliestTargetFillDate,
    fillRunwayState,
    assumptions: {
      weekdaySlotsAreUpperBound: true,
      recoveryWindowUtcMinutes: [recoveryWindowStartMinuteUtc, recoveryWindowEndMinuteUtc],
      exchangeHolidaysAndProviderFailuresMayReduceSlots: true,
      noLiveOrBrokerExecutionImplied: true,
    },
  };
}
