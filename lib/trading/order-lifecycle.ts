export type OrderLifecycleStatus =
  | "CREATED"
  | "RISK_REJECTED"
  | "ACCEPTED"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCEL_PENDING"
  | "CANCELLED"
  | "REPLACE_PENDING"
  | "REPLACED";

export type OrderLifecycleEventType =
  | "RISK_ACCEPT"
  | "RISK_REJECT"
  | "PARTIAL_FILL"
  | "FILL"
  | "REQUEST_CANCEL"
  | "CONFIRM_CANCEL"
  | "REQUEST_REPLACE"
  | "CONFIRM_REPLACE";

export type OrderLifecycleState = {
  clientOrderId: string;
  status: OrderLifecycleStatus;
  requestedQuantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  averageFillPrice: number | null;
  replaceCount: number;
  terminal: boolean;
};

export type OrderLifecycleEvent = {
  type: OrderLifecycleEventType;
  fillQuantity?: number;
  fillPrice?: number;
};

function fail(message: string): never {
  throw new Error(`INVALID_ORDER_TRANSITION: ${message}`);
}

export function createOrderLifecycle(clientOrderId: string, requestedQuantity: number): OrderLifecycleState {
  if (!clientOrderId || !Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
    return fail("valid clientOrderId and positive requestedQuantity are required");
  }
  return {
    clientOrderId,
    status: "CREATED",
    requestedQuantity,
    filledQuantity: 0,
    remainingQuantity: requestedQuantity,
    averageFillPrice: null,
    replaceCount: 0,
    terminal: false,
  };
}

export function applyOrderLifecycleEvent(
  state: OrderLifecycleState,
  event: OrderLifecycleEvent,
): OrderLifecycleState {
  if (state.terminal) return fail(`order ${state.clientOrderId} is terminal (${state.status})`);

  switch (event.type) {
    case "RISK_ACCEPT":
      if (state.status !== "CREATED") return fail(`RISK_ACCEPT from ${state.status}`);
      return { ...state, status: "ACCEPTED" };

    case "RISK_REJECT":
      if (state.status !== "CREATED") return fail(`RISK_REJECT from ${state.status}`);
      return { ...state, status: "RISK_REJECTED", terminal: true };

    case "PARTIAL_FILL":
    case "FILL": {
      if (!["ACCEPTED", "PARTIALLY_FILLED", "REPLACED"].includes(state.status)) {
        return fail(`${event.type} from ${state.status}`);
      }
      const quantity = Number(event.fillQuantity);
      const price = Number(event.fillPrice);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > state.remainingQuantity + 1e-8) {
        return fail("fill quantity must be positive and not exceed remaining quantity");
      }
      if (!Number.isFinite(price) || price <= 0) return fail("fill price must be positive");
      const newFilled = state.filledQuantity + quantity;
      const newRemaining = Math.max(0, state.requestedQuantity - newFilled);
      const previousNotional = (state.averageFillPrice ?? 0) * state.filledQuantity;
      const averageFillPrice = (previousNotional + price * quantity) / newFilled;
      const completed = newRemaining <= 1e-8;
      if (event.type === "FILL" && !completed) return fail("FILL event must complete the order; use PARTIAL_FILL otherwise");
      return {
        ...state,
        status: completed ? "FILLED" : "PARTIALLY_FILLED",
        filledQuantity: Number(newFilled.toFixed(8)),
        remainingQuantity: Number(newRemaining.toFixed(8)),
        averageFillPrice: Number(averageFillPrice.toFixed(8)),
        terminal: completed,
      };
    }

    case "REQUEST_CANCEL":
      if (!["ACCEPTED", "PARTIALLY_FILLED", "REPLACED"].includes(state.status)) {
        return fail(`REQUEST_CANCEL from ${state.status}`);
      }
      return { ...state, status: "CANCEL_PENDING" };

    case "CONFIRM_CANCEL":
      if (state.status !== "CANCEL_PENDING") return fail(`CONFIRM_CANCEL from ${state.status}`);
      return { ...state, status: "CANCELLED", terminal: true };

    case "REQUEST_REPLACE":
      if (!["ACCEPTED", "PARTIALLY_FILLED", "REPLACED"].includes(state.status)) {
        return fail(`REQUEST_REPLACE from ${state.status}`);
      }
      return { ...state, status: "REPLACE_PENDING" };

    case "CONFIRM_REPLACE":
      if (state.status !== "REPLACE_PENDING") return fail(`CONFIRM_REPLACE from ${state.status}`);
      return { ...state, status: "REPLACED", replaceCount: state.replaceCount + 1 };

    default:
      return fail("unknown event");
  }
}
