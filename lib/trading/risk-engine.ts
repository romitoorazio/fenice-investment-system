import type {
  PreTradeDecision,
  ProposedOrder,
  RiskCheck,
  RiskContext,
  RiskLimits,
} from "./types.ts";

export const DEFAULT_RISK_LIMITS: RiskLimits = {
  maxOrderNotionalPercent: 5,
  maxSingleAssetWeightPercent: 15,
  maxGrossExposurePercent: 80,
  maxDailyTurnoverPercent: 20,
  maxOpenOrders: 20,
  minDataConfidence: 90,
  minIndependentSources: 2,
  maxRiskScore: 75,
  maxQuoteAgeSeconds: 120,
};

const finitePositive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;

function quoteAgeSeconds(observedAt: string, now = Date.now()): number {
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now - observed) / 1000);
}

export function evaluatePreTradeRisk(
  order: ProposedOrder,
  context: RiskContext,
  limits: RiskLimits = DEFAULT_RISK_LIMITS,
  now = Date.now(),
): PreTradeDecision {
  const orderNotionalEuro = finitePositive(order.quantity) && finitePositive(order.referencePrice) && finitePositive(context.fxToEuro)
    ? order.quantity * order.referencePrice * context.fxToEuro
    : Number.NaN;

  const resultingPositionNotionalEuro = order.side === "BUY"
    ? context.existingPositionNotionalEuro + (Number.isFinite(orderNotionalEuro) ? orderNotionalEuro : 0)
    : Math.max(0, context.existingPositionNotionalEuro - (Number.isFinite(orderNotionalEuro) ? orderNotionalEuro : 0));
  const resultingGrossExposureEuro = order.side === "BUY"
    ? context.currentGrossExposureEuro + (Number.isFinite(orderNotionalEuro) ? orderNotionalEuro : 0)
    : Math.max(0, context.currentGrossExposureEuro - (Number.isFinite(orderNotionalEuro) ? orderNotionalEuro : 0));
  const resultingDailyTurnoverEuro = context.dailyTurnoverEuro + (Number.isFinite(orderNotionalEuro) ? orderNotionalEuro : 0);

  const capital = context.capitalEuro;
  const resultingPositionWeightPercent = finitePositive(capital) ? (resultingPositionNotionalEuro / capital) * 100 : Number.POSITIVE_INFINITY;
  const resultingGrossExposurePercent = finitePositive(capital) ? (resultingGrossExposureEuro / capital) * 100 : Number.POSITIVE_INFINITY;
  const resultingDailyTurnoverPercent = finitePositive(capital) ? (resultingDailyTurnoverEuro / capital) * 100 : Number.POSITIVE_INFINITY;
  const orderNotionalPercent = finitePositive(capital) && Number.isFinite(orderNotionalEuro) ? (orderNotionalEuro / capital) * 100 : Number.POSITIVE_INFINITY;
  const quoteAge = quoteAgeSeconds(context.quoteObservedAt, now);
  const noShortSelling = order.side !== "SELL"
    || (Number.isFinite(orderNotionalEuro) && orderNotionalEuro <= context.existingPositionNotionalEuro + 0.01);

  const checks: RiskCheck[] = [
    { code: "mode-paper-only", passed: order.mode === "PAPER", message: "Only PAPER execution is permitted.", observed: order.mode, limit: "PAPER" },
    { code: "human-confirmation", passed: order.humanConfirmed === true, message: "Human confirmation is mandatory.", observed: order.humanConfirmed, limit: true },
    { code: "live-release-closed", passed: context.liveTradingReleased === false, message: "Live release lock must remain closed in paper operations.", observed: context.liveTradingReleased, limit: false },
    { code: "broker-network-disabled", passed: context.brokerConnectivityAllowed === false, message: "Broker network connectivity must remain disabled.", observed: context.brokerConnectivityAllowed, limit: false },
    { code: "kill-switch", passed: context.killSwitchEngaged === false, message: "Kill switch must not be engaged.", observed: context.killSwitchEngaged, limit: false },
    { code: "valid-capital", passed: finitePositive(capital), message: "Capital must be positive.", observed: capital },
    { code: "valid-order-size", passed: finitePositive(order.quantity) && finitePositive(order.referencePrice), message: "Order quantity and reference price must be positive." },
    { code: "no-short-selling", passed: noShortSelling, message: "Sell order exceeds the existing long position; short selling is disabled.", observed: Number.isFinite(orderNotionalEuro) ? Number(orderNotionalEuro.toFixed(2)) : 0, limit: Number(context.existingPositionNotionalEuro.toFixed(2)) },
    { code: "max-order-notional", passed: orderNotionalPercent <= limits.maxOrderNotionalPercent, message: "Order notional exceeds configured limit.", observed: Number(orderNotionalPercent.toFixed(2)), limit: limits.maxOrderNotionalPercent },
    { code: "max-single-asset", passed: resultingPositionWeightPercent <= limits.maxSingleAssetWeightPercent, message: "Resulting single-asset weight exceeds configured limit.", observed: Number(resultingPositionWeightPercent.toFixed(2)), limit: limits.maxSingleAssetWeightPercent },
    { code: "max-gross-exposure", passed: resultingGrossExposurePercent <= limits.maxGrossExposurePercent, message: "Resulting gross exposure exceeds configured limit.", observed: Number(resultingGrossExposurePercent.toFixed(2)), limit: limits.maxGrossExposurePercent },
    { code: "max-daily-turnover", passed: resultingDailyTurnoverPercent <= limits.maxDailyTurnoverPercent, message: "Daily turnover exceeds configured limit.", observed: Number(resultingDailyTurnoverPercent.toFixed(2)), limit: limits.maxDailyTurnoverPercent },
    { code: "max-open-orders", passed: context.openOrders < limits.maxOpenOrders, message: "Too many open orders.", observed: context.openOrders, limit: limits.maxOpenOrders },
    { code: "data-confidence", passed: context.dataConfidence >= limits.minDataConfidence, message: "Data confidence is below the execution threshold.", observed: context.dataConfidence, limit: limits.minDataConfidence },
    { code: "independent-sources", passed: context.independentSources >= limits.minIndependentSources, message: "Insufficient independent sources.", observed: context.independentSources, limit: limits.minIndependentSources },
    { code: "risk-score", passed: context.riskScore <= limits.maxRiskScore, message: "Instrument risk score exceeds the paper execution limit.", observed: context.riskScore, limit: limits.maxRiskScore },
    { code: "quote-freshness", passed: quoteAge <= limits.maxQuoteAgeSeconds, message: "Market quote is stale.", observed: Number(quoteAge.toFixed(1)), limit: limits.maxQuoteAgeSeconds },
    { code: "no-divergence", passed: context.dataDivergent === false, message: "Cross-source data divergence blocks execution.", observed: context.dataDivergent, limit: false },
    { code: "source-freshness", passed: context.sourceStale === false, message: "Stale source data blocks execution.", observed: context.sourceStale, limit: false },
  ];

  if (order.orderType === "LIMIT") {
    checks.push({
      code: "valid-limit-price",
      passed: finitePositive(order.limitPrice),
      message: "Limit orders require a positive limit price.",
      observed: order.limitPrice ?? "missing",
    });
  }

  const failed = checks.filter((check) => !check.passed);
  return {
    allowed: failed.length === 0,
    orderNotionalEuro: Number.isFinite(orderNotionalEuro) ? Number(orderNotionalEuro.toFixed(2)) : 0,
    resultingPositionWeightPercent: Number.isFinite(resultingPositionWeightPercent) ? Number(resultingPositionWeightPercent.toFixed(2)) : 999,
    resultingGrossExposurePercent: Number.isFinite(resultingGrossExposurePercent) ? Number(resultingGrossExposurePercent.toFixed(2)) : 999,
    resultingDailyTurnoverPercent: Number.isFinite(resultingDailyTurnoverPercent) ? Number(resultingDailyTurnoverPercent.toFixed(2)) : 999,
    checks,
    reasons: failed.map((check) => `${check.code}: ${check.message}`),
  };
}
