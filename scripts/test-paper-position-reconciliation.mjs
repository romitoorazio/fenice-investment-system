import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconcilePaperPositions as reconcile } from "../lib/ui/paper-position-reconciliation.ts";

const paper = JSON.parse(readFileSync(new URL("../data/paper-oms-state.json", import.meta.url), "utf8"));
// The canonical PAPER ledger grows during certification; assertions must follow the
// observed signed-in repository snapshot, not a stale hard-coded six-fill cutoff.
const now = Date.now();
const checked = reconcile(paper, now);
const recordedFills = paper.executions.filter(fill => fill.status === "PAPER_FILLED");
const roundEuro = n => Math.round((n + Number.EPSILON) * 100) / 100;
const recordedSymbols = [...new Set(recordedFills.map(fill => fill.symbol))].sort();
assert.equal(checked.status, "RECONCILED", checked.reason);
assert.equal(checked.positionCount, recordedSymbols.length);
assert.equal(checked.reconciledPositionCount, recordedSymbols.length);
assert.ok(recordedFills.length >= 6, "V6 historical fill evidence must not regress");
assert.equal(checked.filledBuyLots, recordedFills.length);
assert.equal(checked.closedTradeCount, 0);
assert.equal(checked.entryNotionalEuro, roundEuro(recordedFills.reduce((sum, fill) => sum + fill.notionalEuro, 0)));
assert.equal(checked.estimatedEntryCostsEuro, roundEuro(recordedFills.reduce((sum, fill) =>
  sum + fill.estimatedFeeEuro + fill.estimatedSlippageEuro, 0)));
assert.deepEqual(checked.rows.map(row => row.symbol), recordedSymbols);
for (const row of checked.rows) {
  const lots = recordedFills.filter(fill => fill.symbol === row.symbol);
  const stored = paper.positions.find(position => position.symbol === row.symbol);
  assert.ok(stored, "every reconciled row must correspond to a stored position");
  assert.equal(row.buyLots, lots.length);
  assert.equal(row.entryNotionalEuro, roundEuro(lots.reduce((sum, fill) => sum + fill.notionalEuro, 0)));
  assert.equal(row.estimatedEntryCostsEuro, roundEuro(lots.reduce((sum, fill) =>
    sum + fill.estimatedFeeEuro + fill.estimatedSlippageEuro, 0)));
  assert.ok(Math.abs(row.quantity - stored.quantity) <= 1e-6);
}
assert.equal(checked.markedValueEuro, null);
assert.equal(checked.unrealizedProfitEuro, null);
assert.equal(checked.realizedProfitEuro, null);
assert.equal(checked.netProfitEuro, null);
assert.equal(checked.benchmarkReturnPercent, null);
assert.equal(checked.liveBrokerVerified, false);

const change = fn => { const copy = structuredClone(paper); fn(copy); return reconcile(copy, now); };
const fail = (fn, msg) => {
  const result = change(fn);
  assert.notEqual(result.status, "RECONCILED", msg);
  assert.equal(result.netProfitEuro, null, "never invent net P&L on inconsistent entries");
  assert.equal(result.rows.length, 0, "do not display partial trusted ledger on mismatch");
};
fail(x => { x.mode = "LIVE"; }, "never reconcile LIVE");
fail(x => { x.brokerConnectivityAllowed = true; }, "never access broker");
fail(x => { x.liveTradingAllowed = true; }, "never accept LIVE");
fail(x => { x.generatedAt = new Date(now + 24 * 3600_000).toISOString(); }, "future snapshot");
fail(x => { x.reconciliation.balanced = false; }, "OMS reconciliation must be confirmed");
fail(x => { x.reconciliation.breaks.push("UNKNOWN_BREAK"); }, "OMS breaks must be empty");
fail(x => { x.executions[1].clientOrderId = x.executions[0].clientOrderId; }, "duplicate order");
fail(x => { x.executions[0].notionalEuro = 350; }, "notional math must match FX");
fail(x => { x.executions[0].fxToEuro = 0.5; }, "wrong fill FX");
fail(x => { x.executions[0].fxObservedAt = "2026-09-25T19:23:00.000Z"; }, "future FX");
fail(x => { x.executions[0].fxObservedAt = "2026-09-23T17:23:00.000Z"; }, "stale fill FX");
fail(x => { x.executions[0].fillPrice = Number.NaN; }, "nonfinite price");
fail(x => { x.executions[0].filledQuantity = -1; }, "negative filled quantity");
fail(x => { x.executions[0].filledAt = new Date(now + 24 * 3600_000).toISOString(); }, "future fill");
fail(x => { x.executions[0].estimatedFeeEuro = -1; }, "negative fee");
fail(x => { x.executions[0].estimatedSlippageEuro = Number.NaN; }, "invalid slippage");
fail(x => { x.executions[0].currency = "EUR"; }, "inconsistent currency");
fail(x => { x.positions[0].quantity += 0.001; }, "position quantity divergence");
fail(x => { x.positions[0].averagePrice += 0.01; }, "average price divergence");
fail(x => { x.positions[0].currency = "EUR"; }, "position currency mismatch");
fail(x => { x.positions.push(structuredClone(x.positions[0])); }, "duplicate position");
fail(x => { x.positions = []; }, "missing positions");
fail(x => { x.executions[0].side = "SELL"; }, "unsupported close-out must not fake realised PnL");
const incomplete = change(x => { x.executions = []; });
assert.notEqual(incomplete.status, "RECONCILED");
assert.equal(incomplete.entryNotionalEuro, null);
const ignored = change(x => { x.executions.push({ clientOrderId: "not-filled", status: "PAPER_REJECTED", symbol: "SPY" }); });
assert.equal(ignored.status, "RECONCILED", "rejected orders do not enter cost basis");
console.log("Fenice PAPER entry lot, FX and OMS position reconciliation: PASS");
