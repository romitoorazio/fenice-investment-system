function parseTime(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCurrency(value) {
  return String(value || "").trim().toUpperCase();
}

export function evaluatePaperFxEvidence({ fxEvidence, approval, now = Date.now() } = {}) {
  const reasons = [];
  const policy = approval?.fxPolicy || {};
  const permittedCurrencies = Array.isArray(approval?.permittedCurrencies)
    ? approval.permittedCurrencies.map(normalizeCurrency).filter(Boolean)
    : [];
  const nonEuroPermitted = permittedCurrencies.some((currency) => currency !== "EUR");
  const requiredForNonEuro = policy?.requiredForNonEuro === true;
  const expectedProvider = String(policy?.provider || "").trim().toLowerCase();
  const expectedBaseCurrency = normalizeCurrency(policy?.baseCurrency || "EUR");
  const expectedUsdPair = String(policy?.usdPair || "USD/EUR").trim().toUpperCase();
  const maxAgeSeconds = Math.max(1, Number(policy?.maxAgeSeconds || 120));

  if (approval?.approved !== true || String(approval?.mode || "").toUpperCase() !== "PAPER") {
    reasons.push("PAPER FX approval is missing or not approved for PAPER mode");
  }
  if (approval?.liveTradingAllowed !== false || approval?.brokerConnectivityAllowed !== false) {
    reasons.push("PAPER FX approval must explicitly keep LIVE trading and broker connectivity disabled");
  }
  if (!permittedCurrencies.length || !permittedCurrencies.includes("EUR")) {
    reasons.push("PAPER FX approval must explicitly define EUR and permitted currencies");
  }
  if (nonEuroPermitted && !requiredForNonEuro) {
    reasons.push("non-EUR PAPER currencies are permitted but fresh market FX is not mandatory");
  }
  if (nonEuroPermitted && expectedProvider !== "twelve-data") {
    reasons.push("PAPER FX provider policy is not pinned to twelve-data");
  }
  if (expectedBaseCurrency !== "EUR") {
    reasons.push("PAPER FX base currency must be EUR");
  }
  if (expectedUsdPair !== "USD/EUR") {
    reasons.push("PAPER USD conversion policy must use USD/EUR");
  }

  const eur = fxEvidence?.ratesToEuro?.EUR;
  const usd = fxEvidence?.ratesToEuro?.USD;
  const usdRate = Number(usd?.rate);
  const usdObservedMs = parseTime(usd?.observedAt);
  const generatedMs = parseTime(fxEvidence?.generatedAt);
  const usdAgeSeconds = usdObservedMs === null ? Number.POSITIVE_INFINITY : (Number(now) - usdObservedMs) / 1000;
  const generatedAgeSeconds = generatedMs === null ? Number.POSITIVE_INFINITY : (Number(now) - generatedMs) / 1000;
  const sourceText = String(usd?.source || "").toUpperCase();
  const evidenceMaxAgeSeconds = Number(fxEvidence?.maxAgeSeconds);

  const evidenceReady = Number(fxEvidence?.version || 0) >= 1
    && String(fxEvidence?.provider || "").trim().toLowerCase() === expectedProvider
    && fxEvidence?.provenanceVerified === true
    && normalizeCurrency(fxEvidence?.baseCurrency) === expectedBaseCurrency
    && fxEvidence?.liveTradingAllowed === false
    && fxEvidence?.brokerConnectivityAllowed === false
    && Number(eur?.rate) === 1
    && Number.isFinite(usdRate)
    && usdRate > 0
    && usdObservedMs !== null
    && usdAgeSeconds >= 0
    && usdAgeSeconds <= maxAgeSeconds
    && generatedMs !== null
    && generatedAgeSeconds >= 0
    && generatedAgeSeconds <= maxAgeSeconds
    && Number.isFinite(evidenceMaxAgeSeconds)
    && evidenceMaxAgeSeconds > 0
    && evidenceMaxAgeSeconds <= maxAgeSeconds
    && sourceText.includes(expectedUsdPair);

  if (nonEuroPermitted && !evidenceReady) {
    reasons.push("fresh provenance-verified USD/EUR market FX evidence is missing, stale, unsafe, or policy-incompatible");
  }

  return {
    ready: reasons.length === 0,
    requiredForNonEuro: nonEuroPermitted,
    reasons,
    metrics: {
      provider: String(fxEvidence?.provider || "") || null,
      expectedProvider: expectedProvider || null,
      baseCurrency: normalizeCurrency(fxEvidence?.baseCurrency) || null,
      expectedBaseCurrency,
      usdPair: expectedUsdPair,
      usdRate: Number.isFinite(usdRate) ? usdRate : null,
      usdObservedAt: usd?.observedAt || null,
      usdAgeSeconds: Number.isFinite(usdAgeSeconds) ? Number(usdAgeSeconds.toFixed(1)) : null,
      generatedAt: fxEvidence?.generatedAt || null,
      generatedAgeSeconds: Number.isFinite(generatedAgeSeconds) ? Number(generatedAgeSeconds.toFixed(1)) : null,
      maxAgeSeconds,
      evidenceMaxAgeSeconds: Number.isFinite(evidenceMaxAgeSeconds) ? evidenceMaxAgeSeconds : null,
      provenanceVerified: fxEvidence?.provenanceVerified === true,
      liveTradingAllowed: fxEvidence?.liveTradingAllowed === true,
      brokerConnectivityAllowed: fxEvidence?.brokerConnectivityAllowed === true,
      permittedCurrencies,
    },
  };
}

export function executionMatchesPaperFxEvidence(execution, fxEvaluation) {
  if (!execution || !fxEvaluation?.ready) return false;
  const currency = normalizeCurrency(execution.currency);
  if (!currency) return false;
  if (currency === "EUR") return Number(execution.fxToEuro) === 1;
  if (currency !== "USD") return false;

  const executionRate = Number(execution.fxToEuro);
  const evidenceRate = Number(fxEvaluation?.metrics?.usdRate);
  const sameRate = Number.isFinite(executionRate)
    && Number.isFinite(evidenceRate)
    && Math.abs(executionRate - evidenceRate) <= 1e-12;

  const executionProvider = String(execution.fxProvider || "").trim().toLowerCase();
  const evidenceProvider = String(fxEvaluation?.metrics?.provider || "").trim().toLowerCase();
  const sameProvider = Boolean(executionProvider)
    && Boolean(evidenceProvider)
    && executionProvider === evidenceProvider;

  const executionObservedMs = parseTime(execution.fxObservedAt);
  const evidenceObservedMs = parseTime(fxEvaluation?.metrics?.usdObservedAt);
  const sameObservedAt = executionObservedMs !== null
    && evidenceObservedMs !== null
    && executionObservedMs === evidenceObservedMs;

  return sameRate && sameProvider && sameObservedAt;
}
