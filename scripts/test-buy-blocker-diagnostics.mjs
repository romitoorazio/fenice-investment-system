import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { explainBuyConstraints } from "../lib/intelligence/buy-blocker-diagnostics.mjs";

const candidate = {
  symbol: "ASML", decision: "OSSERVA", committeeScore: 71, confidence: 88,
  riskScore: 53, scorecard: { valuation: 50 },
  terminalDecision: "ACCUMULA", valuation: { status: "non confrontabile", upsideBasePercent: null },
};
const blocked = explainBuyConstraints(candidate, true);
assert.equal(blocked.state, "RESEARCH_ONLY");
assert.deepEqual(blocked.reasons, [
  "PUNTEGGIO: 71, soglia 78",
  "VALUTAZIONE: 50, soglia 55",
]);
assert.equal(blocked.executionEligible, false);
assert.equal(blocked.estimatedReturn, null);

const fullyBelow = explainBuyConstraints({
  ...candidate, committeeScore: 67, confidence: 62, riskScore: 65,
  scorecard: { valuation: 48 }, terminalDecision: "MANTIENI",
  valuation: { status: "disponibile", upsideBasePercent: -32 },
}, true);
assert.equal(fullyBelow.reasons.length, 6);
assert(fullyBelow.reasons.some(r => r.includes("DCF: sopravvalutazione")));
assert(fullyBelow.reasons.some(r => r.includes("Segnale tecnico diverso da ACCUMULA")));
assert.equal(fullyBelow.executionEligible, false);

for (const insufficient of [
  { ...candidate, committeeScore: null },
  { ...candidate, confidence: Number.NaN },
  { ...candidate, riskScore: undefined },
  { ...candidate, scorecard: { valuation: null } },
]) {
  const output = explainBuyConstraints(insufficient, true);
  assert(output.reasons.some(r => r.includes("dato mancante")), "missing numerical data must not become zero");
  assert.equal(output.executionEligible, false);
}
for (const missing of [undefined, null, {}, candidate]) {
  const output = explainBuyConstraints(missing, false);
  assert.equal(output.state, "UNAVAILABLE");
  assert.equal(output.executionEligible, false);
}
const strong = explainBuyConstraints({
  ...candidate, decision: "COMPRA", committeeScore: 89, confidence: 90,
  riskScore: 31, scorecard: { valuation: 70 },
}, true);
assert.deepEqual(strong.reasons, []);
assert.equal(strong.executionEligible, false, "even fully satisfied research-only signals cannot authorize orders");

const page = await readFile(new URL("../app/decisioni/page.tsx", import.meta.url), "utf8");
assert.match(page, /aria-label="Diagnostica ostacoli al COMPRA"/);
assert.match(page, /explainBuyConstraints\(row, committeeCurrent\)/);
assert.match(page, /committeeCurrent \?/);
assert.match(page, /Comitato scaduto: nessuna diagnosi su cui agire/);
assert.match(page, /Nessun ordine autorizzato/);
assert.match(page, /Non sono previsioni di rendimento/);

const real = JSON.parse(await readFile(new URL("../data/investment-committee.json", import.meta.url), "utf8"));
for (const item of real.allDecisions || []) {
  const verdict = explainBuyConstraints(item, true);
  assert.equal(verdict.executionEligible, false);
  assert.equal(verdict.estimatedReturn, null);
}
console.log("Fenice100K committee BUY barrier diagnostics research-only regression: PASS");
