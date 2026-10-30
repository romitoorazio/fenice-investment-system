// Independent read-only IEX stream diagnostics.
// Does NOT produce PAPER/LIVE eligibility or expose market prices.
const SYMBOL = /^[A-Z][A-Z0-9.]{0,9}$/;

export function parseIexShadowSymbols(input) {
  const parts = String(input || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  const symbols = [...new Set(parts)];
  if (!symbols.length || symbols.length > 30 || symbols.some(s => !SYMBOL.test(s))) {
    throw Error("IEX_SHADOW_INVALID_SYMBOL_UNIVERSE");
  }
  return symbols;
}

export function makeIexShadowProof(symbols, startedAt) {
  const parsed = parseIexShadowSymbols(Array.isArray(symbols) ? symbols.join(",") : symbols);
  if (!Number.isFinite(Date.parse(startedAt))) throw Error("IEX_SHADOW_INVALID_START");
  return {
    version: 1, mode: "INDEPENDENT_RESEARCH_SHADOW", provider: "alpaca",
    feed: "IEX_ONLY_NOT_CONSOLIDATED_SIP", startedAt, symbols: parsed,
    authenticated: false, subscriptionConfirmed: false,
    receivedMessages: 0, validTrades: 0, validQuotes: 0,
    freshEvents: 0, staleEvents: 0, futureEvents: 0, malformedEvents: 0,
    ignoredEvents: 0, lastProviderAt: null,
    // Bounded, non-price histogram: safe even at high IEX tick volume.
    quoteDeliveryAgeHistogram: {le100:0,le500:0,le2000:0,le10000:0,le120000:0,gt120000:0},
    providerToReceiptP95UpperBoundMs: null,
    bySymbol: Object.fromEntries(parsed.map(symbol => [symbol, {
      trades: 0, quotes: 0, fresh: 0, stale: 0, lastProviderAt: null,
    }])),
    // Deliberately no price, bid, ask, trading quantity or broker/account fields.
    paperEligibility: "VALIDATION_ONLY", paperQuorumCredit: 0,
    brokerConnectivityAllowed: false, liveTradingAllowed: false, realOrders: 0,
  };
}

export function observeIexShadowProof(proof, input, receivedMs) {
  if (!Number.isFinite(receivedMs)) throw Error("IEX_SHADOW_INVALID_RECEIVE_TIME");
  const messages = Array.isArray(input) ? input : [input];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object" || !["q", "t"].includes(msg.T)) continue;
    proof.receivedMessages += 1;
    const symbol = String(msg.S || "").toUpperCase();
    const bucket = proof.bySymbol[symbol];
    if (!bucket) { proof.ignoredEvents += 1; continue; }
    const providerMs = Date.parse(String(msg.t || ""));
    const priceValid = msg.T === "t"
      ? Number.isFinite(msg.p) && msg.p > 0
      : Number.isFinite(msg.bp) && msg.bp > 0
        && Number.isFinite(msg.ap) && msg.ap > 0 && msg.ap >= msg.bp;
    if (!Number.isFinite(providerMs) || !priceValid) {
      proof.malformedEvents += 1; continue;
    }
    const age = receivedMs - providerMs;
    // Provider timestamp is the only acceptable clock. Never substitute local receipt time.
    if (age < -5000) { proof.futureEvents += 1; continue; }
    const nonnegativeAge = Math.max(0,age);
    const ageBucket = nonnegativeAge <= 100 ? "le100"
      : nonnegativeAge <= 500 ? "le500"
      : nonnegativeAge <= 2000 ? "le2000"
      : nonnegativeAge <= 10000 ? "le10000"
      : nonnegativeAge <= 120000 ? "le120000" : "gt120000";
    proof.quoteDeliveryAgeHistogram[ageBucket] += 1;
    if (msg.T === "t") { proof.validTrades += 1; bucket.trades += 1; }
    else { proof.validQuotes += 1; bucket.quotes += 1; }
    if (age <= 120000) { proof.freshEvents += 1; bucket.fresh += 1; }
    else { proof.staleEvents += 1; bucket.stale += 1; }
    if (providerMs > Date.parse(bucket.lastProviderAt || "" ) || bucket.lastProviderAt === null) {
      bucket.lastProviderAt = new Date(providerMs).toISOString();
    }
    if (providerMs > Date.parse(proof.lastProviderAt || "") || proof.lastProviderAt === null) {
      proof.lastProviderAt = new Date(providerMs).toISOString();
    }
  }
  return proof;
}

export function finishIexShadowProof(proof, finishedAt) {
  if (!Number.isFinite(Date.parse(finishedAt))) throw Error("IEX_SHADOW_INVALID_FINISH");
  const observed = proof.freshEvents > 0;
  const h = proof.quoteDeliveryAgeHistogram;
  const samples = Object.values(h).reduce((a,b)=>a+b,0);
  const threshold = Math.ceil(samples * 0.95);
  let cumulative = 0;
  let bound = null;
  for (const [key,upper] of [["le100",100],["le500",500],["le2000",2000],
    ["le10000",10000],["le120000",120000],["gt120000",null]]) {
    cumulative += h[key];
    if (samples > 0 && cumulative >= threshold) {bound=upper;break;}
  }
  return {
    ...proof,
    finishedAt,
    providerToReceiptP95UpperBoundMs: bound,
    status: !proof.authenticated ? "NOT_AUTHENTICATED"
      : !proof.subscriptionConfirmed ? "NOT_SUBSCRIBED"
      : observed ? "FRESH_IEX_SHADOW_OBSERVED" : "NO_FRESH_IEX_TICKS",
    sampledSymbols: Object.values(proof.bySymbol).filter(b => b.fresh > 0).length,
    // Raw IEX quote/trade prices are intentionally never persisted or redistributed.
    paperEligibility: "VALIDATION_ONLY", paperQuorumCredit: 0,
    brokerConnectivityAllowed: false, liveTradingAllowed: false, realOrders: 0,
  };
}
