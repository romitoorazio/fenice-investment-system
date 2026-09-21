import { readFile, writeFile } from "node:fs/promises";
import { evaluateMarketDataQuorum } from "../lib/trading/market-data-quorum.ts";

const evidence = JSON.parse(await readFile("data/execution-market-evidence.json", "utf8"));
const requestedSymbols = Array.isArray(evidence?.requestedSymbols) ? evidence.requestedSymbols : [];
const observations = Array.isArray(evidence?.observations) ? evidence.observations : [];
const errors = Array.isArray(evidence?.errors) ? evidence.errors : [];
const now = Date.now();

function isDirectaPilotAssetClass(value) {
  return /equity|stock|etf|azione|azion/i.test(String(value || ""));
}

const rows = requestedSymbols.map((rawSymbol) => {
  const symbol = String(rawSymbol || "").toUpperCase();
  const rawObservations = observations.filter((item) => String(item?.symbol || "").toUpperCase() === symbol);
  const assetClasses = [...new Set(rawObservations.map((item) => String(item?.assetClass || "").trim()).filter(Boolean))];
  const symbolObservations = rawObservations.map((item) => ({
    source: item.source,
    sourceFamily: item.sourceFamily,
    eligibility: item.eligibility,
    price: Number(item.price),
    observedAt: item.observedAt,
  }));
  const decision = evaluateMarketDataQuorum(symbolObservations, undefined, now);
  const directaPilotCandidate = assetClasses.some(isDirectaPilotAssetClass);
  const directaPaperEvidence = rawObservations.some((item) =>
    String(item?.sourceFamily || "").trim().toLowerCase() === "directa"
      && item?.eligibility === "PAPER",
  );
  const independentNonDirectaPaperEvidence = rawObservations.some((item) =>
    String(item?.sourceFamily || "").trim().toLowerCase() !== "directa"
      && String(item?.sourceFamily || "").trim() !== ""
      && item?.eligibility === "PAPER",
  );
  const directaPilotEligible = directaPilotCandidate
    && decision.allowNewRisk
    && directaPaperEvidence
    && independentNonDirectaPaperEvidence;
  const directaPilotReasons = [];
  if (directaPilotCandidate && !directaPaperEvidence) directaPilotReasons.push("missing Directa PAPER source");
  if (directaPilotCandidate && !independentNonDirectaPaperEvidence) directaPilotReasons.push("missing independent non-Directa PAPER source");
  if (directaPilotCandidate && !decision.allowNewRisk) directaPilotReasons.push("market-data quorum blocks new risk");

  return {
    symbol,
    assetClasses,
    directaPilotCandidate,
    state: decision.state,
    paperEligible: decision.allowNewRisk,
    directaPaperEvidence,
    independentNonDirectaPaperEvidence,
    directaPilotEligible,
    independentSourceFamilies: decision.independentSources,
    sourceFamilies: decision.sourceFamilies,
    medianPrice: decision.medianPrice,
    maxSpreadPercent: decision.maxSpreadPercent,
    staleEvidence: decision.staleEvidence,
    ineligibleEvidence: decision.ineligibleEvidence,
    invalidEvidence: decision.invalidEvidence,
    providerErrors: errors.filter((item) => String(item?.symbol || "").toUpperCase() === symbol),
    reasons: [...decision.reasons, ...directaPilotReasons],
  };
});

const paperEligible = rows.filter((row) => row.paperEligible);
const directaPilotCandidates = rows.filter((row) => row.directaPilotCandidate);
const directaPilotEligible = rows.filter((row) => row.directaPilotEligible);
const report = {
  version: 3,
  generatedAt: new Date().toISOString(),
  evidenceGeneratedAt: evidence?.generatedAt || null,
  requestedSymbols: rows.length,
  paperEligibleSymbols: paperEligible.length,
  paperEligiblePercent: rows.length ? Number((paperEligible.length / rows.length * 100).toFixed(1)) : 0,
  directaPilotCandidateSymbols: directaPilotCandidates.length,
  directaPilotEligibleSymbols: directaPilotEligible.length,
  directaPilotEligiblePercent: directaPilotCandidates.length
    ? Number((directaPilotEligible.length / directaPilotCandidates.length * 100).toFixed(1))
    : 0,
  greenSymbols: rows.filter((row) => row.state === "GREEN").map((row) => row.symbol),
  cautionSymbols: rows.filter((row) => row.state === "CAUTION").map((row) => row.symbol),
  blockedSymbols: rows.filter((row) => row.state === "BLOCKED").map((row) => row.symbol),
  directaPilotGreenSymbols: directaPilotEligible.map((row) => row.symbol),
  rows,
  policy: {
    requiredEligibility: "PAPER",
    minIndependentSourceFamilies: 2,
    preferredIndependentSourceFamilies: 3,
    minimumDirectaPilotEligibleSymbols: 3,
    directaPilotAssetClasses: ["equity", "stock", "ETF"],
    requireDirectaPaperSourceForDirectaPilot: true,
    requireIndependentNonDirectaPaperSourceForDirectaPilot: true,
    cryptoCannotSatisfyDirectaPilotCoverage: true,
    liveTradingAllowed: false,
  },
};

await writeFile("data/execution-market-coverage.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Fenice PAPER execution coverage: ${report.paperEligibleSymbols}/${report.requestedSymbols} symbols eligible (${report.paperEligiblePercent}%).`);
console.log(`Directa pilot coverage: ${report.directaPilotEligibleSymbols}/${report.directaPilotCandidateSymbols} equity/ETF symbols eligible (${report.directaPilotEligiblePercent}%).`);
console.log(`Eligible symbols: ${paperEligible.map((row) => row.symbol).join(", ") || "none"}.`);
