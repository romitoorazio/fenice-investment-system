import { readFile, writeFile } from "node:fs/promises";
import { evaluateMarketDataQuorum } from "../lib/trading/market-data-quorum.ts";

const evidence = JSON.parse(await readFile("data/execution-market-evidence.json", "utf8"));
const requestedSymbols = Array.isArray(evidence?.requestedSymbols) ? evidence.requestedSymbols : [];
const observations = Array.isArray(evidence?.observations) ? evidence.observations : [];
const errors = Array.isArray(evidence?.errors) ? evidence.errors : [];
const now = Date.now();

const rows = requestedSymbols.map((rawSymbol) => {
  const symbol = String(rawSymbol || "").toUpperCase();
  const symbolObservations = observations
    .filter((item) => String(item?.symbol || "").toUpperCase() === symbol)
    .map((item) => ({
      source: item.source,
      sourceFamily: item.sourceFamily,
      eligibility: item.eligibility,
      price: Number(item.price),
      observedAt: item.observedAt,
    }));
  const decision = evaluateMarketDataQuorum(symbolObservations, undefined, now);
  return {
    symbol,
    state: decision.state,
    paperEligible: decision.allowNewRisk,
    independentSourceFamilies: decision.independentSources,
    sourceFamilies: decision.sourceFamilies,
    medianPrice: decision.medianPrice,
    maxSpreadPercent: decision.maxSpreadPercent,
    staleEvidence: decision.staleEvidence,
    ineligibleEvidence: decision.ineligibleEvidence,
    invalidEvidence: decision.invalidEvidence,
    providerErrors: errors.filter((item) => String(item?.symbol || "").toUpperCase() === symbol),
    reasons: decision.reasons,
  };
});

const paperEligible = rows.filter((row) => row.paperEligible);
const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  evidenceGeneratedAt: evidence?.generatedAt || null,
  requestedSymbols: rows.length,
  paperEligibleSymbols: paperEligible.length,
  paperEligiblePercent: rows.length ? Number((paperEligible.length / rows.length * 100).toFixed(1)) : 0,
  greenSymbols: rows.filter((row) => row.state === "GREEN").map((row) => row.symbol),
  cautionSymbols: rows.filter((row) => row.state === "CAUTION").map((row) => row.symbol),
  blockedSymbols: rows.filter((row) => row.state === "BLOCKED").map((row) => row.symbol),
  rows,
  policy: {
    requiredEligibility: "PAPER",
    minIndependentSourceFamilies: 2,
    preferredIndependentSourceFamilies: 3,
    liveTradingAllowed: false,
  },
};

await writeFile("data/execution-market-coverage.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Fenice PAPER execution coverage: ${report.paperEligibleSymbols}/${report.requestedSymbols} symbols eligible (${report.paperEligiblePercent}%).`);
console.log(`Eligible symbols: ${paperEligible.map((row) => row.symbol).join(", ") || "none"}.`);
