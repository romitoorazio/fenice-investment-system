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
  if (marketSession?.configured !== true || marketSession?.evidence?.authoritative !== true || marketSession?.evidence?.state !== "OPEN" || marketSession?.decision?.allowed !== true || sessionAgeSeconds > 120 || marketSession?.liveTradingAllowed !== false) {
    return blocked("market-session-not-open");
  }

  if (ageMinutes(coverage?.generatedAt, nowMs) > 30) return blocked("execution-coverage-stale");
  if (Number(coverage?.paperEligibleSymbols || 0) < 3 || Number(coverage?.paperEligiblePercent || 0) < 25) return blocked("execution-coverage-insufficient");
  if (coverage?.policy?.liveTradingAllowed !== false || Number(coverage?.policy?.minIndependentSourceFamilies || 0) < 2) return blocked("execution-coverage-policy-invalid");

  if (ageHours(terminal?.generatedAt, nowMs) > 24 || !positive(terminal?.capitalEuro)) return blocked("terminal-stale-or-invalid");
  if (ageHours(committee?.generatedAt, nowMs) > 24 || committee?.sourceGate !== "GREEN" || Number(committee?.dataQuality || 0) < 90) return blocked("committee-data-not-ready");

  const maxOrdersTotal = Math.max(1, Math.min(50, Number(approval?.maxOrdersTotal || 10)));
  const maxOrdersPerDay = Math.max(1, Math.min(5, Number(approval?.maxOrdersPerDay || 1)));
  const maxNotionalEuroPerOrder = Math.max(1, Math.min(500, Number(approval?.maxNotionalEuroPerOrder || 100)));
  const date = new Date(nowMs).toISOString().slice(0, 10);
  const executions = Array.isArray(state?.executions) ? state.executions : [];
  const queued = queue.orders;
  const historicalProbeCount = executions.filter((item) => isValidationProbe(item, prefix)).length;
  const pendingProbeOrders = queued.filter((item) => isValidationProbe(item, prefix));
  if (historicalProbeCount + pendingProbeOrders.length >= maxOrdersTotal) return blocked("probe-budget-complete");
  if (pendingProbeOrders.length > 0) return blocked("probe-already-pending");
  const todayProbeCount = executions.filter((item) => isValidationProbe(item, prefix) && sameUtcDate(item?.createdAt || item?.filledAt, date)).length
    + queued.filter((item) => isValidationProbe(item, prefix) && sameUtcDate(item?.requestedAt, date)).length;
  if (todayProbeCount >= maxOrdersPerDay) return blocked("daily-probe-budget-complete");

  const allowedDecisionStates = unique(Array.isArray(approval?.permittedDecisionStates) ? approval.permittedDecisionStates : ["ACCUMULA", "MANTIENI", "OSSERVA"]);
  const allowedCurrencies = unique(Array.isArray(approval?.permittedCurrencies) ? approval.permittedCurrencies : ["USD", "EUR"]);
  const minCommitteeScore = Number.isFinite(Number(approval?.minCommitteeScore)) ? Number(approval.minCommitteeScore) : 70;
  const minConfidence = Number.isFinite(Number(approval?.minConfidence)) ? Number(approval.minConfidence) : 90;
  const maxRiskScore = Number.isFinite(Number(approval?.maxRiskScore)) ? Number(approval.maxRiskScore) : 75;

  const coverageBySymbol = new Map((Array.isArray(coverage?.rows) ? coverage.rows : [])
    .filter((row) => row?.paperEligible === true && row?.state === "GREEN" && Number(row?.independentSourceFamilies || 0) >= 2 && positive(row?.medianPrice))
    .map((row) => [String(row.symbol || "").toUpperCase(), row]));
  const terminalBySymbol = new Map((Array.isArray(terminal?.assets) ? terminal.assets : []).map((asset) => [String(asset?.symbol || "").toUpperCase(), asset]));

  const candidates = (Array.isArray(committee?.topDecisions) ? committee.topDecisions : [])
    .map((decision) => {
      const symbol = String(decision?.symbol || "").toUpperCase();
      const row = coverageBySymbol.get(symbol);
      const asset = terminalBySymbol.get(symbol);
      const currency = String(decision?.currency || asset?.currency || "").toUpperCase();
      const committeeScore = Number(decision?.committeeScore || 0);
      const confidence = Math.min(Number(decision?.confidence || 0), Number(asset?.confidence || 0));
      const riskScore = Math.max(Number(decision?.riskScore ?? 100), Number(asset?.riskScore ?? 100));
      const decisionState = String(decision?.decision || "").toUpperCase();
      const terminalDecision = String(asset?.decision || "").toUpperCase();
      const eligible = row
        && allowedDecisionStates.includes(decisionState)
        && !["ATTENDI", "EVITA"].includes(terminalDecision)
        && committeeScore >= minCommitteeScore
        && confidence >= minConfidence
        && riskScore <= maxRiskScore
        && allowedCurrencies.includes(currency);
      return { symbol, row, asset, decision, currency, committeeScore, confidence, riskScore, eligible };
    })
    .filter((item) => item.eligible)
    .sort((left, right) => (right.committeeScore - left.committeeScore) || (left.riskScore - right.riskScore) || left.symbol.localeCompare(right.symbol));

  const candidate = candidates[0];
  if (!candidate) return blocked("no-eligible-validation-candidate");

  const fxToEuro = 1; // Conservative for USD; EUR is naturally 1. This never understates risk notional for the approved currencies.
  const capitalCap = Number(terminal.capitalEuro) * 0.01;
  const notionalCap = Math.min(maxNotionalEuroPerOrder, capitalCap);
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
      committeeDecision: String(candidate.decision?.decision || ""),
      committeeScore: candidate.committeeScore,
      dataConfidence: candidate.confidence,
      riskScore: candidate.riskScore,
      independentSourceFamilies: Number(candidate.row?.independentSourceFamilies || 0),
      medianPrice: Number(candidate.row?.medianPrice),
      maxNotionalEuro: Number(notionalCap.toFixed(2)),
    },
  };

  return {
    staged: true,
    reason: "eligible-paper-validation-probe-staged",
    order,
    queue: { ...queue, orders: [...queued, order] },
  };
}
