import { appendFile, readFile, writeFile } from "node:fs/promises";
import { evaluateDecisionDataGate } from "../lib/trading/decision-data-gate.mjs";
import { evaluatePaperFxEvidence } from "../lib/trading/paper-fx-evidence.mjs";
import {
  buildDiagnosticRuntimeApproval,
  explainPaperValidationCandidates,
} from "./explain-paper-validation-candidates.mjs";

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function rankPaperValidationOpportunities(diagnostic) {
  const candidates = Array.isArray(diagnostic?.candidates) ? diagnostic.candidates : [];
  const blocked = candidates
    .filter((candidate) => candidate?.eligible !== true)
    .map((candidate) => {
      const failedGates = Array.isArray(candidate?.failedGates) ? candidate.failedGates : [];
      const coverageOnly = failedGates.length === 1 && failedGates[0] === "execution-coverage";
      const oneGateAway = failedGates.length === 1;
      return {
        symbol: String(candidate?.symbol || "").toUpperCase(),
        failedGates,
        distanceToEligibility: failedGates.length,
        oneGateAway,
        coverageOnly,
        priorityClass: coverageOnly ? "COVERAGE_ONLY" : oneGateAway ? "ONE_GATE_AWAY" : "MULTI_GATE",
        metrics: {
          committeeScore: numeric(candidate?.metrics?.committeeScore),
          validationDataConfidence: numeric(candidate?.metrics?.validationDataConfidence),
          riskScore: numeric(candidate?.metrics?.riskScore, 100),
          notionalCapacityEuro: numeric(candidate?.metrics?.notionalCapacityEuro),
        },
      };
    })
    .sort((left, right) => {
      const priority = { COVERAGE_ONLY: 0, ONE_GATE_AWAY: 1, MULTI_GATE: 2 };
      return (priority[left.priorityClass] - priority[right.priorityClass])
        || (left.distanceToEligibility - right.distanceToEligibility)
        || (right.metrics.committeeScore - left.metrics.committeeScore)
        || (right.metrics.validationDataConfidence - left.metrics.validationDataConfidence)
        || (left.metrics.riskScore - right.metrics.riskScore)
        || left.symbol.localeCompare(right.symbol);
    });

  return {
    diagnosticOnly: true,
    liveTradingAllowed: false,
    brokerConnectivityAllowed: false,
    eligibleNow: candidates.filter((candidate) => candidate?.eligible === true).map((candidate) => candidate.symbol),
    blockedCandidates: blocked.length,
    oneGateAwayCount: blocked.filter((candidate) => candidate.oneGateAway).length,
    coverageOnlyCount: blocked.filter((candidate) => candidate.coverageOnly).length,
    coverageOnlyTargets: blocked.filter((candidate) => candidate.coverageOnly).map((candidate) => candidate.symbol),
    nearestBlocked: blocked.slice(0, 8),
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function summaryMarkdown(report) {
  const lines = [
    "## Fenice PAPER opportunity map",
    "",
    `- Eligible now: ${report.eligibleNow.length ? report.eligibleNow.join(", ") : "none"}`,
    `- One gate away: ${report.oneGateAwayCount}`,
    `- Coverage-only targets: ${report.coverageOnlyTargets.length ? report.coverageOnlyTargets.join(", ") : "none"}`,
    "- Safety: diagnostic only; LIVE and broker connectivity remain disabled.",
    "",
    "| Symbol | Priority | Failed gates | Committee | Confidence | Risk | Capacity EUR |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: |",
  ];

  for (const candidate of report.nearestBlocked) {
    lines.push(`| ${candidate.symbol} | ${candidate.priorityClass} | ${candidate.failedGates.join(", ")} | ${candidate.metrics.committeeScore} | ${candidate.metrics.validationDataConfidence} | ${candidate.metrics.riskScore} | ${candidate.metrics.notionalCapacityEuro.toFixed(2)} |`);
  }
  return `${lines.join("\n")}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [approval, coverage, state, terminal, committee, sourceHealth, intelligence, fxEvidence] = await Promise.all([
    readJson("data/paper-validation-approval.json"),
    readJson("data/execution-market-coverage.json"),
    readJson("data/paper-oms-state.json"),
    readJson("data/terminal-intelligence.json"),
    readJson("data/investment-committee.json"),
    readJson("data/global-source-health.json"),
    readJson("data/intelligence-quality.json"),
    readJson("data/paper-fx-evidence.json"),
  ]);

  const decisionData = evaluateDecisionDataGate({ sourceHealth, intelligence });
  const fx = evaluatePaperFxEvidence({ fxEvidence, approval });
  const outputPath = String(process.env.FENICE_PAPER_OPPORTUNITY_REPORT || "paper-candidate-opportunities.json").trim();

  if (!decisionData.ready || !fx.ready) {
    const skipped = {
      generatedAt: new Date().toISOString(),
      status: "SKIPPED",
      reasons: [
        ...(!decisionData.ready ? ["decision-data-not-ready"] : []),
        ...(!fx.ready ? fx.reasons.map((reason) => `market-fx:${reason}`) : []),
      ],
      diagnosticOnly: true,
      liveTradingAllowed: false,
      brokerConnectivityAllowed: false,
    };
    await writeFile(outputPath, `${JSON.stringify(skipped, null, 2)}\n`);
    console.log(`Fenice PAPER opportunity map: SKIPPED reasons=${skipped.reasons.join(" | ")}; diagnosticOnly=true; liveTradingAllowed=false; brokerConnectivityAllowed=false.`);
    process.exit(0);
  }

  const runtimeApproval = buildDiagnosticRuntimeApproval(approval, fx);
  const diagnostic = explainPaperValidationCandidates({ approval: runtimeApproval, coverage, state, terminal, committee });
  const ranking = rankPaperValidationOpportunities(diagnostic);
  const report = {
    generatedAt: new Date().toISOString(),
    status: "READY",
    fxProvider: fx.metrics.provider,
    ...ranking,
  };

  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(report));
  }

  console.log(`Fenice PAPER opportunity map: eligible=${report.eligibleNow.length}; oneGateAway=${report.oneGateAwayCount}; coverageOnly=${report.coverageOnlyCount}; targets=${report.coverageOnlyTargets.join(",") || "none"}; diagnosticOnly=true; liveTradingAllowed=false; brokerConnectivityAllowed=false.`);
}
