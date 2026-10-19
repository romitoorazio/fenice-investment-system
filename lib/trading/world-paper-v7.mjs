import { createHash } from "node:crypto";

// Isolated PAPER-only laboratory. Never imports the V6 OMS or any broker client.
// Source entitlements are registered out-of-band; a provider's own "verified"
// flag cannot manufacture a legal entitlement or independent-source quorum.
const MAX_QUOTE_AGE_MS = 120_000;
const MAX_SESSION_AGE_MS = 60_000;
const MAX_FX_AGE_MS = 120_000;
const MAX_INTENT_AGE_MS = 180_000;
const MAX_DIVERGENCE = 0.005;
const MAX_POSITION_FRACTION = 0.05;
const MAX_CYCLE_TURNOVER_FRACTION = 0.20;
const MAX_REGIONAL_EXPOSURE_FRACTION = 0.35;
const MAX_PRICE_IMPACT_BPS = 5;
const MIC = /^[A-Z0-9]{4}$/;
const SYMBOL = /^[A-Z0-9][A-Z0-9._:-]{0,23}$/;
const CCY = /^[A-Z]{3}$/;
const FINGERPRINT = /^[a-f0-9]{64}$/i;
const safeNumber = (value) => typeof value === "number" && Number.isFinite(value);
const norm = (value) => typeof value === "string" ? value.trim().toUpperCase() : "";
const key = (item) => norm(item?.exchangeMic) + ":" + norm(item?.ticker ?? item?.symbol);
const isoTime = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : null;
};
const fresh = (timestamp, now, maxAge) => {
  const value = isoTime(timestamp);
  return value !== null && now >= value && now - value <= maxAge;
};
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const round = (value) => Math.round(value * 10000) / 10000;
const reasonsOnly = (value) => [...new Set(value)];
function legitRegistryEntry(registry, quote, now) {
  const ent = quote?.entitlement;
  if (!ent || ent.status !== "VERIFIED" || ent.usageScope !== "NON_DISPLAY_INTERNAL"
    || ent.automatedUseAllowed !== true || ent.dualControlVerified !== true
    || typeof ent.evidenceRef !== "string" || !ent.evidenceRef.trim()
    || !FINGERPRINT.test(ent.evidenceSha256 || "") || !freshEntitlement(ent.validUntil, now)) return false;
  return (registry?.sources || []).some((entry) =>
    entry?.sourceFamily === quote.sourceFamily && entry?.provider === quote.provider
    && entry?.exchangeMic === quote.exchangeMic && entry?.currency === quote.currency
    && entry?.evidenceRef === ent.evidenceRef && entry?.evidenceSha256 === ent.evidenceSha256
    && entry?.automatedUseAllowed === true && entry?.usageScope === "NON_DISPLAY_INTERNAL"
    && freshEntitlement(entry.validUntil, now));
}
function freshEntitlement(validUntil, now) {
  const limit = isoTime(validUntil);
  return limit !== null && limit > now && limit <= now + 366 * 86400_000;
}
function verifySession(mic, sessions, registry, now) {
  const matches = (sessions || []).filter((s) => norm(s?.exchangeMic) === mic);
  if (matches.length !== 1) return { ready: false, reason: "EXACT_VENUE_SESSION_MISSING_OR_AMBIGUOUS" };
  const s = matches[0];
  const registered = (registry?.sessions || []).some((entry) =>
    entry?.exchangeMic === mic && entry?.source === s.source
    && entry?.marketStateEntitled === true && freshEntitlement(entry.validUntil, now));
  if (!registered || s?.state !== "OPEN" || s?.authoritative !== true
    || !fresh(s?.observedAt, now, MAX_SESSION_AGE_MS))
    return { ready: false, reason: "VENUE_OPEN_NOT_AUTHORITATIVELY_PROVEN" };
  return { ready: true, observedAt: s.observedAt, source: s.source };
}
function verifiedQuotes(instrument, quotes, registry, now) {
  const unique = new Map();
  const id = key(instrument);
  for (const q of quotes || []) {
    if (key(q) !== id || norm(q?.currency) !== norm(instrument.currency)) continue;
    if (!safeNumber(q.price) || q.price <= 0 || q.realtime !== true
      || q.provenanceVerified !== true || q.exactVenueVerified !== true
      || !fresh(q.observedAt, now, MAX_QUOTE_AGE_MS) || !legitRegistryEntry(registry, q, now)) continue;
    if (typeof q.sourceFamily !== "string" || !q.sourceFamily) continue;
    const current = unique.get(q.sourceFamily);
    if (!current || isoTime(q.observedAt) > isoTime(current.observedAt)) unique.set(q.sourceFamily, q);
  }
  const eligible = [...unique.values()];
  if (eligible.length < 2) return { ready: false, reason: "TWO_ENTITLED_INDEPENDENT_REALTIME_QUOTES_REQUIRED", families: eligible.map((q) => q.sourceFamily) };
  const prices = eligible.map((q) => q.price).sort((a, b) => a - b);
  const median = prices.length % 2 ? prices[Math.floor(prices.length / 2)]
    : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2;
  if (prices.some((price) => Math.abs(price / median - 1) > MAX_DIVERGENCE))
    return { ready: false, reason: "QUOTE_DIVERGENCE", families: eligible.map((q) => q.sourceFamily) };
  return { ready: true, price: median, families: eligible.map((q) => q.sourceFamily),
    latestObservedAt: eligible.map((q) => q.observedAt).sort().at(-1) };
}
function verifiedFx(instrument, fx, registry, now) {
  const currency = norm(instrument.currency);
  if (currency === "EUR") return { ready: true, rate: 1, source: "EUR" };
  const matches = (fx || []).filter((x) => norm(x?.from) === currency && norm(x?.to) === "EUR"
    && safeNumber(x?.rate) && x.rate > 0 && x.provenanceVerified === true
    && x.realtime === true && fresh(x.observedAt, now, MAX_FX_AGE_MS)
    && (registry?.fx || []).some((source) => source?.sourceFamily === x.sourceFamily
      && source?.from === currency && source?.to === "EUR"
      && source?.paperUseAllowed === true && freshEntitlement(source.validUntil, now)));
  if (matches.length === 0) return { ready: false, reason: "FRESH_ENTITLED_FX_TO_EUR_REQUIRED" };
  matches.sort((a,b) => isoTime(b.observedAt) - isoTime(a.observedAt));
  return { ready: true, rate: matches[0].rate, source: matches[0].sourceFamily };
}
function eventValid(previous, event) {
  if (event.prevHash !== previous) return false;
  const { hash, ...body } = event;
  return typeof hash === "string" && hash === digest(body);
}
function verifiedLedger(input) {
  if (input == null) return { cashEuro: 1000, positions: {}, events: [], lastHash: "GENESIS", valid: true };
  if (!safeNumber(input.cashEuro) || input.cashEuro < 0
    || !input.positions || typeof input.positions !== "object" || Array.isArray(input.positions)
    || !Array.isArray(input.events)) return { valid: false };
  let previous = "GENESIS";
  for (const event of input.events) {
    if (!eventValid(previous, event)) return { valid: false };
    previous = event.hash;
  }
  for (const value of Object.values(input.positions)) {
    if (!value || !safeNumber(value.quantity) || value.quantity < 0
      || !Number.isSafeInteger(value.quantity) || !safeNumber(value.unitCostEuro)
      || value.unitCostEuro < 0) return { valid: false };
  }
  return { cashEuro: input.cashEuro, positions: { ...input.positions }, events: [...input.events], lastHash: previous, valid: true };
}
function cleanInstrument(instrument) {
  return !!(instrument && (instrument.assetClass === "equity" || instrument.assetClass === "etf")
    && MIC.test(norm(instrument.exchangeMic)) && SYMBOL.test(norm(instrument.ticker))
    && CCY.test(norm(instrument.currency))
    && typeof instrument.region === "string" && instrument.region.length >= 3
    && instrument.status === "active");
}
function appendPaperEvent(state, body) {
  const record = { ...body, prevHash: state.lastHash };
  const event = { ...record, hash: digest(record) };
  state.events.push(event);
  state.lastHash = event.hash;
}
export function runWorldPaperV7({
  instruments = [], sessions = [], quotes = [], fx = [], entitlements = {},
  intents = [], previousLedger = null, paperRunAuthorized = false, nowIso = new Date().toISOString(),
} = {}) {
  const now = isoTime(nowIso);
  if (now === null) throw new Error("INVALID_WORLD_PAPER_CLOCK");
  const state = verifiedLedger(previousLedger);
  if (!state.valid) throw new Error("INVALID_WORLD_PAPER_LEDGER");
  if (!Array.isArray(instruments) || !Array.isArray(intents) || !Array.isArray(quotes)
    || !Array.isArray(sessions) || !Array.isArray(fx)) throw new Error("INVALID_WORLD_PAPER_INPUT");
  // The 2026 active V6 baseline remains entirely independent of this V7 journal.
  const accepted = new Map();
  const rows = [];
  for (const instrument of instruments) {
    if (!cleanInstrument(instrument)) continue;
    const id = key(instrument);
    if (accepted.has(id)) {
      const original = accepted.get(id);
      original.reasons.push("DUPLICATE_LISTING_IDENTITY");
      original.ready = false;
      continue;
    }
    const session = verifySession(norm(instrument.exchangeMic), sessions, entitlements, now);
    const marketQuotes = verifiedQuotes(instrument, quotes, entitlements, now);
    const currency = verifiedFx(instrument, fx, entitlements, now);
    const reasons = [];
    if (instrument.paperExecutionAllowed === false) reasons.push("LISTING_RESEARCH_ONLY_UNTIL_APPROVED");
    if (!session.ready) reasons.push(session.reason);
    if (!marketQuotes.ready) reasons.push(marketQuotes.reason);
    if (!currency.ready) reasons.push(currency.reason);
    const row = {
      key: id, symbol: instrument.ticker, mic: instrument.exchangeMic,
      country: instrument.country, region: instrument.region, currency: instrument.currency,
      ready: reasons.length === 0, reasons, independentFamilies: marketQuotes.families || [],
      verifiedPrice: marketQuotes.ready ? marketQuotes.price : null,
      fxToEuro: currency.ready ? currency.rate : null,
      sessionObservedAt: session.observedAt ?? null,
    };
    accepted.set(id, row);
    rows.push(row);
  }
  // Broker interfaces and LIVE release flags deliberately do not exist here.
  const fills = [], rejectedIntents = [];
  const seenIntentIds = new Set(state.events.map((e) => e.intentId));
  const baseEquity = state.cashEuro + Object.values(state.positions).reduce(
    (sum, p) => sum + p.quantity * p.unitCostEuro, 0);
  let remainingTurnover = baseEquity * MAX_CYCLE_TURNOVER_FRACTION;
  for (const intent of intents) {
    const id = norm(intent?.exchangeMic) + ":" + norm(intent?.symbol);
    const row = accepted.get(id);
    const reasons = [];
    if (paperRunAuthorized !== true) reasons.push("WORLD_PAPER_SIMULATION_NOT_AUTHORIZED");
    if (!row || row.ready !== true) reasons.push("LISTING_NOT_PAPER_ELIGIBLE");
    if (intent?.side !== "BUY" && intent?.side !== "SELL") reasons.push("INVALID_SIDE");
    if (typeof intent?.id !== "string" || !/^[a-zA-Z0-9._-]{8,100}$/.test(intent.id)
      || seenIntentIds.has(intent.id)) reasons.push("DUPLICATE_OR_INVALID_INTENT_ID");
    if (intent?.approvedForWorldPaper !== true || typeof intent?.strategyId !== "string"
      || intent.strategyId.length < 3) reasons.push("MISSING_APPROVED_PAPER_STRATEGY");
    if (!fresh(intent?.createdAt, now, MAX_INTENT_AGE_MS)) reasons.push("STALE_STRATEGY_INTENT");
    if (!safeNumber(intent?.maxNotionalEuro) || intent.maxNotionalEuro <= 0)
      reasons.push("INVALID_NOTIONAL");
    if (reasons.length) {
      rejectedIntents.push({ intentId: intent?.id ?? null, key: id, reasons: reasonsOnly(reasons) });
      continue;
    }
    const held = state.positions[id]?.quantity ?? 0;
    const unitMark = row.verifiedPrice * row.fxToEuro;
    const unitFill = unitMark * (1 + (intent.side === "BUY" ? 1 : -1) * MAX_PRICE_IMPACT_BPS / 10000);
    const unitFeeBudget = 1;
    const maxByRisk = Math.min(intent.maxNotionalEuro, baseEquity * MAX_POSITION_FRACTION,
      remainingTurnover, intent.side === "BUY" ? Math.max(0,state.cashEuro-unitFeeBudget) : held*unitMark);
    const quantity = Math.min(intent.side === "SELL" ? held : Number.MAX_SAFE_INTEGER,
      Math.floor(maxByRisk / unitFill));
    const notionalEuro = round(quantity * unitFill);
    const feeEuro = Math.max(1, round(notionalEuro * .0015));
    const totalCost = notionalEuro + feeEuro;
    if (!Number.isSafeInteger(quantity) || quantity < 1 ||
      (intent.side === "BUY" && totalCost > state.cashEuro + 0.000001)) {
      rejectedIntents.push({ intentId: intent.id, key: id, reasons: ["RISK_BUDGET_OR_INSUFFICIENT_CASH"] });
      continue;
    }
    const position = state.positions[id] || { quantity: 0, unitCostEuro: 0 };
    if (intent.side === "SELL" && held < quantity) {
      rejectedIntents.push({ intentId: intent.id, key: id, reasons: ["POSITION_NOT_HELD"] });
      continue;
    }
    if (intent.side === "BUY") {
      const exposure = Object.entries(state.positions).reduce((sum,[k,p])=>
        sum + (accepted.get(k)?.region === row.region ? p.quantity*p.unitCostEuro : 0),0);
      if (exposure + totalCost > baseEquity * MAX_REGIONAL_EXPOSURE_FRACTION) {
        rejectedIntents.push({ intentId: intent.id, key: id, reasons: ["REGION_EXPOSURE_LIMIT"] });
        continue;
      }
    }
    const nextQuantity = intent.side === "BUY" ? held + quantity : held - quantity;
    const nextCost = intent.side === "BUY"
      ? round((held * position.unitCostEuro + totalCost) / nextQuantity)
      : position.unitCostEuro;
    state.positions[id] = { quantity: nextQuantity, unitCostEuro: nextQuantity ? nextCost : 0 };
    state.cashEuro = round(state.cashEuro + (intent.side === "BUY" ? -totalCost : notionalEuro-feeEuro));
    remainingTurnover = Math.max(0, remainingTurnover-notionalEuro);
    const fill = { intentId: intent.id, key: id, region: row.region, mic: row.mic,
      side: intent.side, quantity, unitPrice: row.verifiedPrice,
      fxToEuro: row.fxToEuro, simulatedUnitFillEuro: round(unitFill),
      notionalEuro, feeEuro, executedAt: nowIso,
      evidenceFamilies: row.independentFamilies, simulated: true, liveTradingAllowed: false };
    appendPaperEvent(state, fill);
    fills.push(fill);
    seenIntentIds.add(intent.id);
  }
  const regions = [...new Set(rows.map(r=>r.region))].sort().map(region => {
    const section = rows.filter(r=>r.region===region);
    return { region, listedInPilot: section.length,
      verifiedPaperListings: section.filter(r=>r.ready).length,
      blockedListings: section.filter(r=>!r.ready).length,
      simulatedFills: fills.filter(f=>f.region===region).length };
  });
  return {
    version: 1, mode: "WORLD_PAPER_V7_ISOLATED", generatedAt: nowIso,
    paperRunAuthorized: paperRunAuthorized === true,
    liveTradingAllowed: false, brokerConnectivityAllowed: false,
    modifiesV6: false, sourceRightsUnverifiedByDefault: true,
    controls: { maxQuoteAgeSeconds: 120, maxSessionAgeSeconds: 60,
      maxFxAgeSeconds: 120, independentSourceFamiliesRequired: 2,
      maxPositionFraction: MAX_POSITION_FRACTION, maxCycleTurnoverFraction: MAX_CYCLE_TURNOVER_FRACTION,
      maxRegionalExposureFraction: MAX_REGIONAL_EXPOSURE_FRACTION },
    summary: { pilotListings: rows.length, regions: regions.length,
      independentlyVerifiedListings: rows.filter(r=>r.ready).length,
      proposedIntents: intents.length, filledPaperOrders: fills.length, rejectedIntents: rejectedIntents.length },
    regions, listings: rows, fills, rejectedIntents,
    paperLedger: { cashEuro: state.cashEuro, positions: state.positions, events: state.events, lastHash: state.lastHash },
  };
}
