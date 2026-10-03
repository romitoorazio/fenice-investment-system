// Isolated research diagnostics. This module never feeds the PAPER V6 pipeline.
const identities = Object.freeze({
  BTC: "Bitcoin", ETH: "Ethereum", ADA: "Cardano", AVAX: "Avalanche",
  BCH: "Bitcoin Cash", DOGE: "Dogecoin", HBAR: "Hedera", LINK: "Chainlink",
  LTC: "Litecoin", NEAR: "NEAR Protocol", SOL: "Solana", SUI: "Sui",
  UNI: "Uniswap", XRP: "XRP", XLM: "Stellar", ZEC: "Zcash",
});

export const LAB_POLICY = Object.freeze({
  primaryMaxAgeSeconds: 4 * 3600,
  providerMaxAgeSeconds: 120,
  comparisonMaxSkewSeconds: 300,
  confirmationBandPercent: 0.5,
  divergenceBandPercent: 2,
  requestIntervalMs: 300,
  requestTimeoutMs: 8000,
  maxTargets: Object.keys(identities).length,
});

const symbolOf = (value) => /^[A-Z0-9._-]{1,24}$/.test(String(value || "")) ? String(value) : "UNKNOWN";
const positive = (value) => ["number", "string"].includes(typeof value) && Number.isFinite(Number(value)) && Number(value) > 0;
const crypto = (value) => /^(crypto|criptovaluta)$/i.test(String(value || ""));
const normalizedName = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

export function providerTimestamp(value) {
  const match = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, zone] = match;
  const maxDay = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > maxDay
    || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  if (zone !== "Z" && (Number(zone.slice(1, 3)) > 14 || Number(zone.slice(4)) > 59
    || (Number(zone.slice(1, 3)) === 14 && Number(zone.slice(4)) !== 0))) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function timestampFailure(value, now, maxAgeSeconds) {
  const timestamp = providerTimestamp(value);
  if (timestamp === null) return "PROVIDER_TIMESTAMP_MISSING_OR_INVALID";
  if (timestamp > now) return "PROVIDER_TIMESTAMP_IN_FUTURE";
  if (now - timestamp > maxAgeSeconds * 1000) return "PROVIDER_TIMESTAMP_STALE";
  return null;
}

export function sourceFamily(source) {
  const label = String(source || "").trim();
  if (/^CoinGecko(?:$| )/.test(label)) return "coingecko";
  if (/^Coinbase Exchange(?:$| )/.test(label)) return "coinbase";
  if (/^Yahoo Finance(?:$| )/.test(label)) return "yahoo";
  if (/^Kraken(?:$| )/.test(label)) return "kraken";
  if (/^Stooq(?:$| )/.test(label)) return "stooq";
  if (/^Alpha Vantage(?:$| )/.test(label)) return "alphavantage";
  return null;
}

export function auditPrimarySnapshot(snapshot, now) {
  const byInstrumentFamily = new Map();
  const excluded = [];
  for (const row of Array.isArray(snapshot?.marketObservations) ? snapshot.marketObservations : []) {
    const symbol = symbolOf(row?.symbol);
    const family = sourceFamily(row?.source);
    const reason = symbol === "UNKNOWN" || !/^[A-Z]{3}$/.test(String(row?.currency || "")) || !positive(row?.price)
      ? "INVALID_INSTRUMENT_OR_PRICE"
      : !family ? "UNKNOWN_SOURCE_FAMILY"
        : timestampFailure(row?.observedAt, now, crypto(row?.assetClass) ? LAB_POLICY.primaryMaxAgeSeconds : 96 * 3600);
    if (reason) { excluded.push({ symbol, reason }); continue; }
    const key = `${symbol}:${row.currency}:${family}`;
    const previous = byInstrumentFamily.get(key);
    if (previous) excluded.push({ symbol, reason: "DUPLICATE_INSTRUMENT_FAMILY" });
    if (!previous || providerTimestamp(row.observedAt) > providerTimestamp(previous.observedAt)) {
      byInstrumentFamily.set(key, { ...row, family });
    }
  }
  const rows = [...byInstrumentFamily.values()];
  const counts = new Map();
  for (const row of rows) counts.set(row.family, (counts.get(row.family) || 0) + 1);
  return {
    scope: "PRIMARY_SNAPSHOT_ONLY_NOT_COMPLETE_PRODUCTION_VALIDATION_EVIDENCE",
    freshUniqueObservations: rows.length,
    familyCounts: Object.fromEntries([...counts].sort(([a], [b]) => a.localeCompare(b))),
    excluded,
  };
}

