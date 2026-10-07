import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { appendAuditEvent } from "../lib/trading/audit-chain.ts";
import { buildTradingStatusEvidence } from "../lib/ui/trading-status-evidence.ts";

const now = Date.parse("2026-10-07T15:00:00.000Z");
const timestamp = new Date(now - 30_000).toISOString();
const execution = { clientOrderId: "paper-test-1", symbol: "SPY", side: "BUY", status: "PAPER_FILLED", filledQuantity: 2 };
const fixture = {
  state: {
    version: 1, mode: "PAPER", generatedAt: timestamp, operational: true,
    liveTradingAllowed: false, brokerConnectivityAllowed: false,
    killSwitch: { engaged: false, manualEngaged: false, reasons: [] },
    openOrders: [], executions: [execution],
    positions: [{ symbol: "SPY", currency: "USD", quantity: 2, averagePrice: 100 }],
    reconciliation: { balanced: true, breaks: [] },
    auditChain: appendAuditEvent([], {
      timestamp, entityId: execution.clientOrderId, eventType: execution.status,
      payload: { symbol: execution.symbol, side: execution.side, filledQuantity: execution.filledQuantity },
    }),
  },
  sources: {
    generatedAt: timestamp, critical: { total: 1, ready: 1, gate: "GREEN" },
    sources: [{ critical: true, stale: false, status: "healthy" }],
  },
  intelligence: {
    generatedAt: timestamp, intelligenceConfidence: 92,
    coverage: { sourceConcentrationPercent: 45, marketSources: 3, assetClasses: ["ETF", "crypto", "bonds"] },
    crossSourceValidation: { checked: 19, divergent: 0 },
    policy: { unknownTimestampEvidenceExcluded: true, validationEvidenceFreshnessHours: { crypto: 4, traditional: 96 } },
  },
};
const report = (input = fixture) => buildTradingStatusEvidence({ ...input, now });
const mutated = (change) => { const copy = structuredClone(fixture); change(copy); return report(copy); };
const assertBlocked = (actual) => {
  assert.equal(actual.operational, false);
  assert.equal(actual.killSwitch.engaged, true);
  assert(actual.killSwitch.reasons.length > 0);
  assert.equal(actual.liveTradingAllowed, false);
  assert.equal(actual.brokerNetworkAllowed, false);
};

const healthy = report();
assert.equal(healthy.operational, true);
assert.equal(healthy.paperState.verified, true);
assert.equal(healthy.paperState.auditChainValid, true);
assert.equal(healthy.paperState.reconciliationBalanced, true);
assert.equal(healthy.paperState.paperFillCount, 1);
assert.equal(healthy.paperState.ageMinutes, 0.5);
assert.equal(healthy.dataQuality.generatedAt, timestamp);
assert.equal(healthy.dataQuality.decisionDataReady, true);
assert.equal(healthy.killSwitch.engaged, false);
assert.equal(healthy.readOnlyDiagnostic, true);
assert.equal(healthy.paperState.dailyLossPercent, null, "an unrecorded loss measurement must not be advertised as measured zero");

assertBlocked(mutated(input => { input.state.killSwitch.manualEngaged = true; }));
assertBlocked(mutated(input => { input.state.killSwitch.engaged = true; }));
assertBlocked(mutated(input => { input.state.consecutiveExecutionErrors = 3; }));
assertBlocked(mutated(input => { input.state.dailyLossPercent = -4; }));
assertBlocked(mutated(input => { input.state.operational = false; }));
assert.equal(mutated(input => { input.state.consecutiveExecutionErrors = 2; }).operational, true);

const forgedPositions = mutated(input => { input.state.positions[0].quantity = 3; });
assertBlocked(forgedPositions);
assert.equal(forgedPositions.paperState.reconciliationBreaks, 1, "recompute differences instead of trusting a persisted balanced=true flag");
assertBlocked(mutated(input => { input.state.reconciliation.balanced = false; }));
assertBlocked(mutated(input => { input.state.reconciliation.breaks = [{ symbol: "SPY" }]; }));
assertBlocked(mutated(input => { delete input.state.reconciliation; }));

