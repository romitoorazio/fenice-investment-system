/**
 * Evidence admission for NEW V7 research observations.
 * Never re-labels research as PAPER or LIVE and does not modify V6.
 * A decision's market price must have been known by the committee timestamp.
 */
const HOUR = 60 * 60 * 1000;
const REQUIRED_EVIDENCE = "YAHOO_REGULAR_TRADE_META_RESEARCH_ONLY";

function strictInstant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return null;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== value.slice(0, 19)) return null;
  return ms;
}
function positive(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
export function admitV7ResearchQuotes(committee, now = new Date(), {
  maxCommitteeAgeMs = 24 * HOUR,
  maxQuoteAgeMs = 4 * HOUR,
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : NaN;
  if (!Number.isFinite(nowMs)) throw new Error("INVALID_V7_ADMISSION_CLOCK");
  const asOfMs = strictInstant(committee?.generatedAt);
  const committeeCurrent = asOfMs !== null && asOfMs <= nowMs
    && nowMs - asOfMs <= maxCommitteeAgeMs;
  const rows = Array.isArray(committee?.allDecisions) ? committee.allDecisions : [];
  const accepted = [], prices = new Map();
  const rejected = {};
  const reject = code => { rejected[code] = (rejected[code] || 0) + 1; };
  for (const row of rows) {
    if (!committeeCurrent) { reject("COMMITTEE_TIME_INVALID_OR_STALE"); continue; }
    const symbol = typeof row?.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
    const proof = row?.priceEvidence;
    const observedAt = strictInstant(proof?.observedAt);
    if (!/^[A-Z0-9._-]{1,25}$/.test(symbol)) { reject("INVALID_SYMBOL"); continue; }
    // Committee reference prices can be DAILY adjusted candle closes, while
    // the separately verified Yahoo regular-session trade is the only price
    // observed at the V7 decision timestamp. Never mistake the former for an
    // execution quote. Unmarked legacy rows still require exact agreement.
    const dailyCandleReference = proof?.referencePriceSemantics === "DAILY_ADJUSTED_CANDLE_CLOSE";
    const priceGap = positive(row?.currentPrice) && positive(proof?.price)
      ? Math.abs(proof.price - row.currentPrice) / row.currentPrice : Infinity;
    if (!positive(row?.currentPrice) || !positive(proof?.price)
      || (dailyCandleReference
        ? row?.currency !== "USD" || priceGap > 0.15
        : Math.abs(proof.price - row.currentPrice) > Math.max(0.01, row.currentPrice * 0.0002))) {
      reject("PRICE_MISSING_OR_MISMATCH"); continue;
    }
    if (proof?.evidenceType !== REQUIRED_EVIDENCE || typeof proof?.source !== "string"
      || !proof.source.includes("Yahoo Finance") || proof?.executionEligible !== false
      || proof?.paperCertificationEligible !== false || proof?.brokerSubmissionAllowed !== false
      || proof?.liveTradingAllowed !== false) {
      reject("RESEARCH_ONLY_PROVENANCE_NOT_VERIFIED"); continue;
    }
    if (observedAt === null || observedAt > asOfMs || observedAt > nowMs
      || asOfMs - observedAt > maxQuoteAgeMs) {
      reject("PRICE_TIME_INVALID_STALE_OR_FUTURE"); continue;
    }
    if (prices.has(symbol)) { reject("DUPLICATE_SYMBOL"); continue; }
    // Only V7 gets the as-of trade price; Committee scoring, V6 PAPER,
    // portfolio sizing and the saved Committee report remain unchanged.
    const studyPrice = dailyCandleReference ? proof.price : row.currentPrice;
    prices.set(symbol, studyPrice);
    accepted.push(dailyCandleReference
      ? { ...row, committeeReferencePrice: row.currentPrice, currentPrice: studyPrice }
      : row);
  }
  return {
    state: committeeCurrent ? "RESEARCH_ONLY" : "SOURCE_STALE_BLOCKED",
    snapshotAsOf: committeeCurrent ? new Date(asOfMs).toISOString() : null,
    accepted,
    prices,
    evidence: {
      checkedCandidates: rows.length,
      acceptedCandidates: accepted.length,
      rejectedCandidates: rows.length - accepted.length,
      reasonCounts: rejected,
      maxCommitteeAgeHours: maxCommitteeAgeMs / HOUR,
      maxQuoteAgeHours: maxQuoteAgeMs / HOUR,
      source: REQUIRED_EVIDENCE,
    },
    safety: {
      researchOnly: true, modifiesV6: false, paperCertificationEligible: false,
      executionEligible: false, brokerSubmissionAllowed: false, liveTradingAllowed: false,
    },
  };
}
