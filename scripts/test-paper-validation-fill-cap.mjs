import assert from "node:assert/strict";
import { reservePaperValidationFillCap } from "./paper-validation-fill-cap.mjs";

const cap = 100;
const medianPrice = 768.285;
const fxToEuro = 2;
const originalQuantity = Math.floor((cap / (medianPrice * fxToEuro)) * 1_000_000) / 1_000_000;
const clientOrderId = "fenice-paper-validation-2026-09-23-SPY";
const order = {
  clientOrderId,
  symbol: "SPY",
  side: "BUY",
  quantity: originalQuantity,
  fxToEuro,
  validationProbe: true,
  validationRationale: {
    medianPrice,
    maxNotionalEuro: cap,
  },
};
const result = {
  staged: true,
  reason: "eligible-paper-validation-probe-staged",
  order,
  queue: { version: 1, mode: "PAPER", orders: [order] },
};

const tightened = reservePaperValidationFillCap(result, { maxNotionalEuroPerOrder: cap });
assert.equal(tightened.staged, true);
assert(tightened.order.quantity <= originalQuantity, "cap hardening may only reduce quantity");
assert.equal(tightened.order.validationRationale.simulatedBuySlippageReserveBps, 5);
assert(tightened.order.validationRationale.referenceNotionalEuro < cap);
assert(tightened.order.validationRationale.maxSimulatedFillNotionalEuro <= cap);
assert.equal(tightened.queue.orders[0].quantity, tightened.order.quantity);

const simulatedFill = tightened.order.quantity * medianPrice * fxToEuro * 1.0005;
assert(simulatedFill <= cap + 1e-8, `simulated fill ${simulatedFill} must remain inside ${cap}`);

const invalid = reservePaperValidationFillCap({
  ...result,
  order: { ...order, side: "SELL" },
  queue: { ...result.queue, orders: [{ ...order, side: "SELL" }] },
}, { maxNotionalEuroPerOrder: cap });
assert.equal(invalid.staged, false, "unexpected probe side must fail closed");
assert.equal(invalid.reason, "probe-fill-cap-input-invalid");

console.log("paper validation fill-cap tests: PASS");