const tamperedJournal = mutated(input => { input.state.auditChain[0].payload.filledQuantity = 99; });
assertBlocked(tamperedJournal);
assert.equal(tamperedJournal.paperState.auditChainValid, false);
assertBlocked(mutated(input => { input.state.auditChain = []; }));
assertBlocked(mutated(input => { input.state.auditChain = [null]; }));
assertBlocked(mutated(input => { input.state.executions.push(structuredClone(execution)); }));
assertBlocked(mutated(input => { input.state.positions.push(structuredClone(input.state.positions[0])); }));

for (const invalidState of [null, [], {}, "missing"]) assertBlocked(report({ ...fixture, state: invalidState }));
for (const field of ["liveTradingAllowed", "brokerConnectivityAllowed"]) {
  assertBlocked(mutated(input => { input.state[field] = true; }));
  assertBlocked(mutated(input => { delete input.state[field]; }));
}
for (const field of ["executions", "positions", "openOrders", "auditChain"]) assertBlocked(mutated(input => { delete input.state[field]; }));
for (const field of ["consecutiveExecutionErrors", "dailyLossPercent"]) {
  for (const invalidValue of [null, "0", NaN, Infinity]) assertBlocked(mutated(input => { input.state[field] = invalidValue; }));
}
assertBlocked(mutated(input => { input.state.consecutiveExecutionErrors = -1; }));
assertBlocked(mutated(input => { input.state.positions[0].quantity = NaN; }));
assertBlocked(mutated(input => { input.state.executions[0].filledQuantity = Infinity; }));
assertBlocked(mutated(input => { input.state.executions[0].side = "UNKNOWN"; }));

for (const field of ["sources", "intelligence"]) {
  for (const invalidTime of [null, "invalid", new Date(now + 60_000).toISOString(), new Date(now - 25 * 3_600_000).toISOString()]) {
    const actual = mutated(input => { input[field].generatedAt = invalidTime; });
    assertBlocked(actual);
    assert.equal(actual.dataQuality.decisionDataReady, false);
  }
  assertBlocked(report({ ...fixture, [field]: null }));
}
assertBlocked(mutated(input => { input.sources.sources = []; }));
assertBlocked(mutated(input => { input.sources.critical.ready = 0; }));
assertBlocked(mutated(input => { input.sources.sources[0].stale = true; }));
assertBlocked(mutated(input => { input.sources.sources[0].status = "failed"; }));
for (const invalidConfidence of [NaN, Infinity, "92", 101, -1]) {
  assertBlocked(mutated(input => { input.intelligence.intelligenceConfidence = invalidConfidence; }));
}
assertBlocked(mutated(input => { input.intelligence.intelligenceConfidence = 89; }));
assertBlocked(mutated(input => { input.state.generatedAt = new Date(now + 60_000).toISOString(); }));

// Historical state may still reconcile, while stricter per-fill decision freshness is independently false.
const oldDecisionData = mutated(input => { input.sources.generatedAt = new Date(now - 11 * 60_000).toISOString(); });
assert.equal(oldDecisionData.paperState.verified, true);
assert.equal(oldDecisionData.dataQuality.decisionDataReady, false);
assert(oldDecisionData.dataQuality.decisionDataReasons.length > 0);

const privateInput = structuredClone(fixture);
privateInput.state.accountCode = "private-account-marker";
privateInput.state.killSwitch.reasons = ["private-credential-marker"];
privateInput.sources.token = "private-token-marker";
assert(!JSON.stringify(report(privateInput)).includes("private-"), "publish only the explicit diagnostic fields, never raw state or private text");
const before = JSON.stringify(fixture);
report();
assert.equal(JSON.stringify(fixture), before, "status reads must never mutate PAPER evidence");
assert.throws(() => buildTradingStatusEvidence({ ...fixture, now: NaN }), /clock/);

const route = await readFile(new URL("../app/api/trading/status/route.ts", import.meta.url), "utf8");
assert(route.includes('readJson<unknown>("paper-oms-state.json")'));
assert(route.includes("buildTradingStatusEvidence({ state, sources, intelligence })"));
assert(route.includes('"Cache-Control": "no-store"'));
assert(!route.includes("operational: true"), "the endpoint must not advertise a fixed healthy state");
assert(!route.includes("manualEngaged: false"), "the endpoint must not override a real kill switch");

console.log("Fenice PAPER runtime status evidence regressions: PASS");
