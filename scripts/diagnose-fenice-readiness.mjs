#!/usr/bin/env node
/**
 * Run from any working directory: node scripts/diagnose-fenice-readiness.mjs
 * --json for machine-readable output. ZERO filesystem or broker writes.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { diagnoseFeniceReadiness } from "../lib/diagnostics/fenice-readiness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputs = {
  sources: "global-source-health.json",
  campaign: "paper-validation-campaign.json",
  approval: "paper-validation-approval.json",
  oms: "paper-oms-state.json",
  queue: "paper-order-queue.json",
  coverage: "execution-market-coverage.json",
  committee: "investment-committee.json",
  terminal: "terminal-intelligence.json",
  world: "world-v7-validation-ledger.json",
  v7Gate: "v7-shadow-promotion-gate.json",
  shadowCalibration: "shadow-calibration.json",
  continuationPlan: "paper-v6-continuation-plan.json",
};
const snapshots = {};
for (const [name, file] of Object.entries(inputs)) {
  // Missing or corrupt critical inputs MUST fail, not become zero-risk success.
  snapshots[name] = JSON.parse(await readFile(path.join(root, "data", file), "utf8"));
}
const report = diagnoseFeniceReadiness(snapshots);
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const p = report.paper, c = report.marketCoverage, v = report.shadowV7;
  console.log("FENICE READ-ONLY READINESS | " + report.generatedAt);
  console.log("General sources: " + report.sourceHealth.healthy + "/" + report.sourceHealth.total +
    " | PAPER-qualified quotes: " + c.qualifiedPaperSymbols + "/" + c.requestedSymbols);
  console.log("V6 PAPER filled: " + p.recordedFills + "/" + p.targetFills +
    " | validated evidence rows reported: " + p.evidenceDaysReported +
    " | last fill: " + (p.lastFillAt || "none") +
    " | historical record consistent: " + p.ledgerMatchesCampaign);
  console.log("Approval expires: " + p.originalApprovalExpiry +
    " | expired: " + p.expired + " | safety locks intact: " + p.safetyLocksIntact);
  console.log("Committee precheck candidates: " + report.committee.preliminaryCandidates +
    "/" + report.committee.candidatesReviewed +
    " | shadow V7: " + v.promotionGate + " | world fills: " + report.worldV7.certifiedInternationalPaperFills);
  for (const issue of report.alerts) console.log("[" + issue.priority + "] " +
    issue.code + ": " + issue.explanation + " Next: " + issue.nextStep);
  for (const item of report.committee.symbolBreakdown) {
    console.log(item.symbol + " " + item.committeeScore + " " + (item.decision || "?") +
      ": " + (item.preliminaryBlockers.join(", ") || "PRECHECK_ONLY; EXECUTION NOT AUTHORIZED"));
  }
}
if (!report.paper.safetyLocksIntact || !report.paper.ledgerMatchesCampaign ||
    !report.paper.reconciliationBalanced) process.exitCode = 2;
// Diagnostic success never indicates permission for PAPER/LIVE.
