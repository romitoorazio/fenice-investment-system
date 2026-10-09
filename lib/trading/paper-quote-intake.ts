/**
 * Quote intake boundary for a future server-only PAPER sampler.
 * Untrusted provider payloads never become execution evidence by themselves.
 * No network access, broker permissions, persistence, or LIVE authorization.
 */
export const PAPER_MAX_AGE_MS = 120_000;
const APPROVED = new Set(["alpaca", "twelve-data"]);
export type PaperQuoteCandidate = {
  symbol: string;
  provider: string;
  observedAt: string;
  price: number;
  currency: string;
  eligibility: "PAPER";
  provenanceVerified: false;
  executionAuthorized: false;
};
export type RejectedQuote = { accepted: false; reason: string };
export type QuoteResult = { accepted: true; value: PaperQuoteCandidate } | RejectedQuote;
export function parsePaperQuoteCandidate(
  input: unknown,
  now: number = Date.now(),
): QuoteResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { accepted: false, reason: "INVALID_PAYLOAD" };
  }
  const item = input as Record<string, unknown>;
  const provider = typeof item.provider === "string" ? item.provider.trim().toLowerCase() : "";
  if (!APPROVED.has(provider)) return { accepted: false, reason: "UNAPPROVED_SOURCE" };
  if (item.eligibility !== "PAPER") return { accepted: false, reason: "NOT_PAPER" };
  const symbol = typeof item.symbol === "string" ? item.symbol.trim().toUpperCase() : "";
  if (!/^[A-Z0-9][A-Z0-9.\-]{0,19}$/.test(symbol)) {
    return { accepted: false, reason: "INVALID_SYMBOL" };
  }
  if (typeof item.price !== "number" || !Number.isFinite(item.price) || item.price <= 0) {
    return { accepted: false, reason: "INVALID_PRICE" };
  }
  const timestamp = typeof item.observedAt === "string" ? Date.parse(item.observedAt) : NaN;
  if (!Number.isFinite(now) || !Number.isFinite(timestamp) ||
      timestamp > now || now - timestamp > PAPER_MAX_AGE_MS) {
    return { accepted: false, reason: "STALE_OR_FUTURE_TIMESTAMP" };
  }
  const currency = typeof item.currency === "string" ? item.currency.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(currency)) return { accepted: false, reason: "INVALID_CURRENCY" };
  return {
    accepted: true,
    value: {
      symbol, provider, price: item.price, currency,
      observedAt: new Date(timestamp).toISOString(),
      eligibility: "PAPER", provenanceVerified: false, executionAuthorized: false,
    },
  };
}
/**
 * Advisory-only pair diagnostic; no authorization or execution-grade quorum.
 * Cross-currency and mismatched-symbol comparisons fail closed.
 */
export function comparePaperCandidates(a: QuoteResult, b: QuoteResult) {
  if (!a.accepted || !b.accepted) return { comparable: false, reason: "REJECTED_INPUT", executionAuthorized: false };
  const x = a.value, y = b.value;
  if (x.symbol !== y.symbol || x.currency !== y.currency || x.provider === y.provider) {
    return { comparable: false, reason: "NOT_INDEPENDENT_OR_NOT_COMPARABLE", executionAuthorized: false };
  }
  const median = (x.price + y.price) / 2;
  const spreadPercent = 100 * Math.abs(x.price - y.price) / median;
  return {
    comparable: spreadPercent <= 0.75,
    reason: spreadPercent <= 0.75 ? "ADVISORY_AGREEMENT" : "PRICE_DIVERGENCE",
    spreadPercent, executionAuthorized: false,
  };
}
