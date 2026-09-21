const DAY_MS = 86_400_000;

function parseTime(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function evaluatePaperValidationCampaign(campaign, now = Date.now()) {
  const requiredDays = Math.max(1, Number(campaign?.requiredDays || 30));
  const minEvidenceDays = Math.max(1, Number(campaign?.minEvidenceDays || Math.min(requiredDays, 25)));
  const startedAtMs = parseTime(campaign?.startedAt);
  const baselineCommit = String(campaign?.baselineCommit || "").trim();
  const liveTradingAllowed = campaign?.liveTradingAllowed === true;
  const evidence = Array.isArray(campaign?.dailyEvidence) ? campaign.dailyEvidence : [];

  if (liveTradingAllowed) {
    return {
      state: "INVALID",
      matured: false,
      elapsedCalendarDays: 0,
      evidenceDays: 0,
      requiredDays,
      minEvidenceDays,
      unsafeLiveOrders: 0,
      reasons: ["paper validation campaign cannot allow live trading"],
    };
  }

  if (startedAtMs === null || !baselineCommit) {
    return {
      state: "NOT_STARTED",
      matured: false,
      elapsedCalendarDays: 0,
      evidenceDays: 0,
      requiredDays,
      minEvidenceDays,
      unsafeLiveOrders: 0,
      reasons: ["campaign requires an immutable baseline commit and start timestamp"],
    };
  }

  const nowMs = Number(now);
  const elapsedCalendarDays = Math.max(0, Math.floor((nowMs - startedAtMs) / DAY_MS));
  const validDates = new Set();
  let unsafeLiveOrders = 0;
  const reasons = [];

  for (const row of evidence) {
    const date = String(row?.date || "").slice(0, 10);
    const rowTime = parseTime(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || rowTime === null) continue;
    if (rowTime < Math.floor(startedAtMs / DAY_MS) * DAY_MS || rowTime > nowMs + DAY_MS) continue;
    validDates.add(date);
    const liveOrders = Math.max(0, Number(row?.liveOrders || 0));
    if (Number.isFinite(liveOrders)) unsafeLiveOrders += liveOrders;
  }

  const evidenceDays = validDates.size;
  if (unsafeLiveOrders > 0) reasons.push(`${unsafeLiveOrders} live order(s) observed during paper campaign`);
  if (elapsedCalendarDays < requiredDays) reasons.push(`campaign age ${elapsedCalendarDays}d < required ${requiredDays}d`);
  if (evidenceDays < minEvidenceDays) reasons.push(`campaign evidence ${evidenceDays}d < required ${minEvidenceDays}d`);

  const matured = elapsedCalendarDays >= requiredDays
    && evidenceDays >= minEvidenceDays
    && unsafeLiveOrders === 0;

  return {
    state: matured ? "MATURED" : "ACTIVE",
    matured,
    elapsedCalendarDays,
    evidenceDays,
    requiredDays,
    minEvidenceDays,
    unsafeLiveOrders,
    reasons,
  };
}
