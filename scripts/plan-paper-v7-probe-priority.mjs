import { appendFile, readFile, writeFile } from "node:fs/promises";
import { explainPaperValidationCandidates } from "./explain-paper-validation-candidates.mjs";

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function priorityClass(candidate, feasibility) {
  const failed = Array.isArray(candidate?.failedGates) ? candidate.failedGates : [];
  const structuralFailed = failed.filter((gate) => gate !== "execution-coverage");
  if (feasibility?.quorumCompatible !== true) return "DEFER_PROVIDER_QUORUM";
  if (structuralFailed.length === 0 && failed.includes("execution-coverage")) return "PROMOTE_COVERAGE_ONLY";
  if (structuralFailed.length === 1) return "PROMOTE_ONE_STRUCTURAL_GATE";
  return "DEFER_MULTI_GATE";
}

export function planPaperV7ProbePriority({ diagnostic, feasibility }) {
  const candidateBySymbol = new Map((diagnostic?.candidates || []).map((candidate) => [upper(candidate?.symbol), candidate]));
  const rows = (feasibility?.targets || []).map((provider) => {
    const symbol = upper(provider?.symbol);
    const candidate = candidateBySymbol.get(symbol) || { symbol, failedGates: ["candidate-missing"], metrics: {} };
    const failedGates = Array.isArray(candidate.failedGates) ? candidate.failedGates : [];
    const classification = priorityClass(candidate, provider);
    return {
      symbol,
      classification,
      quorumCompatible: provider?.quorumCompatible === true,
      crossSourceSpreadPercent: Number.isFinite(Number(provider?.crossSourceSpreadPercent)) ? Number(provider.crossSourceSpreadPercent) : null,
      failedGates,
      structuralFailedGates: failedGates.filter((gate) => gate !== "execution-coverage"),
      metrics: {
        committeeScore: numeric(candidate?.metrics?.committeeScore),
        validationDataConfidence: numeric(candidate?.metrics?.validationDataConfidence),
        riskScore: numeric(candidate?.metrics?.riskScore, 100),
        notionalCapacityEuro: numeric(candidate?.metrics?.notionalCapacityEuro),
      },
    };
  });

  const order = {
    PROMOTE_COVERAGE_ONLY: 0,
    PROMOTE_ONE_STRUCTURAL_GATE: 1,
    DEFER_MULTI_GATE: 2,
    DEFER_PROVIDER_QUORUM: 3,
  };
  rows.sort((a, b) => (order[a.classification] - order[b.classification])
    || (b.metrics.committeeScore - a.metrics.committeeScore)
    || (b.metrics.validationDataConfidence - a.metrics.validationDataConfidence)
    || (a.metrics.riskScore - b.metrics.riskScore)
    || a.symbol.localeCompare(b.symbol));

  const recommendedExpansionOrder = rows
    .filter((row) => row.quorumCompatible && row.classification.startsWith("PROMOTE_"))
    .map((row) => row.symbol);

  return {
    plannedForVersion: 7,
    activationAllowed: false,
    currentV6Modified: false,
    diagnosticOnly: true,
    liveTradingAllowed: false,
    brokerConnectivityAllowed: false,
    recommendedExpansionOrder,
    rows,
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function planningApproval(approval, fxEvidence) {
  const usdRate = numeric(fxEvidence?.ratesToEuro?.USD?.rate, Number.NaN);
  return {
    ...approval,
    riskFxToEuroByCurrency: {
      EUR: 1,
      ...(Number.isFinite(usdRate) && usdRate > 0 ? { USD: usdRate } : {}),
    },
  };
}

function summary(report) {
  const lines = [
    "## Fenice PAPER V7 probe planner",
    "",
    "Planning only. The active V6 campaign is not modified.",
    `Recommended expansion order: ${report.recommendedExpansionOrder.join(", ") || "none"}`,
    "",
    "| Symbol | Class | Quorum | Spread % | Failed gates |",
    "| --- | --- | --- | ---: | --- |",
  ];
  for (const row of report.rows) {
    lines.push(`| ${row.symbol} | ${row.classification} | ${row.quorumCompatible ? "yes" : "no"} | ${row.crossSourceSpreadPercent ?? "n/a"} | ${row.failedGates.join(", ") || "none"} |`);
  }
  return `${lines.join("\n")}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const feasibilityPath = String(process.env.FENICE_PROVIDER_FEASIBILITY_REPORT || "paper-provider-feasibility.json").trim();
  const outputPath = String(process.env.FENICE_V7_PROBE_PLAN || "paper-v7-probe-plan.json").trim();
  const [approval, coverage, state, terminal, committee, fxEvidence, feasibility] = await Promise.all([
    readJson("data/paper-validation-approval.json"),
    readJson("data/execution-market-coverage.json"),
    readJson("data/paper-oms-state.json"),
    readJson("data/terminal-intelligence.json"),
    readJson("data/investment-committee.json"),
    readJson("data/paper-fx-evidence.json"),
    readJson(feasibilityPath),
  ]);

  const diagnostic = explainPaperValidationCandidates({
    approval: planningApproval(approval, fxEvidence),
    coverage,
    state,
    terminal,
    committee,
  });
  const report = {
    generatedAt: new Date().toISOString(),
    planningFxObservedAt: fxEvidence?.ratesToEuro?.USD?.observedAt || null,
    planningFxFreshnessEnforced: false,
    ...planPaperV7ProbePriority({ diagnostic, feasibility }),
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary(report));
  console.log(`Fenice PAPER V7 planner: expansion=${report.recommendedExpansionOrder.join(",") || "none"}; plannedForVersion=7; activationAllowed=false; currentV6Modified=false; liveTradingAllowed=false.`);
}
