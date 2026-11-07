import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateFxTimestamp } from "../lib/trading/paper-fx-timestamp.mjs";

const [quotePath, fxPath, mode] = process.argv.slice(2);
assert.ok(!mode || mode === "--require-paper-quote", "unsupported verification mode");
assert.ok(quotePath && fxPath, "provide quote and FX evidence paths");
const quote = JSON.parse(readFileSync(quotePath, "utf8"));
const fx = JSON.parse(readFileSync(fxPath, "utf8"));
assert.equal(quote.policy?.liveTradingAllowed, false, "quotes must forbid LIVE");
assert.equal(fx.liveTradingAllowed, false, "FX must forbid LIVE");
assert.equal(fx.brokerConnectivityAllowed, false, "FX must forbid broker connectivity");
assert.equal(fx.baseCurrency, "EUR");
assert.equal(fx.provider, "twelve-data");
assert.equal(fx.provenanceVerified, true);
assert.ok(Array.isArray(quote.observations), "quote observations must be an array");
assert.ok(Number.isFinite(Date.parse(quote.generatedAt)), "quote generation timestamp required");
assert.ok(Number.isFinite(Date.parse(fx.generatedAt)), "FX generation timestamp required");
assert.equal(fx.ratesToEuro?.EUR?.rate, 1, "EUR identity required");
const usd = fx.ratesToEuro?.USD;
assert.ok(Number.isFinite(usd?.rate) && usd.rate > 0, "USD/EUR must be positive");
assert.match(String(usd.source), /Twelve Data/, "FX source provenance required");
const fxSeconds = Date.parse(usd.observedAt) / 1000;
assert.equal(validateFxTimestamp(fxSeconds, Date.now(), 120).valid, true, "FX must be recent and not future-dated");
const count = quote.observations.filter(item => item.sourceFamily === "twelve-data").length;
const paperCount = quote.observations.filter(item => item.sourceFamily === "twelve-data" && item.eligibility === "PAPER" && item.provenanceVerified === true && Number.isFinite(item.price) && item.price > 0 && Number.isFinite(Date.parse(item.observedAt)) && validateFxTimestamp(Date.parse(item.observedAt) / 1000, Date.now(), 120).valid === true).length;
if (mode === "--require-paper-quote") {
  assert.ok(paperCount > 0, "NO_FRESH_PROVIDER_VERIFIED_PAPER_QUOTE: structure alone is not operational proof");
}
console.log(`Enhanced PAPER evidence structure PASS; fresh verified PAPER quotes=${paperCount}; Twelve Data observations=${count}; independent fill certification NOT inferred`);
