import { appendFile, readFile, writeFile } from "node:fs/promises";
import { selectPaperV7ProbeSymbols, uniquePaperV7Symbols } from "../lib/trading/paper-v7-probe-selection.mjs";

const PROTECTED_V6_TWELVE_DATA_SYMBOLS = ["SPY", "QQQ", "AAPL", "MSFT"];

function assertProtectedV6Base(actualSymbols) {
  const actual = uniquePaperV7Symbols(actualSymbols);
  const matches = actual.length === PROTECTED_V6_TWELVE_DATA_SYMBOLS.length
    && actual.every((symbol, index) => symbol === PROTECTED_V6_TWELVE_DATA_SYMBOLS[index]);
  if (!matches) {
    throw new Error(
      `PAPER_V7_PROTECTED_BASE_MISMATCH:expected=${PROTECTED_V6_TWELVE_DATA_SYMBOLS.join(",")};actual=${actual.join(",") || "none"}`,
    );
  }
  return actual;
}

export function planPaperV7ProbeUniverse({ evidence, priorityPlan, maxBatchSymbols = 8 }) {
  const capabilities = evidence?.capabilities || {};
  const probeUniverse = uniquePaperV7Symbols(capabilities.probeUniverse);
  const currentV6Symbols = assertProtectedV6Base(capabilities.twelveDataProbedSymbols);
  const requestedPromotions = uniquePaperV7Symbols(priorityPlan?.recommendedExpansionOrder);
  const selection = selectPaperV7ProbeSymbols({
    baseSymbols: currentV6Symbols,
    promotionSymbols: requestedPromotions,
    allowedUniverse: probeUniverse,
    maxBatchSymbols,
  });

  const plannedTwelveDataSymbols = selection.selectedSymbols;
  const promotedSymbolsIncluded = selection.includedPromotions;
  const deferredByCeiling = selection.deferredByCeiling;
  const missingFromProbeUniverse = selection.missingPromotions;
  const staticPrefixAtPlannedSize = probeUniverse.slice(0, plannedTwelveDataSymbols.length);
  const staticPrefixSet = new Set(staticPrefixAtPlannedSize);
  const promotionsOutsideStaticPrefix = promotedSymbolsIncluded.filter((symbol) => !staticPrefixSet.has(symbol));
  const adaptiveSelectionRequired = promotionsOutsideStaticPrefix.length > 0;

  const blockers = ["active-v6-fingerprint-must-remain-unchanged"];
  if (missingFromProbeUniverse.length) blockers.push("recommended-symbol-missing-from-probe-universe");
  if (deferredByCeiling.length) blockers.push("recommended-symbols-exceed-current-batch-ceiling");

  return {
    plannedForVersion: 7,
    activationAllowed: false,
    currentV6Modified: false,
    diagnosticOnly: true,
    liveTradingAllowed: false,
    brokerConnectivityAllowed: false,
    selectionPolicy: "preserve-current-v6-twelve-data-symbols-then-add-provider-compatible-v7-promotions",
    currentV6: {
      protectedBaseVerified: true,
      protectedBaseSymbols: [...PROTECTED_V6_TWELVE_DATA_SYMBOLS],
      probeLimit: Number(capabilities.twelveDataProbeLimit || currentV6Symbols.length || 0),
      twelveDataProbedSymbols: currentV6Symbols,
    },
    futureV7: {
      maxBatchSymbols: selection.maxBatchSymbols,
      plannedProbeLimit: plannedTwelveDataSymbols.length,
      plannedTwelveDataSymbols,
      requestedPromotions,
      promotedSymbolsIncluded,
      deferredByCeiling,
      missingFromProbeUniverse,
      additionalBatchCredits: selection.additionalBatchCredits,
      staticPrefixAtPlannedSize,
      promotionsOutsideStaticPrefix,
      adaptiveSelectionRequired,
      runtimeSelectionChangeRequired: adaptiveSelectionRequired,
      frozenCoreChangeRequiredForActivation: plannedTwelveDataSymbols.length !== currentV6Symbols.length || adaptiveSelectionRequired,
    },
    activationBlockers: blockers,
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function summary(report) {
  const v7 = report.futureV7;
  return [
    "## Fenice PAPER V7 adaptive probe universe",
    "",
    "Planning only. Active PAPER V6 remains unchanged.",
    `Protected V6 base verified: ${report.currentV6.protectedBaseVerified ? "yes" : "no"}`,
    `Current V6 Twelve Data symbols: ${report.currentV6.twelveDataProbedSymbols.join(", ") || "none"}`,
    `Planned V7 Twelve Data symbols: ${v7.plannedTwelveDataSymbols.join(", ") || "none"}`,
    `Promotions included: ${v7.promotedSymbolsIncluded.join(", ") || "none"}`,
    `Additional batch credits: ${v7.additionalBatchCredits}`,
    `Adaptive selection required: ${v7.adaptiveSelectionRequired ? "yes" : "no"}`,
    `Activation blockers: ${report.activationBlockers.join(", ")}`,
    "",
  ].join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const evidencePath = String(process.env.FENICE_EXECUTION_MARKET_EVIDENCE || "data/execution-market-evidence.json").trim();
  const priorityPath = String(process.env.FENICE_V7_PROBE_PLAN || "paper-v7-probe-plan.json").trim();
  const outputPath = String(process.env.FENICE_V7_PROBE_UNIVERSE_PLAN || "paper-v7-probe-universe.json").trim();
  const [evidence, priorityPlan] = await Promise.all([readJson(evidencePath), readJson(priorityPath)]);
  const report = {
    generatedAt: new Date().toISOString(),
    ...planPaperV7ProbeUniverse({ evidence, priorityPlan }),
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary(report));
  console.log(`Fenice PAPER V7 probe universe: protectedBaseVerified=${report.currentV6.protectedBaseVerified}; planned=${report.futureV7.plannedTwelveDataSymbols.join(",") || "none"}; promotions=${report.futureV7.promotedSymbolsIncluded.join(",") || "none"}; adaptive=${report.futureV7.adaptiveSelectionRequired}; credits+${report.futureV7.additionalBatchCredits}; activationAllowed=false; currentV6Modified=false; liveTradingAllowed=false.`);
}
