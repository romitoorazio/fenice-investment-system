import {
  applyConditionalMarketPrice,
  applyOcoMarketPrice,
  createConditionalOrderState,
  type ConditionalActivation,
  type ConditionalOrder,
  type ConditionalOrderState,
  type OcoState,
} from "./conditional-orders.ts";

export type PaperConditionalBook = {
  singles: ConditionalOrderState[];
  ocoGroups: OcoState[];
};

export type PaperConditionalActivation = ConditionalActivation & {
  clientOrderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  parentGroupId?: string;
  observedAt: string;
};

export type PaperConditionalBookResult = {
  book: PaperConditionalBook;
  activations: PaperConditionalActivation[];
  blocked: boolean;
  reasons: string[];
};

export function normalizePaperConditionalBook(value: Partial<PaperConditionalBook> | null | undefined): PaperConditionalBook {
  return {
    singles: Array.isArray(value?.singles) ? structuredClone(value.singles) : [],
    ocoGroups: Array.isArray(value?.ocoGroups) ? structuredClone(value.ocoGroups) : [],
  };
}

export function registerPaperConditionalOrder(
  book: PaperConditionalBook,
  order: ConditionalOrder,
  initialMarketPrice?: number,
): PaperConditionalBook {
  const normalized = normalizePaperConditionalBook(book);
  const exists = normalized.singles.some((item) => item.order.clientOrderId === order.clientOrderId)
    || normalized.ocoGroups.some((group) => [group.first.order.clientOrderId, group.second.order.clientOrderId].includes(order.clientOrderId));
  if (exists) return normalized;
  normalized.singles.push(createConditionalOrderState(order, initialMarketPrice));
  return normalized;
}

export function registerPaperOco(book: PaperConditionalBook, group: OcoState): PaperConditionalBook {
  const normalized = normalizePaperConditionalBook(book);
  if (normalized.ocoGroups.some((item) => item.groupId === group.groupId)) return normalized;
  const childIds = new Set([group.first.order.clientOrderId, group.second.order.clientOrderId]);
  const duplicateChild = normalized.singles.some((item) => childIds.has(item.order.clientOrderId))
    || normalized.ocoGroups.some((item) => childIds.has(item.first.order.clientOrderId) || childIds.has(item.second.order.clientOrderId));
  if (duplicateChild) throw new Error("DUPLICATE_CONDITIONAL_ORDER_ID");
  normalized.ocoGroups.push(structuredClone(group));
  return normalized;
}

function activationFromState(state: ConditionalOrderState, observedAt: string, parentGroupId?: string): PaperConditionalActivation | null {
  if (state.status !== "TRIGGERED" || !state.activation) return null;
  return {
    clientOrderId: state.order.clientOrderId,
    symbol: state.order.symbol,
    side: state.order.side,
    quantity: state.order.quantity,
    orderType: state.activation.orderType,
    referencePrice: state.activation.referencePrice,
    ...(state.activation.limitPrice === undefined ? {} : { limitPrice: state.activation.limitPrice }),
    ...(parentGroupId ? { parentGroupId } : {}),
    observedAt,
  };
}

export function applyPaperConditionalMarketObservation(
  book: PaperConditionalBook,
  symbol: string,
  marketPrice: number,
  observedAt: string,
): PaperConditionalBookResult {
  const normalized = normalizePaperConditionalBook(book);
  const target = String(symbol || "").trim().toUpperCase();
  const activations: PaperConditionalActivation[] = [];
  const reasons: string[] = [];
  let blocked = false;

  normalized.singles = normalized.singles.map((state) => {
    if (state.status !== "WORKING" || state.order.symbol.trim().toUpperCase() !== target) return state;
    const next = applyConditionalMarketPrice(state, marketPrice, observedAt);
    if (state.status === "WORKING" && next.status === "TRIGGERED") {
      const activation = activationFromState(next, observedAt);
      if (activation) activations.push(activation);
    }
    return next;
  });

  normalized.ocoGroups = normalized.ocoGroups.map((group) => {
    if (group.status !== "WORKING") return group;
    const groupSymbol = group.first.order.symbol.trim().toUpperCase();
    if (groupSymbol !== target) return group;
    const next = applyOcoMarketPrice(group, marketPrice, observedAt);
    if (next.status === "AMBIGUOUS") {
      blocked = true;
      reasons.push(next.reason || `OCO ${next.groupId} entered ambiguous state`);
      return next;
    }
    if (group.status === "WORKING" && next.status === "TRIGGERED" && next.triggeredOrderId) {
      const triggered = next.first.order.clientOrderId === next.triggeredOrderId ? next.first : next.second;
      const activation = activationFromState(triggered, observedAt, next.groupId);
      if (activation) activations.push(activation);
    }
    return next;
  });

  return { book: normalized, activations, blocked, reasons };
}
