import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonState } from "../lib/trading/atomic-state-store.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");

function run(relativePath, { stripTypes = false } = {}) {
  const args = stripTypes
    ? ["--experimental-strip-types", path.join(root, relativePath)]
    : [path.join(root, relativePath)];
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) throw new Error(`${relativePath} exited with status ${result.status}`);
}

const campaign = await readJsonState(path.join(dataDir, "paper-validation-campaign.json"), null);
const fingerprint = campaign?.baselineFingerprint;
const active = Boolean(
  campaign?.startedAt
  && campaign?.baselineCommit
  && campaign?.liveTradingAllowed === false
  && fingerprint?.complete === true
  && fingerprint?.algorithm === "sha256"
  && /^[a-f0-9]{64}$/i.test(String(fingerprint?.digest || "")),
);

if (!active) {
  throw new Error("LOCAL_PAPER_VALIDATION_NOT_STARTED: establish an eligible immutable baseline first; this command never auto-starts the campaign.");
}

console.log(`Fenice local PAPER validation cycle: baseline=${String(campaign.baselineCommit).slice(0, 12)}, liveTradingAllowed=false.`);

// Refresh institutional decision-data evidence first. Any failure aborts the
// cycle before the OMS can create new PAPER risk.
run("scripts/check-global-sources.mjs");
run("scripts/run-intelligence.mjs");

// Directa preflight is loopback/read-only only. It captures a fresh local
// snapshot, rebuilds execution evidence and requires the baseline coverage
// gates to remain eligible. No order transmission exists in this path.
run("scripts/run-directa-paper-preflight.mjs", { stripTypes: true });

// Exercise conditional and standard PAPER OMS only after fresh Directa-aware
// execution evidence has been produced. Per-symbol operational gates remain
// fail-closed, so insufficient quorum produces risk rejection rather than a fill.
run("scripts/run-paper-conditional-oms.mjs", { stripTypes: true });
run("scripts/run-paper-oms.mjs", { stripTypes: true });

// Record immutable-core, reconciliation, audit, per-fill market-data proof and
// execution-quality evidence. A missing proof causes this step to fail.
run("scripts/record-paper-validation-evidence.mjs", { stripTypes: true });
run("scripts/check-paper-validation-campaign.mjs");

const [campaignAfter, coverage, state] = await Promise.all([
  readJsonState(path.join(dataDir, "paper-validation-campaign.json"), {}),
  readJsonState(path.join(dataDir, "execution-market-coverage.json"), {}),
  readJsonState(path.join(dataDir, "paper-oms-state.json"), {}),
]);
const today = new Date().toISOString().slice(0, 10);
const todayEvidence = Array.isArray(campaignAfter.dailyEvidence)
  ? campaignAfter.dailyEvidence.find((row) => String(row?.date || "").slice(0, 10) === today)
  : null;
const summary = {
  date: today,
  paperEligibleSymbols: Number(coverage.paperEligibleSymbols || 0),
  directaPilotEligibleSymbols: Number(coverage.directaPilotEligibleSymbols || 0),
  cumulativePaperFilled: Number(todayEvidence?.cumulativePaperFilled || 0),
  newPaperFills: Number(todayEvidence?.newPaperFills || 0),
  fillEvidenceComplete: todayEvidence?.fillEvidenceProof?.complete === true,
  reconciliationBalanced: state?.reconciliation?.balanced === true,
  auditChainValid: todayEvidence?.auditChainValid === true,
  liveTradingAllowed: false,
  brokerConnectivityAllowed: false,
};
console.log(`FENICE_LOCAL_PAPER_VALIDATION=${JSON.stringify(summary)}`);
