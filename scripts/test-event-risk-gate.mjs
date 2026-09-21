import assert from "node:assert/strict";
import { evaluateEventRisk } from "../lib/trading/event-risk-gate.ts";

const now = Date.parse("2026-09-21T18:00:00.000Z");

const none = evaluateEventRisk([], { symbol: "TEST", currency: "USD", now });
assert.equal(none.state, "NORMAL");
assert.equal(none.allowNewRisk, true);
assert.equal(none.riskMultiplier, 1);

const high = evaluateEventRisk([
  {
    id: "fed",
    label: "Federal Reserve decision",
    scheduledAt: "2026-09-21T18:20:00.000Z",
    severity: "HIGH",
    currencies: ["USD"],
  },
], { symbol: "TEST", currency: "USD", now });
assert.equal(high.state, "CAUTION");
assert.equal(high.allowNewRisk, true);
assert.equal(high.riskMultiplier, 0.5);

const critical = evaluateEventRisk([
  {
    id: "halt-risk",
    label: "Critical market event",
    scheduledAt: "2026-09-21T18:10:00.000Z",
    severity: "CRITICAL",
    symbols: ["TEST"],
  },
], { symbol: "TEST", currency: "EUR", now });
assert.equal(critical.state, "BLOCKED");
assert.equal(critical.allowNewRisk, false);
assert.equal(critical.riskMultiplier, 0);

const unrelated = evaluateEventRisk([
  {
    id: "eur-event",
    label: "Euro event",
    scheduledAt: "2026-09-21T18:05:00.000Z",
    severity: "CRITICAL",
    currencies: ["EUR"],
  },
], { symbol: "TEST", currency: "USD", now });
assert.equal(unrelated.state, "NORMAL");

const invalidCritical = evaluateEventRisk([
  {
    id: "bad-critical",
    label: "Invalid critical schedule",
    scheduledAt: "invalid-date",
    severity: "CRITICAL",
  },
], { symbol: "TEST", now });
assert.equal(invalidCritical.state, "BLOCKED");
assert.equal(invalidCritical.allowNewRisk, false);

console.log("Fenice event-risk gate tests: PASS");
