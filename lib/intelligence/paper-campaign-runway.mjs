const DAY_MS = 86_400_000;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function utcDate(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
}

function isWeekday(date) {
  const day = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  return day >= 1 && day <= 5;
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

  const calendarMaturityAtMs = Number.isFinite(startedAtMs)
    ? startedAtMs + (requiredDays - 1) * DAY_MS
    : null;
  const calendarMaturityAt = Number.isFinite(calendarMaturityAtMs)
    ? new Date(calendarMaturityAtMs).toISOString()
    : null;
  const approvalExpiresAt = Number.isFinite(expiresAtMs) ? new Date(expiresAtMs).toISOString() : null;
  const maturityBeforeApprovalExpiry = Number.isFinite(calendarMaturityAtMs) && Number.isFinite(expiresAtMs)
    ? calendarMaturityAtMs <= expiresAtMs
    : false;
  const maturityApprovalBufferHours = maturityBeforeApprovalExpiry
    ? Math.round(((expiresAtMs - calendarMaturityAtMs) / 3_600_000) * 10) / 10
    : null;

  const opportunitySlots = [];
  if (expiryDate && expiresAtMs >= nowMs) {
    for (const date of datesInclusive(today, expiryDate)) {
      if (!isWeekday(date)) continue;
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
    calendarMaturityAt,
    maturityBeforeApprovalExpiry,
    maturityApprovalBufferHours,
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
      exchangeHolidaysAndProviderFailuresMayReduceSlots: true,
      noLiveOrBrokerExecutionImplied: true,
    },
  };
}
