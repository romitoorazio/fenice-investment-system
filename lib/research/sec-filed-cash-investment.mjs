/**
 * Reconciliations from two filed cash-flow statements. These are historical,
 * source-backed annual cash-investment adjustments, NOT a live quote, model
 * forecast or authorization. Only apply to the exact issuer + fiscal filing.
 *
 * Explicit definitions:
 * AMZN: cash purchases of property/equipment NET of sales and incentives,
 *       as used in its SEC 10-K free-cash-flow reconciliation.
 * NVDA: cash purchases of property/equipment/intangibles PLUS principal
 *       payments on those assets, as used in the FY2026 FCF reconciliation.
 *
 * Do not generalize a number to the issuer's next fiscal year.
 */
const ENTRIES = Object.freeze([
  Object.freeze({
    ticker: "AMZN", cik: 1018724, fiscalEnd: "2025-12-31", currency: "USD",
    operatingCashFlow: 139_514_000_000, cashInvestment: 128_320_000_000,
    publishedFreeCashFlow: 11_194_000_000,
    filingUrl: "https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm",
    definition: "Net cash capital expenditures: PPE purchases less vendor incentives and sale proceeds",
  }),
  Object.freeze({
    ticker: "NVDA", cik: 1045810, fiscalEnd: "2026-01-25", currency: "USD",
    operatingCashFlow: 102_718_000_000, cashInvestment: 6_143_000_000,
    publishedFreeCashFlow: 96_575_000_000,
    filingUrl: "https://www.sec.gov/Archives/edgar/data/1045810/000104581026000021/nvda-20260125.htm",
    definition: "Cash PPE/intangible purchases 6.042bn plus related principal payments 0.101bn",
  }),
]);
export const HISTORICAL_AUDITED_CASH_INVESTMENTS = ENTRIES;

const validNumber = n => typeof n === "number" && Number.isFinite(n) && n >= 0;

export function reconcileFiledCashInvestment({
  ticker, cik, fiscalEnd, currency, operatingCashFlow, extractedCashInvestment, filing, asOf,
} = {}) {
  const entry = ENTRIES.find(x => x.ticker === ticker && x.cik === cik
    && x.fiscalEnd === fiscalEnd && x.currency === currency);
  if (!entry) return { status: "NO_HISTORICAL_FILING_RECONCILIATION", applied: false };
  const asOfMs = asOf instanceof Date ? asOf.getTime() : NaN;
  const filedAtMs = Date.parse(String(filing?.filedAt ?? ""));
  const officialFiling = Number.isFinite(asOfMs) && Number.isFinite(filedAtMs)
    && filedAtMs <= asOfMs && filing?.form === "10-K"
    && filing.periodEnd === entry.fiscalEnd
    && filing.url === entry.filingUrl
    && typeof filing.filedAt === "string"
    && filing.filedAt >= entry.fiscalEnd;
  if (!officialFiling) return { status: "FILING_NOT_VERIFIED", applied: false };
  if (!validNumber(operatingCashFlow)
    || Math.abs(operatingCashFlow - entry.operatingCashFlow) > Math.max(1_000_000, entry.operatingCashFlow * 0.001))
    return { status: "CASH_FLOW_NOT_RECONCILED", applied: false };
  if (entry.operatingCashFlow - entry.cashInvestment !== entry.publishedFreeCashFlow)
    return { status: "PUBLISHED_FCF_ARITHMETIC_INVALID", applied: false };
  const alreadyAligned = validNumber(extractedCashInvestment)
    && Math.abs(extractedCashInvestment - entry.cashInvestment) <= Math.max(1_000_000, entry.cashInvestment * 0.001);
  return {
    status: alreadyAligned ? "FILING_ALREADY_ALIGNED" : "FILED_CASH_INVESTMENT_RECONCILED",
    applied: true,
    cashInvestment: entry.cashInvestment,
    previouslyExtractedCashInvestment: validNumber(extractedCashInvestment) ? extractedCashInvestment : null,
    freeCashFlow: entry.publishedFreeCashFlow,
    source: "SEC FILED_ANNUAL_CASH_FLOW_RECONCILIATION",
    filingUrl: entry.filingUrl,
    fiscalEnd: entry.fiscalEnd,
    reportingCurrency: entry.currency,
    definition: entry.definition,
    researchOnly: true,
    independentOfPaperV6: true,
    brokerOrderAllowed: false,
    liveTradingAllowed: false,
  };
}
