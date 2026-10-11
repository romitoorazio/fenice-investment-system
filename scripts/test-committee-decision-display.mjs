import assert from "node:assert/strict";
import { decisionGroup } from "../lib/ui/committee-decision-display.ts";

const buy = {
  symbol: "ASML",
  decision: "COMPRA",
  entryPlan: { orderMode: "LIMITE", firstTrancheEuro: 150 },
};
const group = (row, fresh = true, gate = "PRONTO_CON_CONFERMA", count = 1) =>
  decisionGroup(row, fresh, gate, count);

assert.equal(group(undefined), "ATTENDI", "missing committee decision must not inherit technical ACCUMULA");
assert.equal(group(buy, false), "ATTENDI", "stale committee data must fail closed");
assert.equal(group({ symbol: "ASML", decision: "UNKNOWN" }), "ATTENDI", "unknown decision must fail closed");
assert.equal(group({ symbol: "ASML", decision: "ATTENDI" }), "ATTENDI");
assert.equal(group({ symbol: "ASML", decision: "OSSERVA" }), "OSSERVA");
assert.equal(group({ symbol: "NVDA", decision: "MANTIENI" }), "OSSERVA", "hold is not verified without positions");
assert.equal(group({ symbol: "ASML", decision: "EVITA" }), "EVITA", "avoid is a research opinion, not a sell");
assert.equal(group(buy, true, "ATTENDERE", 1), "OSSERVA", "blocked committee gate must not show BUY candidate");
assert.equal(group(buy, true, "BLOCCATO", 1), "OSSERVA");
assert.equal(group(buy, true, "PRONTO_CON_CONFERMA", 0), "OSSERVA", "candidate count and row must agree");
assert.equal(group({ ...buy, entryPlan: { orderMode: "NESSUN ORDINE", firstTrancheEuro: 150 } }), "OSSERVA");
assert.equal(group({ ...buy, entryPlan: { orderMode: "LIMITE", firstTrancheEuro: -1 } }), "OSSERVA");
assert.equal(group({ ...buy, entryPlan: { orderMode: "LIMITE", firstTrancheEuro: Number.NaN } }), "OSSERVA");
assert.equal(group(buy), "CANDIDATO", "even a fully checked committee candidate is research-only");

console.log("Fenice committee decision display safety: PASS (14 cases)");
