import type { DirectaReadOnlySnapshot } from "../brokers/directa-readonly.ts";

export type InternalBrokerExpectation = {
  positions: Array<{ symbol: string; quantity: number }>;
  openOrderClientIds: string[];
  expectedCashEuro?: number;
};

export type BrokerReconciliationBreak = {
  code: "POSITION" | "OPEN_ORDER" | "CASH" | "BROKER_HEALTH" | "SNAPSHOT_COMPLETENESS";
  key: string;
  expected: number | string | boolean;
  actual: number | string | boolean;
};

export type BrokerReconciliationReport = {
  balanced: boolean;
  breaks: BrokerReconciliationBreak[];
  observedAt: string;
};

const OPEN_STATES = new Set(["IN_NEGOTIATION", "IN_NEGOTIATION_AFTER_CONFIRMATION", "AWAITING_CONFIRMATION", "MODIFIED"]);

export function reconcileWithDirecta(
  expected: InternalBrokerExpectation,
  broker: DirectaReadOnlySnapshot,
  options: { quantityTolerance?: number; cashToleranceEuro?: number } = {},
): BrokerReconciliationReport {
  const quantityTolerance = Math.max(0, Number(options.quantityTolerance ?? 1e-8));
  const cashToleranceEuro = Math.max(0, Number(options.cashToleranceEuro ?? 0.05));
  const breaks: BrokerReconciliationBreak[] = [];

  if (!broker.connection.healthy) {
    breaks.push({ code: "BROKER_HEALTH", key: "connection", expected: true, actual: false });
  }
  if (!broker.diagnostics.stockListComplete || !broker.diagnostics.orderListComplete) {
    breaks.push({
      code: "SNAPSHOT_COMPLETENESS",
      key: "lists",
      expected: true,
      actual: broker.diagnostics.stockListComplete && broker.diagnostics.orderListComplete,
    });
  }

  const expectedPositions = new Map(expected.positions.map((item) => [item.symbol.toUpperCase(), Number(item.quantity) || 0]));
  const brokerPositions = new Map(
    broker.positions.map((item) => [item.ticker.toUpperCase(), Number(item.portfolioQuantity ?? item.directaQuantity ?? 0)]),
  );
  const symbols = new Set([...expectedPositions.keys(), ...brokerPositions.keys()]);
  for (const symbol of symbols) {
    const internalQuantity = expectedPositions.get(symbol) ?? 0;
    const brokerQuantity = brokerPositions.get(symbol) ?? 0;
    if (Math.abs(internalQuantity - brokerQuantity) > quantityTolerance) {
      breaks.push({ code: "POSITION", key: symbol, expected: internalQuantity, actual: brokerQuantity });
    }
  }

  const expectedOpenOrders = new Set(expected.openOrderClientIds.filter(Boolean));
  const brokerOpenOrders = new Set(
    broker.orders.filter((order) => OPEN_STATES.has(order.state)).map((order) => order.clientOrderId).filter(Boolean),
  );
  for (const clientOrderId of new Set([...expectedOpenOrders, ...brokerOpenOrders])) {
    const internalOpen = expectedOpenOrders.has(clientOrderId);
    const brokerOpen = brokerOpenOrders.has(clientOrderId);
    if (internalOpen !== brokerOpen) {
      breaks.push({ code: "OPEN_ORDER", key: clientOrderId, expected: internalOpen, actual: brokerOpen });
    }
  }

  if (expected.expectedCashEuro !== undefined) {
    const brokerCash = broker.availability?.totalLiquidity ?? broker.account?.liquidity;
    const expectedCash = Number(expected.expectedCashEuro);
    if (!Number.isFinite(brokerCash) || Math.abs(expectedCash - Number(brokerCash)) > cashToleranceEuro) {
      breaks.push({
        code: "CASH",
        key: "EUR",
        expected: Number(expectedCash.toFixed(2)),
        actual: Number.isFinite(brokerCash) ? Number(Number(brokerCash).toFixed(2)) : "MISSING",
      });
    }
  }

  return {
    balanced: breaks.length === 0,
    breaks,
    observedAt: broker.generatedAt,
  };
}
