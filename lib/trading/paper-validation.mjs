const DAY_MS = 86_400_000;

function parseTime(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function evaluatePaperValidationCampaign(campaign, now = Date.now()) {
  const requiredDays = Math.max(1, Number(campaign?.requiredDays || 30));
  const minEvidenceDays = Math.max(1, Number(campaign?.minEvidenceDays || Math.min(requiredDays, 25)));
  const minPaperFills = Math.max(1, Number(campaign?.minPaperFills || 10));
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
      safetyEvidenceDays: 0,
      requiredDays,
      minEvidenceDays,
      minPaperFills,
      cumulativePaperFills: 0,
      executionQualityReady: false,
      unsafeLiveOrders: 0,
      unsafeBrokerDays: 0,
      reconciliationBreakDays: 0,
      auditFailureDays: 0,
      reasons: ["paper validation campaign cannot allow live trading"],
    };
  }

  if (startedAtMs === null || !baselineCommit) {
    return {
      state: "NOT_STARTED",
      matured: false,
      elapsedCalendarDays: 0,
      evidenceDays: 0,
      safetyEvidenceDays: 0,
      requiredDays,
      minEvidenceDays,
      minPaperFills,
      cumulativePaperFills: 0,
      executionQualityReady: false,
      unsafeLiveOrders: 0,
      unsafeBrokerDays: 0,
      reconciliationBreakDays: 0,
      auditFailureDays: 0,
      reasons: ["campaign requires an immutable baseline commit and start timestamp"],
    };
  }

  const nowMs = Number(now);
  const elapsedCalendarDays = Math.max(0, Math.floor((nowMs - startedAtMs) / DAY_MS));
  const validDates = new Set();
  const safetyDates = new Set();
  let unsafeLiveOrders = 0;
  let unsafeBrokerDays = 0;
  let reconciliationBreakDays = 0;
  let auditFailureDays = 0;
  let cumulativePaperFills = 0;
  let latestEvidence = null;
  let latestEvidenceTime = -Infinity;
  const reasons = [];

  for (const row of evidence) {
    const date = String(row?.date || "").slice(0, 10);
    const rowTime = parseTime(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || rowTime === null) continue;
    if (rowTime < Math.floor(startedAtMs / DAY_MS) * DAY_MS || rowTime > nowMs + DAY_MS) continue;
    validDates.add(date);
    if (rowTime >= latestEvidenceTime) {
      latestEvidenceTime = rowTime;
      latestEvidence = row;
    }

    const liveOrders = Math.max(0, Number(row?.liveOrders || 0));
    if (Number.isFinite(liveOrders)) unsafeLiveOrders += liveOrders;
    if (row?.brokerConnectivityAllowed === true || row?.liveTradingAllowed === true) unsafeBrokerDays += 1;
    if (row?.reconciliationBalanced !== true || Number(row?.reconciliationBreaks || 0) > 0) reconciliationBreakDays += 1;
    if (row?.auditChainValid !== true) auditFailureDays += 1;

    const fills = Math.max(0, Number(row?.cumulativePaperFilled || 0));
    if (Number.isFinite(fills)) cumulativePaperFills = Math.max(cumulativePaperFills, fills);

    if (
      liveOrders === 0
      && row?.brokerConnectivityAllowed === false
      && row?.liveTradingAllowed === false
      && row?.reconciliationBalanced === true
      && Number(row?.reconciliationBreaks || 0) === 0
      && row?.auditChainValid === true
    ) {
      safetyDates.add(date);
    }
  }

  const evidenceDays = validDates.size;
  const safetyEvidenceDays = safetyDates.size;
  const executionQualityReady = cumulativePaperFills >= minPaperFills
    && latestEvidence?.executionQuality?.allowPilot === true
    && Number(latestEvidence?.executionQuality?.fills || 0) >= minPaperFills
    && !["POOR", "INSUFFICIENT"].includes(String(latestEvidence?.executionQuality?.state || "").toUpperCase());

  if (unsafeLiveOrders > 0) reasons.push(`${unsafeLiveOrders} live order(s) observed during paper campaign`);
  if (unsafeBrokerDays > 0) reasons.push(`${unsafeBrokerDays} day(s) exposed broker/live connectivity during paper campaign`);
  if (reconciliationBreakDays > 0) reasons.push(`${reconciliationBreakDays} day(s) ended with reconciliation breaks`);
  if (auditFailureDays > 0) reasons.push(`${auditFailureDays} day(s) ended with invalid audit-chain evidence`);
  if (elapsedCalendarDays < requiredDays) reasons.push(`campaign age ${elapsedCalendarDays}d < required ${requiredDays}d`);
  if (evidenceDays < minEvidenceDays) reasons.push(`campaign evidence ${evidenceDays}d < required ${minEvidenceDays}d`);
  if (safetyEvidenceDays < minEvidenceDays) reasons.push(`campaign safety evidence ${safetyEvidenceDays}d < required ${minEvidenceDays}d`);
  if (cumulativePaperFills < minPaperFills) reasons.push(`paper fills ${cumulativePaperFills} < required ${minPaperFills}`);
  if (!executionQualityReady) reasons.push("latest paper execution-quality evidence is not acceptable for pilot readiness");

  const unsafe = unsafeLiveOrders > 0 || unsafeBrokerDays > 0;
  const matured = elapsedCalendarDays >= requiredDays
    && evidenceDays >= minEvidenceDays
    && safetyEvidenceDays >= minEvidenceDays
    && cumulativePaperFills >= minPaperFills
    && executionQualityReady
    && unsafeLiveOrders === 0
    && unsafeBrokerDays === 0
    && reconciliationBreakDays === 0
    && auditFailureDays === 0;

  return {
    state: unsafe ? "INVALID" : matured ? "MATURED" : "ACTIVE",
    matured,
    elapsedCalendarDays,
    evidenceDays,
    safetyEvidenceDays,
    requiredDays,
    minEvidenceDays,
    minPaperFills,
    cumulativePaperFills,
    executionQualityReady,
    unsafeLiveOrders,
    unsafeBrokerDays,
    reconciliationBreakDays,
    auditFailureDays,
    reasons,
  };
}
