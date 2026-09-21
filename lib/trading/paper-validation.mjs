import { validationFingerprintMatches } from "./validation-fingerprint.mjs";

const DAY_MS = 86_400_000;

function parseTime(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function baseResult(state, requiredDays, minEvidenceDays, minPaperFills, reasons) {
  return {
    state,
    matured: false,
    elapsedCalendarDays: 0,
    evidenceDays: 0,
    safetyEvidenceDays: 0,
    fingerprintEvidenceDays: 0,
    fingerprintMismatchDays: 0,
    marketDataCoverageFailureDays: 0,
    decisionDataFailureDays: 0,
    fillEvidenceProofFailureDays: 0,
    fillAccountingMismatchDays: 0,
    fillCounterRegressionDays: 0,
    requiredDays,
    minEvidenceDays,
    minPaperFills,
    cumulativePaperFills: 0,
    executionQualityReady: false,
    unsafeLiveOrders: 0,
    unsafeBrokerDays: 0,
    reconciliationBreakDays: 0,
    auditFailureDays: 0,
    reasons,
  };
}

function validateV5FillProof(row, previousPaperFills, fills) {
  const delta = Math.max(0, fills - previousPaperFills);
  const proof = row?.fillEvidenceProof;
  const windows = Array.isArray(proof?.windows) ? [...proof.windows] : [];
  const requiredFills = Number(proof?.requiredFills);
  const coveredFills = Number(proof?.coveredFills);
  let marketDataReady = true;
  let decisionDataReady = true;

  if (proof?.version !== 1
    || proof?.complete !== true
    || !Number.isFinite(requiredFills)
    || !Number.isFinite(coveredFills)
    || requiredFills !== delta
    || coveredFills !== delta) {
    return { complete: false, marketDataReady: false, decisionDataReady: false };
  }

  if (delta === 0) {
    return {
      complete: windows.length === 0,
      marketDataReady: windows.length === 0,
      decisionDataReady: windows.length === 0,
    };
  }

  windows.sort((a, b) => String(a?.observedAt || "").localeCompare(String(b?.observedAt || "")));
  let cursor = previousPaperFills;
  for (const window of windows) {
    const from = Number(window?.fromCumulativePaperFilled);
    const to = Number(window?.toCumulativePaperFilled);
    const count = Number(window?.newPaperFills);
    const structural = Number.isFinite(from)
      && Number.isFinite(to)
      && Number.isFinite(count)
      && from === cursor
      && to > from
      && count === to - from;
    if (!structural) return { complete: false, marketDataReady: false, decisionDataReady: false };
    if (window?.decisionData?.ready !== true) decisionDataReady = false;
    if (window?.executionMarket?.ready !== true) marketDataReady = false;
    cursor = to;
  }

  return {
    complete: cursor === fills && decisionDataReady && marketDataReady,
    marketDataReady,
    decisionDataReady,
  };
}

export function evaluatePaperValidationCampaign(campaign, now = Date.now()) {
  const requiredDays = Math.max(1, Number(campaign?.requiredDays || 30));
  const minEvidenceDays = Math.max(1, Number(campaign?.minEvidenceDays || Math.min(requiredDays, 25)));
  const minPaperFills = Math.max(1, Number(campaign?.minPaperFills || 10));
  const campaignVersion = Math.max(1, Number(campaign?.version || 1));
  const startedAtMs = parseTime(campaign?.startedAt);
  const baselineCommit = String(campaign?.baselineCommit || "").trim();
  const baselineFingerprint = campaign?.baselineFingerprint || null;
  const liveTradingAllowed = campaign?.liveTradingAllowed === true;
  const evidence = Array.isArray(campaign?.dailyEvidence) ? campaign.dailyEvidence : [];

  if (liveTradingAllowed) {
    return baseResult("INVALID", requiredDays, minEvidenceDays, minPaperFills, ["paper validation campaign cannot allow live trading"]);
  }

  if (startedAtMs === null || !baselineCommit) {
    return baseResult("NOT_STARTED", requiredDays, minEvidenceDays, minPaperFills, ["campaign requires an immutable baseline commit and start timestamp"]);
  }

  if (!baselineFingerprint || baselineFingerprint?.complete !== true) {
    return baseResult("INVALID", requiredDays, minEvidenceDays, minPaperFills, ["campaign requires a complete immutable fingerprint of the validated trading/risk core"]);
  }

  const nowMs = Number(now);
  const elapsedCalendarDays = Math.max(0, Math.floor((nowMs - startedAtMs) / DAY_MS));
  const validDates = new Set();
  const safetyDates = new Set();
  const fingerprintDates = new Set();
  const fingerprintMismatchDates = new Set();
  const marketDataCoverageFailureDates = new Set();
  const decisionDataFailureDates = new Set();
  const fillEvidenceProofFailureDates = new Set();
  const fillAccountingMismatchDates = new Set();
  const fillCounterRegressionDates = new Set();
  const unsafeBrokerDates = new Set();
  const reconciliationBreakDates = new Set();
  const auditFailureDates = new Set();
  let unsafeLiveOrders = 0;
  let cumulativePaperFills = 0;
  let previousPaperFills = 0;
  let latestEvidence = null;
  let latestEvidenceTime = -Infinity;
  const reasons = [];

  const sortedEvidence = [...evidence].sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")));
  for (const row of sortedEvidence) {
    const date = String(row?.date || "").slice(0, 10);
    const rowTime = parseTime(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || rowTime === null) continue;
    if (rowTime < Math.floor(startedAtMs / DAY_MS) * DAY_MS || rowTime > nowMs + DAY_MS) continue;
    validDates.add(date);

    const fingerprintMatches = validationFingerprintMatches(baselineFingerprint, row?.validationFingerprint);
    if (fingerprintMatches) fingerprintDates.add(date);
    else fingerprintMismatchDates.add(date);

    if (fingerprintMatches && rowTime >= latestEvidenceTime) {
      latestEvidenceTime = rowTime;
      latestEvidence = row;
    }

    const liveOrders = Math.max(0, Number(row?.liveOrders || 0));
    if (Number.isFinite(liveOrders)) unsafeLiveOrders += liveOrders;
    if (row?.brokerConnectivityAllowed === true || row?.liveTradingAllowed === true) unsafeBrokerDates.add(date);
    if (row?.reconciliationBalanced !== true || Number(row?.reconciliationBreaks || 0) > 0) reconciliationBreakDates.add(date);
    if (row?.auditChainValid !== true) auditFailureDates.add(date);

    const fillsRaw = Number(row?.cumulativePaperFilled);
    const fills = Number.isFinite(fillsRaw) && fillsRaw >= 0 ? fillsRaw : 0;
    if (campaignVersion >= 4 && fills < previousPaperFills) {
      fillCounterRegressionDates.add(date);
    }
    const derivedNewFills = Math.max(0, fills - previousPaperFills);
    const reportedNewFillsRaw = Number(row?.newPaperFills);
    const reportedNewFills = Number.isFinite(reportedNewFillsRaw) ? Math.max(0, reportedNewFillsRaw) : null;
    if (campaignVersion >= 4 && reportedNewFills !== null && Math.abs(reportedNewFills - derivedNewFills) > 1e-9) {
      fillAccountingMismatchDates.add(date);
    }

    let fillProofReady = true;
    if (campaignVersion >= 5) {
      const proof = validateV5FillProof(row, previousPaperFills, fills);
      fillProofReady = proof.complete;
      if (!proof.complete) fillEvidenceProofFailureDates.add(date);
      if (derivedNewFills > 0 && !proof.marketDataReady) marketDataCoverageFailureDates.add(date);
      if (derivedNewFills > 0 && !proof.decisionDataReady) decisionDataFailureDates.add(date);
    } else if (campaignVersion >= 4) {
      const marketDataRequired = derivedNewFills > 0;
      const marketDataSafe = row?.executionMarketCoverage?.safe === true
        && row?.executionMarketCoverage?.fresh === true
        && row?.executionMarketCoverage?.matchesEvidence === true
        && row?.executionMarketCoverage?.policyReady === true
        && row?.executionMarketCoverage?.broadCoverageReady === true
        && row?.executionMarketCoverage?.directaPilotCoverageReady === true;
      fillProofReady = !marketDataRequired || marketDataSafe;
      if (marketDataRequired && !marketDataSafe) marketDataCoverageFailureDates.add(date);
    }

    previousPaperFills = Math.max(previousPaperFills, fills);
    if (fingerprintMatches && Number.isFinite(fills)) cumulativePaperFills = Math.max(cumulativePaperFills, fills);

    if (
      fingerprintMatches
      && liveOrders === 0
      && row?.brokerConnectivityAllowed === false
      && row?.liveTradingAllowed === false
      && row?.reconciliationBalanced === true
      && Number(row?.reconciliationBreaks || 0) === 0
      && row?.auditChainValid === true
      && fillProofReady
      && !(campaignVersion >= 4 && fillAccountingMismatchDates.has(date))
      && !(campaignVersion >= 4 && fillCounterRegressionDates.has(date))
    ) {
      safetyDates.add(date);
    }
  }

  const evidenceDays = validDates.size;
  const safetyEvidenceDays = safetyDates.size;
  const fingerprintEvidenceDays = fingerprintDates.size;
  const fingerprintMismatchDays = fingerprintMismatchDates.size;
  const marketDataCoverageFailureDays = marketDataCoverageFailureDates.size;
  const decisionDataFailureDays = decisionDataFailureDates.size;
  const fillEvidenceProofFailureDays = fillEvidenceProofFailureDates.size;
  const fillAccountingMismatchDays = fillAccountingMismatchDates.size;
  const fillCounterRegressionDays = fillCounterRegressionDates.size;
  const unsafeBrokerDays = unsafeBrokerDates.size;
  const reconciliationBreakDays = reconciliationBreakDates.size;
  const auditFailureDays = auditFailureDates.size;
  const executionQualityReady = cumulativePaperFills >= minPaperFills
    && latestEvidence?.executionQuality?.allowPilot === true
    && Number(latestEvidence?.executionQuality?.fills || 0) >= minPaperFills
    && !["POOR", "INSUFFICIENT"].includes(String(latestEvidence?.executionQuality?.state || "").toUpperCase());

  if (unsafeLiveOrders > 0) reasons.push(`${unsafeLiveOrders} live order(s) observed during paper campaign`);
  if (unsafeBrokerDays > 0) reasons.push(`${unsafeBrokerDays} day(s) exposed broker/live connectivity during paper campaign`);
  if (reconciliationBreakDays > 0) reasons.push(`${reconciliationBreakDays} day(s) ended with reconciliation breaks`);
  if (auditFailureDays > 0) reasons.push(`${auditFailureDays} day(s) ended with invalid audit-chain evidence`);
  if (fingerprintMismatchDays > 0) reasons.push(`${fingerprintMismatchDays} day(s) do not match the immutable validated-core fingerprint`);
  if (marketDataCoverageFailureDays > 0) reasons.push(`${marketDataCoverageFailureDays} day(s) recorded new paper fills without fresh Directa-pilot execution market-data coverage`);
  if (decisionDataFailureDays > 0) reasons.push(`${decisionDataFailureDays} day(s) recorded new paper fills without fresh institutional decision-data evidence`);
  if (fillEvidenceProofFailureDays > 0) reasons.push(`${fillEvidenceProofFailureDays} day(s) have incomplete or non-contiguous per-fill evidence proof`);
  if (fillAccountingMismatchDays > 0) reasons.push(`${fillAccountingMismatchDays} day(s) contain inconsistent cumulative/new paper-fill accounting`);
  if (fillCounterRegressionDays > 0) reasons.push(`${fillCounterRegressionDays} day(s) contain a regression in the cumulative paper-fill counter`);
  if (elapsedCalendarDays < requiredDays) reasons.push(`campaign age ${elapsedCalendarDays}d < required ${requiredDays}d`);
  if (evidenceDays < minEvidenceDays) reasons.push(`campaign evidence ${evidenceDays}d < required ${minEvidenceDays}d`);
  if (fingerprintEvidenceDays < minEvidenceDays) reasons.push(`campaign fingerprint evidence ${fingerprintEvidenceDays}d < required ${minEvidenceDays}d`);
  if (safetyEvidenceDays < minEvidenceDays) reasons.push(`campaign safety evidence ${safetyEvidenceDays}d < required ${minEvidenceDays}d`);
  if (cumulativePaperFills < minPaperFills) reasons.push(`paper fills ${cumulativePaperFills} < required ${minPaperFills}`);
  if (!executionQualityReady) reasons.push("latest paper execution-quality evidence is not acceptable for pilot readiness");

  const unsafe = unsafeLiveOrders > 0
    || unsafeBrokerDays > 0
    || fingerprintMismatchDays > 0
    || marketDataCoverageFailureDays > 0
    || decisionDataFailureDays > 0
    || fillEvidenceProofFailureDays > 0
    || fillAccountingMismatchDays > 0
    || fillCounterRegressionDays > 0;
  const matured = elapsedCalendarDays >= requiredDays
    && evidenceDays >= minEvidenceDays
    && fingerprintEvidenceDays >= minEvidenceDays
    && safetyEvidenceDays >= minEvidenceDays
    && cumulativePaperFills >= minPaperFills
    && executionQualityReady
    && unsafeLiveOrders === 0
    && unsafeBrokerDays === 0
    && reconciliationBreakDays === 0
    && auditFailureDays === 0
    && fingerprintMismatchDays === 0
    && marketDataCoverageFailureDays === 0
    && decisionDataFailureDays === 0
    && fillEvidenceProofFailureDays === 0
    && fillAccountingMismatchDays === 0
    && fillCounterRegressionDays === 0;

  return {
    state: unsafe ? "INVALID" : matured ? "MATURED" : "ACTIVE",
    matured,
    elapsedCalendarDays,
    evidenceDays,
    safetyEvidenceDays,
    fingerprintEvidenceDays,
    fingerprintMismatchDays,
    marketDataCoverageFailureDays,
    decisionDataFailureDays,
    fillEvidenceProofFailureDays,
    fillAccountingMismatchDays,
    fillCounterRegressionDays,
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
