import assert from "node:assert/strict";
import { createLongBracketOco, createOcoState } from "../lib/trading/conditional-orders.ts";
import {
  applyPaperConditionalMarketObservation,
  normalizePaperConditionalBook,
  registerPaperConditionalOrder,
  registerPaperOco,
} from "../lib/trading/paper-conditional-book.ts";

const observedAt = "2026-09-21T15:00:00.000Z";
let book = normalizePaperConditionalBook(null);
book = registerPaperConditionalOrder(book, {
  clientOrderId: "trail-1",
  symbol: "TEST",
  side: "SELL",
  kind: "TRAILING_STOP",
  quantity: 2,
  trailPercent: 5,
}, 100);

let result = applyPaperConditionalMarketObservation(book, "TEST", 110, observedAt);
assert.equal(result.activations.length, 0);
assert.equal(result.book.singles[0].anchorPrice, 110);

result = applyPaperConditionalMarketObservation(result.book, "TEST", 104, "2026-09-21T15:01:00.000Z");
assert.equal(result.activations.length, 1);
assert.equal(result.activations[0].orderType, "MARKET");
assert.equal(result.activations[0].side, "SELL");
assert.equal(result.book.singles[0].status, "TRIGGERED");

const repeated = applyPaperConditionalMarketObservation(result.book, "TEST", 103, "2026-09-21T15:02:00.000Z");
assert.equal(repeated.activations.length, 0, "Triggered conditional order must not activate twice");

let ocoBook = normalizePaperConditionalBook(null);
ocoBook = registerPaperOco(ocoBook, createOcoState(
  "oco-1",
  { clientOrderId: "take", symbol: "XYZ", side: "SELL", kind: "LIMIT", quantity: 1, limitPrice: 120 },
  { clientOrderId: "stop", symbol: "XYZ", side: "SELL", kind: "STOP", quantity: 1, stopPrice: 90 },
  100,
));
const takeProfit = applyPaperConditionalMarketObservation(ocoBook, "XYZ", 121, observedAt);
assert.equal(takeProfit.activations.length, 1);
assert.equal(takeProfit.activations[0].clientOrderId, "take");
assert.equal(takeProfit.activations[0].parentGroupId, "oco-1");
assert.equal(takeProfit.book.ocoGroups[0].second.status, "CANCELLED");

const bracket = createLongBracketOco({
  groupId: "bracket-1",
  symbol: "ABC",
  quantity: 3,
  takeProfitPrice: 130,
  stopLossPrice: 90,
  initialMarketPrice: 100,
});
let bracketBook = registerPaperOco(normalizePaperConditionalBook(null), bracket);
const stopped = applyPaperConditionalMarketObservation(bracketBook, "ABC", 89, observedAt);
assert.equal(stopped.activations.length, 1);
assert.equal(stopped.activations[0].clientOrderId, "bracket-1:stop-loss");
assert.equal(stopped.book.ocoGroups[0].first.status, "CANCELLED");

const ambiguous = createOcoState(
  "ambiguous",
  { clientOrderId: "a", symbol: "AMB", side: "BUY", kind: "STOP", quantity: 1, stopPrice: 100 },
  { clientOrderId: "b", symbol: "AMB", side: "SELL", kind: "STOP", quantity: 1, stopPrice: 100 },
  100,
);
const ambiguousResult = applyPaperConditionalMarketObservation(
  registerPaperOco(normalizePaperConditionalBook(null), ambiguous),
  "AMB",
  100,
  observedAt,
);
assert.equal(ambiguousResult.blocked, true);
assert.equal(ambiguousResult.activations.length, 0);
assert.equal(ambiguousResult.book.ocoGroups[0].status, "AMBIGUOUS");

console.log("Fenice paper conditional book tests: PASS");