export function planCryptoValidation(snapshot, quality, now) {
  const targets = new Map();
  const excluded = [];
  for (const row of Array.isArray(snapshot?.marketObservations) ? snapshot.marketObservations : []) {
    if (!crypto(row?.assetClass) || row?.source !== "CoinGecko") continue;
    const symbol = symbolOf(row.symbol);
    const reason = !identities[symbol] || normalizedName(row.name) !== normalizedName(identities[symbol])
      ? "CURATED_IDENTITY_NOT_VERIFIED"
      : row.currency !== "USD" ? "PRIMARY_CURRENCY_MISMATCH"
        : !positive(row.price) ? "PRIMARY_PRICE_INVALID"
          : timestampFailure(row.observedAt, now, LAB_POLICY.primaryMaxAgeSeconds);
    if (reason) { excluded.push({ symbol, reason }); continue; }
    const previous = targets.get(symbol);
    if (!previous || providerTimestamp(row.observedAt) > providerTimestamp(previous.primaryObservedAt)) {
      const check = quality?.crossSourceValidation?.checks?.find((item) => item?.instrument === `${symbol}:USD`);
      const families = [...new Set((Array.isArray(check?.sources) ? check.sources : []).map(sourceFamily).filter(Boolean))];
      targets.set(symbol, {
        symbol, name: identities[symbol], productId: `${symbol}-USD`,
        primaryPrice: Number(row.price), primaryObservedAt: row.observedAt,
        recordedValidationFamilies: families.sort(),
      });
    }
  }
  const priority = (symbol) => symbol === "BTC" ? 0 : symbol === "ETH" ? 1 : 2;
  return {
    targets: [...targets.values()].sort((a, b) => priority(a.symbol) - priority(b.symbol)
      || Number(a.recordedValidationFamilies.includes("coinbase")) - Number(b.recordedValidationFamilies.includes("coinbase"))
      || a.recordedValidationFamilies.length - b.recordedValidationFamilies.length || a.symbol.localeCompare(b.symbol)),
    excluded,
  };
}

export function validateCoinbaseProduct(target, products) {
  const matches = Array.isArray(products) ? products.filter((row) => row?.id === target.productId) : [];
  if (!matches.length) return "EXACT_USD_PRODUCT_NOT_LISTED";
  if (matches.length !== 1) return "AMBIGUOUS_PRODUCT_IDENTITY";
  const product = matches[0];
  if (product.base_currency !== target.symbol || product.quote_currency !== "USD") return "PRODUCT_IDENTITY_MISMATCH";
  if (product.status !== "online" || product.trading_disabled !== false) return "PRODUCT_NOT_ACTIVE";
  return null;
}

export function validateCoinbaseTicker(target, ticker, now) {
  if (!positive(ticker?.price)) return { reason: "PROVIDER_PRICE_INVALID" };
  if (!Number.isSafeInteger(ticker?.trade_id) || ticker.trade_id <= 0) return { reason: "PROVIDER_TRADE_ID_INVALID" };
  const reason = timestampFailure(ticker.time, now, LAB_POLICY.providerMaxAgeSeconds);
  if (reason) return { reason };
  return { observation: {
    symbol: target.symbol, name: target.name, assetClass: "crypto", currency: "USD",
    productId: target.productId, venue: "COINBASE_EXCHANGE", sourceFamily: "coinbase",
    price: Number(ticker.price), observedAt: new Date(providerTimestamp(ticker.time)).toISOString(),
    receivedAt: new Date(now).toISOString(), timestampOrigin: "provider-last-trade",
    priceSemantics: "LAST_TRADE", tradeId: ticker.trade_id,
    identityMethod: "curated-symbol-name-and-exact-venue-base-quote",
    eligibility: "VALIDATION_ONLY", validationOnly: true,
  } };
}

export function compareWithPrimary(target, observation, now) {
  if (!positive(target.primaryPrice) || !positive(observation.price)
    || observation.symbol !== target.symbol || observation.currency !== "USD"
    || observation.productId !== target.productId || observation.sourceFamily !== "coinbase") {
    return { status: "INCOMPARABLE", reason: "COMPARISON_IDENTITY_OR_PRICE_INVALID" };
  }
  const primaryFailure = timestampFailure(target.primaryObservedAt, now, LAB_POLICY.primaryMaxAgeSeconds);
  if (primaryFailure) return { status: "INCOMPARABLE", reason: `PRIMARY_${primaryFailure}` };
  const providerFailure = timestampFailure(observation.observedAt, now, LAB_POLICY.providerMaxAgeSeconds);
  if (providerFailure) return { status: "INCOMPARABLE", reason: providerFailure };
  const skewSeconds = Math.abs(providerTimestamp(target.primaryObservedAt) - providerTimestamp(observation.observedAt)) / 1000;
  if (skewSeconds > LAB_POLICY.comparisonMaxSkewSeconds) return { status: "INCOMPARABLE", reason: "TIMESTAMP_SKEW_EXCEEDS_RESEARCH_LIMIT", skewSeconds };
  const spread = Math.abs(target.primaryPrice - observation.price) / ((target.primaryPrice + observation.price) / 2) * 100;
  return {
    status: spread <= LAB_POLICY.confirmationBandPercent ? "CONFIRMED"
      : spread <= LAB_POLICY.divergenceBandPercent ? "ATTENTION" : "DIVERGENT",
    spreadPercent: Number(spread.toFixed(4)), skewSeconds,
  };
}

