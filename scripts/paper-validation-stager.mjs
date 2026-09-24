function parseTime(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function ageMinutes(value, nowMs) {
  const parsed = parseTime(value);
  if (parsed === null) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - parsed) / 60_000);
}

function ageHours(value, nowMs) {
  const parsed = parseTime(value);
  if (parsed === null) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - parsed) / 3_600_000);
}

function unique(values) {
  return [...new Set(values.map((value) => String(value || "").trim().toUpperCase()).filter(Boolean))];
}

function positive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function sameUtcDate(value, date) {
  return String(value || "").slice(0, 10) === date;
}

function isValidationProbe(item, prefix) {
  return item?.validationProbe === true || String(item?.clientOrderId || "").startsWith(prefix);
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? Math.floor(parsed) : fallback));
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
}

export function buildPaperValidationProbe({ campaign, approval, marketSession, coverage, state, queue, terminal, committee, now = new Date().toISOString() }) {
  const nowMs = parseTime(now);
  const blocked = (reason) => ({ staged: false, reason, queue });
  if (nowMs === null) return blocked("clock-invalid");

  if (!campaign?.startedAt || !campaign?.baselineCommit || campaign?.baselineFingerprint?.complete !== true) return blocked("campaign-not-active");
  if (campaign?.liveTradingAllowed !== false) return blocked("campaign-live-lock-open");

  const prefix = String(approval?.idPrefix || "fenice-paper-validation-");
  if (approval?.approved !== true || approval?.humanConfirmation !== true || approval?.mode !== "PAPER") return blocked("operator-approval-missing");
  if (approval?.liveTradingAllowed !== false || approval?.brokerConnectivityAllowed !== false) return blocked("approval-safety-invalid");
  const expiresAt = parseTime(approval?.expiresAt);
  if (expiresAt === null || nowMs > expiresAt) return blocked("operator-approval-expired");

  if (state?.mode !== "PAPER" || state?.liveTradingAllowed === true || state?.brokerConnectivityAllowed === true) return blocked("oms-not-paper-only");
  if (state?.killSwitch?.engaged === true) return blocked("kill-switch-engaged");
  if (state?.reconciliation?.balanced !== true || (Array.isArray(state?.reconciliation?.breaks) && state.reconciliation.breaks.length > 0)) return blocked("reconciliation-not-balanced");
  if (queue?.mode !== "PAPER" || !Array.isArray(queue?.orders)) return blocked("queue-not-paper-only");

  const sessionObserved = parseTime(marketSession?.evidence?.observedAt);
  const sessionAgeSeconds = sessionObserved === null ? Number.POSITIVE_INFINITY : Math.max(0, (nowMs - sessionObserved) / 1000);
  if (marketSession?.configured !== true
    || marketSession?.evidence?.authoritative !== true
    || marketSession?.evidence?.state !== "OPEN"
    || marketSession?.decision?.allowed !== true
    || sessionAgeSeconds > 120
    || marketSession?.liveTradingAllowed !== false) {
    return blocked("market-session-not-open");
  }

  if (ageMinutes(coverage?.generatedAt, nowMs) > 30) return blocked("execution-coverage-stale");
  if (Number(coverage?.paperEligibleSymbols || 0) < 3 || Number(coverage?.paperEligiblePercent || 0) < 25) return blocked("execution-coverage-insufficient");
  if (coverage?.policy?.liveTradingAllowed !== false || Number(coverage?.policy?.minIndependentSourceFamilies || 0) < 2) return blocked("execution-coverage-policy-invalid");

  if (ageHours(terminal?.generatedAt, nowMs) > 24 || !positive(terminal?.capitalEuro)) return blocked("terminal-stale-or-invalid");
  if (ageHours(committee?.generatedAt, nowMs) > 24 || committee?.sourceGate !== "GREEN" || Number(committee?.dataQuality || 0) < 90) return blocked("committee-data-not-ready");

  const executions = Array.isArray(state?.executions) ? state.executions : [];
  const positions = Array.isArray(state?.positions) ? state.positions : [];
  const queued = queue.orders;
  const targetPaperFills = boundedInteger(approval?.targetPaperFills, boundedInteger(campaign?.minPaperFills, 10, 1, 50), 1, 50);
  const maxProbeAttemptsTotal = boundedInteger(approval?.maxProbeAttemptsTotal, Math.max(20, targetPaperFills * 2), targetPaperFills, 100);
  const maxOrdersPerDay = boundedInteger(approval?.maxOrdersPerDay, 1, 1, 5);
  const maxNotionalEuroPerOrder = boundedNumber(approval?.maxNotionalEuroPerOrder, 300, 1, 500);
  const maxCapitalPercentPerProbe = boundedNumber(approval?.maxCapitalPercentPerProbe, 3, 0.1, 5);
  const minTcaProbeNotionalEuro = boundedNumber(approval?.minTcaProbeNotionalEuro, 250, 1, maxNotionalEuroPerOrder);
  const maxSingleAssetWeightPercentForProbe = boundedNumber(approval?.maxSingleAssetWeightPercentForProbe, 15, 1, 15);
  const totalPaperFills = executions.filter((item) => item?.status === "PAPER_FILLED").length;
  if (totalPaperFills >= targetPaperFills) return blocked("campaign-paper-fill-target-complete");

  const date = new Date(nowMs).toISOString().slice(0, 10);
  const historicalProbeAttempts = executions.filter((item) => isValidationProbe(item, prefix)).length;
  const pendingProbeOrders = queued.filter((item) => isValidationProbe(item, prefix));
  if (historicalProbeAttempts + pendingProbeOrders.length >= maxProbeAttemptsTotal) return blocked("probe-attempt-budget-exhausted");
  if (pendingProbeOrders.length > 0) return blocked("probe-already-pending");
  const todayProbeCount = executions.filter((item) => isValidationProbe(item, prefix) && sameUtcDate(item?.createdAt || item?.filledAt, date)).length
    + queued.filter((item) => isValidationProbe(item, prefix) && sameUtcDate(item?.requestedAt, date)).length;
  if (todayProbeCount >= maxOrdersPerDay) return blocked("daily-probe-budget-complete");

  const allowedDecisionStates = unique(Array.isArray(approval?.permittedDecisionStates) ? approval.permittedDecisionStates : ["ACCUMULA", "MANTIENI", "OSSERVA"]);
  const allowedCurrencies = unique(Array.isArray(approval?.permittedCurrencies) ? approval.permittedCurrencies : ["USD", "EUR"]);
  const minCommitteeScore = Number.isFinite(Number(approval?.minCommitteeScore)) ? Number(approval.minCommitteeScore) : 70;
  const minValidationDataConfidence = Number.isFinite(Number(approval?.minValidationDataConfidence))
    ? Number(approval.minValidationDataConfidence)
    : Number.isFinite(Number(approval?.minConfidence)) ? Number(approval.minConfidence) : 90;
  const maxRiskScore = Number.isFinite(Number(approval?.maxRiskScore)) ? Number(approval.maxRiskScore) : 75;

  // `paperEligible` is the authoritative output of the fingerprinted market-data
  // quorum. GREEN means preferred redundancy (>=3 independent families), while
  // CAUTION is still allowNewRisk=true when the required >=2-family quorum and
  // spread/freshness checks pass. Accept both safe states and keep BLOCKED or
  // unknown states fail-closed.
  const coverageBySymbol = new Map((Array.isArray(coverage?.rows) ? coverage.rows : [])
    .filter((row) => row?.paperEligible === true
      && ["GREEN", "CAUTION"].includes(String(row?.state || "").toUpperCase())
      && Number(row?.independentSourceFamilies || 0) >= 2
      && positive(row?.medianPrice))
    .map((row) => [String(row.symbol || "").toUpperCase(), row]));
  const terminalBySymbol = new Map((Array.isArray(terminal?.assets) ? terminal.assets : []).map((asset) => [String(asset?.symbol || "").toUpperCase(), asset]));
  const positionsBySymbol = new Map(positions.map((position) => [String(position?.symbol || "").toUpperCase(), position]));
  const capitalEuro = Number(terminal.capitalEuro);
  const capitalProbeCapEuro = capitalEuro * maxCapitalPercentPerProbe / 100;
  const singleAssetCapEuro = capitalEuro * maxSingleAssetWeightPercentForProbe / 100;

  const candidates = (Array.isArray(committee?.topDecisions) ? committee.topDecisions : [])
    .map((decision) => {
      const symbol = String(decision?.symbol || "").toUpperCase();
      const row = coverageBySymbol.get(symbol);
      const asset = terminalBySymbol.get(symbol);
      const currency = String(decision?.currency || asset?.currency || "").toUpperCase();
      const committeeScore = Number(decision?.committeeScore || 0);
      const calibratedConfidence = Number(decision?.confidence || 0);
      const rawCommitteeConfidence = Number(decision?.rawConfidenceBeforeCalibration ?? decision?.confidence ?? 0);
      const terminalConfidence = Number(asset?.confidence || 0);
      // Operational PAPER probes exist to create execution samples that later
      // mature the calibration model. Using the post-calibration confidence as
      // the probe gate creates a circular dependency when immature calibration
      // intentionally caps confidence. Require high pre-calibration data quality
      // instead, while the committee decision itself remains calibrated and
      // therefore conservative.
      const validationDataConfidence = Math.min(rawCommitteeConfidence, terminalConfidence);
      const riskScore = Math.max(Number(decision?.riskScore ?? 100), Number(asset?.riskScore ?? 100));
      const decisionState = String(decision?.decision || "").toUpperCase();
      const terminalDecision = String(asset?.decision || "").toUpperCase();
      const configuredFxStress = Number(approval?.riskFxToEuroByCurrency?.[currency]);
      const fxToEuro = positive(configuredFxStress) ? configuredFxStress : currency === "EUR" ? 1 : 2;
      const position = positionsBySymbol.get(symbol);
      const positionQuantity = Math.abs(Number(position?.quantity || 0));
      const positionFxToEuro = positive(position?.fxToEuro) ? Number(position.fxToEuro) : fxToEuro;
      const existingPositionNotionalEuro = row && positive(positionQuantity)
        ? positionQuantity * Number(row.medianPrice) * positionFxToEuro
        : 0;
      const singleAssetHeadroomEuro = Math.max(0, singleAssetCapEuro - existingPositionNotionalEuro);
      const notionalCapacityEuro = Math.max(0, Math.min(maxNotionalEuroPerOrder, capitalProbeCapEuro, singleAssetHeadroomEuro));
      const eligible = row
        && fxToEuro <= 5
        && allowedDecisionStates.includes(decisionState)
        && !["ATTENDI", "EVITA"].includes(terminalDecision)
        && committeeScore >= minCommitteeScore
        && validationDataConfidence >= minValidationDataConfidence
        && riskScore <= maxRiskScore
        && allowedCurrencies.includes(currency)
        && notionalCapacityEuro >= minTcaProbeNotionalEuro;
      return {
        symbol,
        row,
        asset,
        decision,
        currency,
        committeeScore,
        calibratedConfidence,
        rawCommitteeConfidence,
        terminalConfidence,
        validationDataConfidence,
        riskScore,
        fxToEuro,
        existingPositionNotionalEuro,
        singleAssetHeadroomEuro,
        notionalCapacityEuro,
        eligible,
      };
    })
    .filter((item) => item.eligible)
    // Rotate toward the least-used eligible symbol first. This preserves the
    // single-asset risk budget while keeping execution-quality samples large
    // enough to make fixed transaction costs economically meaningful.
    .sort((left, right) => (left.existingPositionNotionalEuro - right.existingPositionNotionalEuro)
      || (right.notionalCapacityEuro - left.notionalCapacityEuro)
      || (right.committeeScore - left.committeeScore)
      || (left.riskScore - right.riskScore)
      || left.symbol.localeCompare(right.symbol));

  const candidate = candidates[0];
  if (!candidate) return blocked("no-eligible-validation-candidate");

  const fxToEuro = candidate.fxToEuro;
  if (!positive(fxToEuro) || fxToEuro > 5) return blocked("risk-fx-stress-invalid");
  const notionalCap = candidate.notionalCapacityEuro;
  if (notionalCap < minTcaProbeNotionalEuro) return blocked("probe-notional-below-tca-floor");
  const rawQuantity = notionalCap / (Number(candidate.row.medianPrice) * fxToEuro);
  const quantity = Math.floor(rawQuantity * 1_000_000) / 1_000_000;
  if (!positive(quantity)) return blocked("probe-size-too-small");

  const clientOrderId = `${prefix}${date}-${candidate.symbol}`;
  if (executions.some((item) => item?.clientOrderId === clientOrderId) || queued.some((item) => item?.clientOrderId === clientOrderId)) return blocked("probe-id-already-seen");

  const order = {
    clientOrderId,
    symbol: candidate.symbol,
    side: "BUY",
    orderType: "MARKET",
    timeInForce: "DAY",
    quantity,
    currency: candidate.currency,
    fxToEuro,
    requestedAt: new Date(nowMs).toISOString(),
    humanConfirmed: true,
    validationProbe: true,
    approvalId: String(approval?.approvalId || "paper-validation-operator-approval"),
    validationRationale: {
      purpose: "operational-paper-validation-only",
      committeeDecision: String(candidate.decision?.decision || ""),
      committeeScore: candidate.committeeScore,
      calibratedInvestmentConfidence: candidate.calibratedConfidence,
      rawCommitteeDataConfidence: candidate.rawCommitteeConfidence,
      terminalDataConfidence: candidate.terminalConfidence,
      validationDataConfidence: candidate.validationDataConfidence,
      minValidationDataConfidence,
      riskScore: candidate.riskScore,
      coverageState: String(candidate.row?.state || ""),
      independentSourceFamilies: Number(candidate.row?.independentSourceFamilies || 0),
      medianPrice: Number(candidate.row?.medianPrice),
      maxNotionalEuro: Number(notionalCap.toFixed(2)),
      maxCapitalPercentPerProbe,
      minTcaProbeNotionalEuro,
      maxSingleAssetWeightPercentForProbe,
      existingPositionNotionalEuro: Number(candidate.existingPositionNotionalEuro.toFixed(2)),
      singleAssetHeadroomEuro: Number(candidate.singleAssetHeadroomEuro.toFixed(2)),
      riskFxToEuroStress: fxToEuro,
      cumulativePaperFillsBeforeProbe: totalPaperFills,
      targetPaperFills,
      historicalProbeAttempts,
      maxProbeAttemptsTotal,
    },
  };

  return {
    staged: true,
    reason: "eligible-paper-validation-probe-staged",
    order,
    queue: { ...queue, orders: [...queued, order] },
  };
}
