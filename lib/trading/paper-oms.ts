import { evaluatePreTradeRisk } from "./risk-engine";
import type { PaperExecution, ProposedOrder, RiskContext, RiskLimits } from "./types";

export type PaperOmsConfig = {
  slippageBps?: number;
  feeBps?: number;
  minimumFeeEuro?: number;
  riskLimits?: RiskLimits;
};

export class PaperOms {
  private readonly executions = new Map<string, PaperExecution>();
  private readonly slippageBps: number;
  private readonly feeBps: number;
  private readonly minimumFeeEuro: number;
  private readonly riskLimits?: RiskLimits;

  constructor(config: PaperOmsConfig = {}) {
    this.slippageBps = Math.max(0, Number(config.slippageBps ?? 5));
    this.feeBps = Math.max(0, Number(config.feeBps ?? 8));
    this.minimumFeeEuro = Math.max(0, Number(config.minimumFeeEuro ?? 1.5));
    this.riskLimits = config.riskLimits;
  }

  submit(order: ProposedOrder, context: RiskContext, now = Date.now()): PaperExecution {
    const existing = this.executions.get(order.clientOrderId);
    if (existing) return existing;

    const risk = evaluatePreTradeRisk(order, context, this.riskLimits, now);
    const createdAt = new Date(now).toISOString();

    if (!risk.allowed) {
      const rejected: PaperExecution = {
        clientOrderId: order.clientOrderId,
        symbol: order.symbol,
        side: order.side,
        status: "RISK_REJECTED",
        requestedQuantity: order.quantity,
        filledQuantity: 0,
        referencePrice: order.referencePrice,
        fillPrice: null,
        notionalEuro: 0,
        estimatedFeeEuro: 0,
        estimatedSlippageEuro: 0,
        createdAt,
        filledAt: null,
        risk,
      };
      this.executions.set(order.clientOrderId, rejected);
      return rejected;
    }

    const direction = order.side === "BUY" ? 1 : -1;
    const fillPrice = order.referencePrice * (1 + direction * this.slippageBps / 10_000);

    if (order.orderType === "LIMIT" && order.limitPrice !== undefined) {
      const crossesLimit = order.side === "BUY" ? fillPrice <= order.limitPrice : fillPrice >= order.limitPrice;
      if (!crossesLimit) {
        const rejected: PaperExecution = {
          clientOrderId: order.clientOrderId,
          symbol: order.symbol,
          side: order.side,
          status: "RISK_REJECTED",
          requestedQuantity: order.quantity,
          filledQuantity: 0,
          referencePrice: order.referencePrice,
          fillPrice: null,
          notionalEuro: 0,
          estimatedFeeEuro: 0,
          estimatedSlippageEuro: 0,
          createdAt,
          filledAt: null,
          risk: {
            ...risk,
            allowed: false,
            reasons: [...risk.reasons, "limit-not-crossed: simulated fill price does not satisfy the limit price."],
            checks: [...risk.checks, {
              code: "limit-not-crossed",
              passed: false,
              message: "Simulated fill price does not satisfy the limit price.",
              observed: Number(fillPrice.toFixed(6)),
              limit: order.limitPrice,
            }],
          },
        };
        this.executions.set(order.clientOrderId, rejected);
        return rejected;
      }
    }

    const grossEuro = order.quantity * fillPrice * context.fxToEuro;
    const referenceGrossEuro = order.quantity * order.referencePrice * context.fxToEuro;
    const estimatedSlippageEuro = Math.abs(grossEuro - referenceGrossEuro);
    const estimatedFeeEuro = Math.max(this.minimumFeeEuro, grossEuro * this.feeBps / 10_000);

    const filled: PaperExecution = {
      clientOrderId: order.clientOrderId,
      symbol: order.symbol,
      side: order.side,
      status: "PAPER_FILLED",
      requestedQuantity: order.quantity,
      filledQuantity: order.quantity,
      referencePrice: order.referencePrice,
      fillPrice: Number(fillPrice.toFixed(6)),
      notionalEuro: Number(grossEuro.toFixed(2)),
      estimatedFeeEuro: Number(estimatedFeeEuro.toFixed(2)),
      estimatedSlippageEuro: Number(estimatedSlippageEuro.toFixed(2)),
      createdAt,
      filledAt: createdAt,
      risk,
    };
    this.executions.set(order.clientOrderId, filled);
    return filled;
  }

  get(clientOrderId: string): PaperExecution | null {
    return this.executions.get(clientOrderId) ?? null;
  }

  list(): PaperExecution[] {
    return [...this.executions.values()];
  }
}
