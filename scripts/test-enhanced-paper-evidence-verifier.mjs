import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const dir = mkdtempSync(join(tmpdir(), "fenice-paper-evidence-"));
const quotePath = join(dir, "quotes.json");
const fxPath = join(dir, "fx.json");
const now = Date.now();
const quotes = { generatedAt: new Date(now).toISOString(), policy: { liveTradingAllowed: false }, observations: [] };
const fx = { generatedAt: new Date(now).toISOString(), baseCurrency: "EUR", provider: "twelve-data", provenanceVerified: true, liveTradingAllowed: false, brokerConnectivityAllowed: false, ratesToEuro: { EUR: { rate: 1 }, USD: { rate: 0.9, observedAt: new Date(now - 20000).toISOString(), source: "Twelve Data /exchange_rate USD/EUR" } } };
function verify(expectedSuccess, label, mode = null) {
  writeFileSync(quotePath, JSON.stringify(quotes));
  writeFileSync(fxPath, JSON.stringify(fx));
  const result = spawnSync(process.execPath, ["scripts/verify-enhanced-paper-evidence.mjs", quotePath, fxPath, ...(mode ? [mode] : [])], { encoding: "utf8" });
  assert.equal(result.status === 0, expectedSuccess, label + ": " + result.stderr);
}
try {
  verify(true, "fresh FX and PAPER-only flags");
  fx.ratesToEuro.USD.observedAt = new Date(now - 240000).toISOString();
  verify(false, "stale FX must fail");
  fx.ratesToEuro.USD.observedAt = new Date(now + 60000).toISOString();
  verify(false, "future FX must fail");
  fx.ratesToEuro.USD.observedAt = new Date(now - 20000).toISOString();
  fx.liveTradingAllowed = true;
  verify(false, "LIVE enabled must fail");
  fx.liveTradingAllowed = false;
  fx.brokerConnectivityAllowed = true;
  verify(false, "broker connectivity enabled must fail");
  fx.brokerConnectivityAllowed = false;
  fx.ratesToEuro.USD.rate = -1;
  verify(false, "invalid FX rate must fail");
  fx.ratesToEuro.USD.rate = 0.9;
  verify(false, "empty PAPER observations must fail operational mode", "--require-paper-quote");
  quotes.observations = [{ sourceFamily: "twelve-data", eligibility: "VALIDATION_ONLY", provenanceVerified: true, provenanceMethod: "provider-batch-quote-last_quote_at-us-realtime-venue", price: 100, observedAt: new Date(now - 10000).toISOString() }];
  verify(false, "validation-only quote must fail operational mode", "--require-paper-quote");
  quotes.observations[0].eligibility = "PAPER";
  quotes.observations[0].observedAt = new Date(now - 240000).toISOString();
  verify(false, "stale PAPER quote must fail operational mode", "--require-paper-quote");
  quotes.observations[0].observedAt = new Date(now - 10000).toISOString();
  quotes.observations[0].provenanceVerified = false;
  verify(false, "unverified PAPER quote must fail operational mode", "--require-paper-quote");
  quotes.observations[0].provenanceVerified = true;
  quotes.observations[0].observedAt = new Date(now + 60000).toISOString();
  verify(false, "future-dated PAPER quote must fail operational mode", "--require-paper-quote");
  quotes.observations[0].observedAt = new Date(now - 10000).toISOString();
  quotes.observations[0].provenanceMethod = "unknown-provider";
  verify(false, "missing realtime venue provenance must fail operational mode", "--require-paper-quote");
  quotes.observations[0].provenanceMethod = "provider-batch-quote-last_quote_at-us-realtime-venue";
  verify(true, "fresh verified PAPER quote passes operational mode", "--require-paper-quote");
  console.log("Enhanced PAPER evidence verifier synthetic regression: PASS (13 cases)");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
