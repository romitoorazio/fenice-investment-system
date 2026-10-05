import { appendFile, readFile, writeFile } from "node:fs/promises";

const SCORE_WEIGHTS = Object.freeze({
  fundamental: 0.24,
  quality: 0.14,
  valuation: 0.20,
  technical: 0.12,
  riskAdjusted: 0.14,
  catalysts: 0.06,
  dataConfidence: 0.10,
});

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.min(max, Math.max(min, numeric(value)));
}

function contradictionPenalty(candidate) {
  const status = String(candidate?.valuation?.status || "").toLowerCase();
  const upside = Number(candidate?.valuation?.upsideBasePercent);
  if (status === "disponibile" && Number.isFinite(upside) && upside < -20) {
    return Math.min(20, Math.abs(upside) * 0.25);
  }
  return 0;
}

export function recomputeCommitteeScore(candidate) {
  const scorecard = candidate?.scorecard || {};
  const weightedRaw = Object.entries(SCORE_WEIGHTS)
    .reduce((sum, [key, weight]) => sum + clamp(scorecard[key]) * weight, 0);
  const penalty = contradictionPenalty(candidate);
  const rawAfterPenalty = clamp(weightedRaw - penalty);
  return {
    weightedRaw,
    contradictionPenalty: penalty,
    rawAfterPenalty,
    roundedScore: Math.round(rawAfterPenalty),
  };
}

function minimumComponentDelta(candidate, component, threshold) {
  const current = clamp(candidate?.scorecard?.[component]);
  const maxDelta = Math.max(0, 100 - current);
  for (let delta = 1; delta <= maxDelta; delta += 1) {
    const simulated = {
      ...candidate,
      scorecard: {
        ...(candidate?.scorecard || {}),
        [component]: current + delta,
      },
    };
    if (recomputeCommitteeScore(simulated).roundedScore >= threshold) return delta;
  }
  return null;
}

export function analyzeCandidateCommitteeSensitivity(candidate, threshold) {
  const target = Math.max(0, Math.min(100, Math.round(numeric(threshold))));
  const reportedScore = Math.round(numeric(candidate?.committeeScore, -1));
  const recomputed = recomputeCommitteeScore(candidate);
  const reconstructionMatches = reportedScore === recomputed.roundedScore;
  const gap = Math.max(0, target - reportedScore);

  const componentSensitivity = reconstructionMatches && gap > 0
    ? Object.entries(SCORE_WEIGHTS).map(([component, weight]) => ({
        component,
        current: clamp(candidate?.scorecard?.[component]),
        weight,
        minimumScorecardDelta: minimumComponentDelta(candidate, component, target),
      }))
      .filter((item) => item.minimumScorecardDelta !== null)
      .sort((a, b) => a.minimumScorecardDelta - b.minimumScorecardDelta || b.weight - a.weight || a.component.localeCompare(b.component))
    : [];

  return {
    symbol: String(candidate?.symbol || "").toUpperCase(),
    threshold: target,
    reportedScore,
    reconstructedScore: recomputed.roundedScore,
    rawScoreBeforeRounding: Number(recomputed.rawAfterPenalty.toFixed(4)),
    contradictionPenalty: Number(recomputed.contradictionPenalty.toFixed(4)),
    reconstructionMatches,
    pointsToThreshold: gap,
    thresholdAlreadyMet: reportedScore >= target,
    componentSensitivity,
  };
}

export function buildPaperV6CommitteeSensitivity({ approval, opportunityMap, committee }) {
  const threshold = numeric(approval?.minCommitteeScore, NaN);
  if (!Number.isFinite(threshold)) throw new Error("PAPER_V6_COMMITTEE_THRESHOLD_MISSING");
  const targets = new Set(
    (Array.isArray(opportunityMap?.activeV6OneGateAwayTargets) ? opportunityMap.activeV6OneGateAwayTargets : [])
      .map((symbol) => String(symbol || "").toUpperCase())
      .filter(Boolean),
  );
  const candidates = (Array.isArray(committee?.topDecisions) ? committee.topDecisions : [])
    .filter((candidate) => targets.has(String(candidate?.symbol || "").toUpperCase()))
    .map((candidate) => analyzeCandidateCommitteeSensitivity(candidate, threshold));
  const found = new Set(candidates.map((candidate) => candidate.symbol));
  const missingTargets = [...targets].filter((symbol) => !found.has(symbol));
  const mismatches = candidates.filter((candidate) => !candidate.reconstructionMatches).map((candidate) => candidate.symbol);

  return {
    diagnosticOnly: true,
    activeCampaignVersion: numeric(approval?.version),
    committeeThreshold: threshold,
    liveTradingAllowed: false,
    brokerConnectivityAllowed: false,
    thresholdModified: false,
    scoreFormulaModified: false,
    activeV6Targets: [...targets],
    missingTargets,
    reconstructionMismatches: mismatches,
    ready: missingTargets.length === 0 && mismatches.length === 0,
    candidates,
  };
}

function summaryMarkdown(report) {
  const lines = [
    "## Fenice PAPER V6 committee sensitivity",
    "",
    `- Threshold: ${report.committeeThreshold} (unchanged)`,
    `- Active V6 targets: ${report.activeV6Targets.join(", ") || "none"}`,
    `- Reconstruction: ${report.ready ? "verified" : "fail-closed"}`,
    "- Safety: diagnostic only; formula, threshold, LIVE and broker connectivity remain unchanged.",
    "",
    "| Symbol | Score | Raw | Gap | Smallest authentic scorecard changes that would cross threshold |",
    "| --- | ---: | ---: | ---: | --- |",
  ];
  for (const candidate of report.candidates) {
    const smallest = candidate.componentSensitivity
      .filter((item) => item.minimumScorecardDelta === candidate.componentSensitivity[0]?.minimumScorecardDelta)
      .map((item) => `${item.component} +${item.minimumScorecardDelta}`)
      .join(", ");
    lines.push(`| ${candidate.symbol} | ${candidate.reportedScore} | ${candidate.rawScoreBeforeRounding.toFixed(2)} | ${candidate.pointsToThreshold} | ${smallest || "n/a"} |`);
  }
  return `${lines.join("\n")}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const approvalPath = String(process.env.FENICE_PAPER_APPROVAL || "data/paper-validation-approval.json").trim();
  const opportunityPath = String(process.env.FENICE_PAPER_OPPORTUNITY_REPORT || "paper-candidate-opportunities.json").trim();
  const committeePath = String(process.env.FENICE_INVESTMENT_COMMITTEE || "data/investment-committee.json").trim();
  const outputPath = String(process.env.FENICE_PAPER_V6_COMMITTEE_SENSITIVITY || "paper-v6-committee-sensitivity.json").trim();
  const [approval, opportunityMap, committee] = await Promise.all([
    readFile(approvalPath, "utf8").then(JSON.parse),
    readFile(opportunityPath, "utf8").then(JSON.parse),
    readFile(committeePath, "utf8").then(JSON.parse),
  ]);
  const report = {
    generatedAt: new Date().toISOString(),
    ...buildPaperV6CommitteeSensitivity({ approval, opportunityMap, committee }),
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(report));
  console.log(`Fenice PAPER V6 committee sensitivity: targets=${report.activeV6Targets.join(",") || "none"}; threshold=${report.committeeThreshold}; ready=${report.ready}; mismatches=${report.reconstructionMismatches.join(",") || "none"}; diagnosticOnly=true; thresholdModified=false; scoreFormulaModified=false; liveTradingAllowed=false; brokerConnectivityAllowed=false.`);
}
