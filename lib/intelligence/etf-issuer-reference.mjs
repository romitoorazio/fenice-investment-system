/**
 * Pinned public issuer research snapshots, manually checked on 2026-10-26.
 * These are not tradable quotes, NAV marks, return forecasts, or a live feed.
 * Revalidate against each issuer before using beyond the freshness window.
 * Do not promote ETF expense ratios into a Committee BUY valuation score.
 */
const REFERENCES = Object.freeze({
  SPY: Object.freeze({
    issuer: "State Street",
    isin: "US78462F1030",
    benchmarkIndex: "S&P 500 Index",
    issuerExpenseRatioPercent: 0.0945,
    ratioKind: "GROSS_EXPENSE_RATIO",
    sourceUrl: "https://www.ssga.com/us/en/individual/etfs/state-street-spdr-sp-500-etf-trust-spy",
    checkedOn: "2026-10-26",
    expectedName: /s&p\s*500/i,
  }),
  QQQ: Object.freeze({
    issuer: "Invesco",
    isin: "US46090E1038",
    benchmarkIndex: "Nasdaq-100 Index",
    issuerExpenseRatioPercent: 0.18,
    ratioKind: "TOTAL_EXPENSE_RATIO",
    sourceUrl: "https://www.invesco.com/us/en/financial-products/etfs/invesco-qqq-trust-series-1.html",
    checkedOn: "2026-10-26",
    expectedName: /nasdaq[ -]?100/i,
  }),
  IWM: Object.freeze({
    issuer: "iShares / BlackRock",
    isin: "US4642876555",
    benchmarkIndex: "Russell 2000 Index",
    issuerExpenseRatioPercent: 0.19,
    ratioKind: "EXPENSE_RATIO_AS_IN_PROSPECTUS",
    sourceUrl: "https://www.ishares.com/us/products/239710/ishares-russell-2000-etf",
    checkedOn: "2026-10-26",
    expectedName: /russell\s*2000/i,
  }),
});
const MAX_AGE_MS = 60 * 86400000;

export function verifiedEtfIssuerFacts(asset, { nowMs = Date.now() } = {}) {
  if (typeof nowMs !== "number" || !Number.isFinite(nowMs)) return null;
  if (String(asset?.assetClass || "").toUpperCase() !== "ETF") return null;
  if (String(asset?.currency || "").toUpperCase() !== "USD") return null;
  const symbol = typeof asset?.symbol === "string" ? asset.symbol.trim().toUpperCase() : "";
  const ref = REFERENCES[symbol];
  if (!ref || !ref.expectedName.test(String(asset?.name || ""))) return null;
  const checkedMs = Date.parse(ref.checkedOn + "T00:00:00.000Z");
  const ageMs = nowMs - checkedMs;
  if (!Number.isFinite(checkedMs) || ageMs < 0 || ageMs > MAX_AGE_MS) return null;
  if (typeof ref.sourceUrl !== "string" || !ref.sourceUrl.startsWith("https://")) return null;
  if (!Number.isFinite(ref.issuerExpenseRatioPercent)
      || ref.issuerExpenseRatioPercent <= 0 || ref.issuerExpenseRatioPercent > 5) return null;
  // Leave out the regex: only serializable, issuer-attributed research facts.
  return {
    issuer: ref.issuer,
    isin: ref.isin,
    benchmarkIndex: ref.benchmarkIndex,
    issuerExpenseRatioPercent: ref.issuerExpenseRatioPercent,
    issuerExpenseRatioKind: ref.ratioKind,
    issuerSourceUrl: ref.sourceUrl,
    issuerSourceCheckedOn: ref.checkedOn,
    status: "PRIMARY_ISSUER_PAGE_CHECKED",
    expenseRatioIsTradingCost: false,
    authorizesBuy: false,
    authorizesPaper: false,
    authorizesLive: false,
  };
}