async function publicJson(path, fetchImpl) {
  if (path !== "/products" && !/^\/products\/[A-Z0-9]+-USD\/ticker$/.test(path)) throw new Error("PUBLIC_PATH_NOT_ALLOWED");
  let response;
  try {
    response = await fetchImpl(`https://api.exchange.coinbase.com${path}`, {
      method: "GET", credentials: "omit", redirect: "error",
      headers: { accept: "application/json", "user-agent": "FeniceInvestmentSystem/7 isolated-validation-lab" },
      signal: AbortSignal.timeout(LAB_POLICY.requestTimeoutMs),
    });
  } catch { throw new Error("PUBLIC_PROVIDER_REQUEST_FAILED"); }
  if (!response.ok) {
    const status = Number.isInteger(response.status) && response.status >= 100 && response.status <= 599 ? response.status : "ERROR";
    throw new Error(response.status === 429 ? "PUBLIC_PROVIDER_RATE_LIMITED" : `PUBLIC_PROVIDER_HTTP_${status}`);
  }
  try { return await response.json(); } catch { throw new Error("PUBLIC_PROVIDER_INVALID_JSON"); }
}

function recordedQualitySummary(quality, now) {
  const timestamp = providerTimestamp(quality?.generatedAt);
  const reported = quality?.confidenceModel?.metrics?.concentrationPercent;
  const concentration = typeof reported === "number" && Number.isFinite(reported) && reported >= 0 && reported <= 100 ? reported : null;
  const fresh = timestamp !== null && timestamp <= now && now - timestamp <= 24 * 3600 * 1000;
  return {
    generatedAt: timestamp === null ? null : new Date(timestamp).toISOString(),
    scope: "RECORDED_PRODUCTION_SUMMARY_NOT_RECOMPUTED_FROM_PARTIAL_ROWS",
    concentrationPercent: concentration, concentrationLimitPercent: 50,
    concentrationState: !fresh || concentration === null ? "UNVERIFIABLE" : concentration > 50 ? "BLOCKED" : "WITHIN_LIMIT",
    completeValidationRowsAvailable: false,
    dominantFamilyAttributionAvailable: false,
  };
}

export async function collectMarketDataValidationLab({ snapshot, quality, fetchImpl = fetch,
  clock = () => Date.now(), pace = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), auditOnly = false }) {
  const started = clock();
  if (!Number.isFinite(started)) throw new Error("LAB_CLOCK_INVALID");
  const plan = planCryptoValidation(snapshot, quality, started);
  const attempts = [];
  let requestCount = 0;
  let catalogFailure = null;
  let products = [];
  if (!auditOnly && plan.targets.length) {
    requestCount += 1;
    try {
      products = await publicJson("/products", fetchImpl);
      if (!Array.isArray(products)) catalogFailure = "PUBLIC_PROVIDER_INVALID_CATALOG";
    } catch (error) { catalogFailure = error.message; }
  }
  let rateLimited = false;
  for (const target of plan.targets) {
    const reason = auditOnly ? "AUDIT_ONLY_NO_PROVIDER_REQUEST" : catalogFailure
      || (rateLimited ? "RATE_LIMIT_STOPPED_REMAINING_REQUESTS" : validateCoinbaseProduct(target, products));
    const attempt = { ...target, state: "NOT_COLLECTED", reason };
    attempts.push(attempt);
    if (reason) continue;
    await pace(LAB_POLICY.requestIntervalMs);
    requestCount += 1;
    try {
      const ticker = await publicJson(`/products/${target.productId}/ticker`, fetchImpl);
      const validated = validateCoinbaseTicker(target, ticker, clock());
      if (validated.reason) { attempt.reason = validated.reason; continue; }
      attempt.state = "COLLECTED";
      delete attempt.reason;
      attempt.observation = validated.observation;
    } catch (error) {
      attempt.reason = error.message;
      rateLimited = error.message === "PUBLIC_PROVIDER_RATE_LIMITED";
    }
  }
  const completed = clock();
  if (!Number.isFinite(completed) || completed < started) throw new Error("LAB_CLOCK_INVALID");
  for (const attempt of attempts.filter((item) => item.state === "COLLECTED")) {
    attempt.comparison = compareWithPrimary(attempt, attempt.observation, completed);
  }
  const statusCounts = {};
  for (const attempt of attempts) {
    const status = attempt.comparison?.status || attempt.reason;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }
  return {
    version: 1, scope: "Fenice V7 isolated market-data validation lab", generatedAt: new Date(completed).toISOString(),
    productionQuality: recordedQualitySummary(quality, completed),
    primarySnapshotAudit: auditPrimarySnapshot(snapshot, completed),
    collection: { requestedTargets: plan.targets.length, requests: requestCount,
      collected: attempts.filter((item) => item.state === "COLLECTED").length, statusCounts, excludedPrimaryRows: plan.excluded },
    attempts, policy: LAB_POLICY,
    safety: { researchOnly: true, paperExecutionAllowed: false, liveTradingAllowed: false,
      brokerConnectivityAllowed: false, changesPaperV6Fingerprint: false,
      feedsPaperV6DecisionData: false, providerAccountOrSubscriptionRequired: false,
      upstreamDataIndependenceCertified: false,
      note: "Publisher-family comparisons are research evidence; upstream independence and execution entitlements are not certified.",
    },
  };
}
