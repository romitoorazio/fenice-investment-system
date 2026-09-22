import assert from "node:assert/strict";
import { overlaySourceHealth } from "../lib/data-hub-source-overlay.ts";

function snapshot(overrides = {}) {
  return {
    version: 1,
    generatedAt: "2026-09-22T12:00:00.000Z",
    mode: "partial",
    headline: "test",
    pulse: { verdict: "ATTENDERE", opportunity: 0, risk: 0, confidence: 0, marketMomentum: 0, macroHealth: 0, discoveryHeat: 0 },
    providers: [
      { id: "gdelt", name: "GDELT", state: "errore", coverage: ["geopolitica"], detail: "Nessun flusso acquisito." },
      { id: "alphavantage", name: "Alpha Vantage", state: "parziale", coverage: ["azioni"], detail: "snapshot", lastSuccessAt: "2026-09-22T12:04:00.000Z" },
      { id: "clinicaltrials", name: "ClinicalTrials.gov", state: "errore", coverage: ["studi clinici"], detail: "snapshot clinical" },
      { id: "broad-news", name: "Broad News Matrix", state: "errore", coverage: ["news"], detail: "pipeline failed" },
    ],
    markets: [],
    macro: [],
    discoveries: [],
    warnings: [],
    executionPolicy: { autonomousAnalysis: true, autonomousTrading: false, humanConfirmationRequired: true },
    ...overrides,
  };
}

const newerHealth = {
  generatedAt: "2026-09-22T12:05:00.000Z",
  sources: [
    { id: "gdelt", status: "degraded", detail: "Recuperata al tentativo 2.", checkedAt: "2026-09-22T12:05:00.000Z", lastSuccessfulAt: "2026-09-22T12:05:00.000Z" },
    { id: "alpha-vantage", status: "healthy", detail: "Probe OK", checkedAt: "2026-09-22T12:05:00.000Z", lastSuccessfulAt: "2026-09-22T12:05:00.000Z" },
    { id: "clinical-trials", status: "healthy", detail: "ClinicalTrials probe OK", checkedAt: "2026-09-22T12:05:00.000Z", lastSuccessfulAt: "2026-09-22T12:05:00.000Z" },
  ],
};

const reconciled = overlaySourceHealth(snapshot(), newerHealth);
assert.equal(reconciled.providers[0].state, "parziale", "newer GDELT health must replace stale snapshot error");
assert.equal(reconciled.providers[0].detail, "Recuperata al tentativo 2.");
assert.equal(reconciled.providers[1].state, "operativo", "provider alias alphavantage -> alpha-vantage must reconcile");
assert.equal(reconciled.providers[2].state, "operativo", "provider alias clinicaltrials -> clinical-trials must reconcile");
assert.equal(reconciled.providers[3].state, "errore", "derived pipelines must not be promoted by unrelated upstream source health");

const olderReport = overlaySourceHealth(snapshot(), {
  generatedAt: "2026-09-22T11:59:00.000Z",
  sources: [{ id: "gdelt", status: "healthy", checkedAt: "2026-09-22T11:59:00.000Z" }],
});
assert.equal(olderReport.providers[0].state, "errore", "older global health report must not overwrite newer snapshot evidence");

const olderEntry = overlaySourceHealth(snapshot(), {
  generatedAt: "2026-09-22T12:06:00.000Z",
  sources: [{ id: "alpha-vantage", status: "failed", checkedAt: "2026-09-22T12:03:00.000Z", detail: "old failure" }],
});
assert.equal(olderEntry.providers[1].state, "parziale", "older per-provider probe must not overwrite a newer successful provider observation");
assert.equal(olderEntry.providers[1].detail, "snapshot");

const unknownStatus = overlaySourceHealth(snapshot(), {
  generatedAt: "2026-09-22T12:06:00.000Z",
  sources: [{ id: "gdelt", status: "mystery", checkedAt: "2026-09-22T12:06:00.000Z" }],
});
assert.equal(unknownStatus.providers[0].state, "errore", "unknown health states must fail closed by leaving snapshot state untouched");

console.log("Fenice source-health overlay tests: PASS");
