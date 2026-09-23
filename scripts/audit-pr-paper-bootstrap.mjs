import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyPaperBootstrapAudit } from "../lib/trading/paper-bootstrap-audit.mjs";
import { evaluatePaperBaselineEligibility } from "../lib/trading/paper-baseline.mjs";
import {
  computePaperValidationFingerprint,
  validationFingerprintMatches,
} from "../lib/trading/validation-fingerprint.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "data", "pr-paper-bootstrap-audit.json");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

async function writeAudit(report) {
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function runNodeScript(relativePath) {
  return spawnSync(process.execPath, [path.join(root, relativePath)], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
}

function assertCampaign(campaign) {
  const fingerprint = campaign?.baselineFingerprint;
  const gates = campaign?.baselineEligibility?.gates || {};
  const requiredGates = [
    "criticalSources",
    "dataQuality",
    "executionMarketData",
    "executionMarketProvenancePolicy",
    "executionSymbolCoverage",
    "zeroCostPaperPolicy",
    "liveTradingLocked",
    "validationFingerprint",
  ];
  if (!campaign?.startedAt || !/^[a-f0-9]{40}$/i.test(String(campaign?.baselineCommit || ""))) {
    throw new Error("PAPER_BOOTSTRAP_FAILURE: missing immutable start timestamp or baseline commit");
  }
  if (Number(campaign?.version || 0) < 5) throw new Error("PAPER_BOOTSTRAP_FAILURE: campaign schema is too old");
  if (campaign?.liveTradingAllowed !== false) throw new Error("PAPER_BOOTSTRAP_SAFETY: live trading must remain false");
  if (fingerprint?.complete !== true || fingerprint?.algorithm !== "sha256" || !/^[a-f0-9]{64}$/i.test(String(fingerprint?.digest || ""))) {
    throw new Error("PAPER_BOOTSTRAP_FAILURE: immutable core fingerprint is incomplete");
  }
  for (const gate of requiredGates) {
    if (gates[gate] !== true) throw new Error(`PAPER_BOOTSTRAP_FAILURE: baseline gate ${gate} is not true`);
  }
  if (campaign?.evidencePolicy?.directaPaidRealtimeRequired !== false
    || campaign?.evidencePolicy?.directaEvidenceOptionalForPaperCertification !== true
    || campaign?.evidencePolicy?.validationOnlyEvidenceCannotSatisfyPaperQuorum !== true) {
    throw new Error("PAPER_BOOTSTRAP_FAILURE: zero-cost provider-neutral evidence policy not preserved");
  }
}

async function main() {
  const [session, sources, intelligence, executionMarket, executionCoverage, governance, fingerprint, existingCampaign] = await Promise.all([
    readJson("data/paper-market-session.json"),
    readJson("data/global-source-health.json"),
    readJson("data/intelligence-quality.json"),
    readJson("data/execution-market-evidence.json"),
    readJson("data/execution-market-coverage.json"),
    readJson("data/decision-governance.json"),
    computePaperValidationFingerprint(root),
    readJson("data/paper-validation-campaign.json"),
  ]);

  const baselineEligibility = evaluatePaperBaselineEligibility({
    sources,
    intelligence,
    executionMarket,
    executionCoverage,
    governance,
    fingerprint,
  });
  const classification = classifyPaperBootstrapAudit(session, baselineEligibility, { maxSessionAgeSeconds: 120 });
  const audit = {
    version: 2,
    generatedAt: new Date().toISOString(),
    auditedCommit: process.env.GITHUB_SHA || null,
    status: classification.status,
    campaignStartAllowed: classification.campaignStartAllowed,
    campaignStarted: false,
    marketSession: {
      state: classification.state,
      authoritative: classification.authoritative,
      fresh: classification.fresh,
      ageSeconds: Number(session?.decision?.ageSeconds ?? 999999),
      nextOpen: session?.nextOpen || null,
      nextClose: session?.nextClose || null,
    },
    baseline: {
      eligible: baselineEligibility.eligible === true,
      reasons: baselineEligibility.reasons || [],
      gates: baselineEligibility.gates || {},
    },
    reason: classification.reason,
    liveTradingAllowed: false,
  };

  const alreadyStarted = Boolean(existingCampaign?.startedAt && existingCampaign?.baselineCommit);
  if (alreadyStarted) {
    assertCampaign(existingCampaign);
    if (!validationFingerprintMatches(existingCampaign.baselineFingerprint, fingerprint)) {
      await writeAudit({
        ...audit,
        status: "ACTIVE_CAMPAIGN_CORE_DRIFT",
        campaignStarted: true,
        baselineCommit: existingCampaign.baselineCommit,
        baselineFingerprint: existingCampaign.baselineFingerprint?.digest || null,
        currentFingerprint: fingerprint?.digest || null,
        reason: "persisted PAPER campaign fingerprint no longer matches the current validated core",
      });
      throw new Error("PAPER_BOOTSTRAP_FAILURE: active campaign core fingerprint drift detected");
    }
    const status = runNodeScript("scripts/check-paper-validation-campaign.mjs");
    if (status.status !== 0) {
      await writeAudit({ ...audit, status: "ACTIVE_CAMPAIGN_INVALID", campaignStarted: true, reason: `campaign status exited with ${status.status}` });
      throw new Error(`PAPER_BOOTSTRAP_FAILURE: active campaign status exited with ${status.status}`);
    }
    const completed = {
      ...audit,
      status: "CAMPAIGN_ACTIVE_PROVEN",
      campaignStartAllowed: false,
      campaignStarted: true,
      baselineCommit: existingCampaign.baselineCommit,
      baselineFingerprint: existingCampaign.baselineFingerprint?.digest || null,
      currentFingerprint: fingerprint?.digest || null,
      reason: "persisted PAPER campaign is active and its immutable core fingerprint matches the current validated core",
    };
    await writeAudit(completed);
    console.log(`Fenice PAPER active-campaign audit: PASS; version=${existingCampaign.version}; baseline=${existingCampaign.baselineCommit.slice(0, 12)}; fingerprint=${String(existingCampaign.baselineFingerprint?.digest || "").slice(0, 12)}; liveTradingAllowed=false.`);
    return;
  }

  if (classification.status === "WAIT_MARKET_OPEN") {
    await writeAudit(audit);
    console.log(`Fenice PR PAPER bootstrap audit: WAIT_MARKET_OPEN; nextOpen=${audit.marketSession.nextOpen || "unknown"}; campaignStarted=false.`);
    return;
  }

  if (classification.status !== "BOOTSTRAP_REQUIRED") {
    await writeAudit(audit);
    throw new Error(`PAPER_BOOTSTRAP_AUDIT_${classification.status}: ${classification.reason}`);
  }

  const start = runNodeScript("scripts/start-paper-validation-campaign.mjs");
  if (start.status !== 0) {
    await writeAudit({ ...audit, status: "BOOTSTRAP_FAILED", reason: `start script exited with ${start.status}` });
    throw new Error(`PAPER_BOOTSTRAP_FAILURE: start script exited with ${start.status}`);
  }

  const campaign = await readJson("data/paper-validation-campaign.json");
  assertCampaign(campaign);
  const status = runNodeScript("scripts/check-paper-validation-campaign.mjs");
  if (status.status !== 0) {
    await writeAudit({ ...audit, status: "BOOTSTRAP_FAILED", reason: `campaign status exited with ${status.status}` });
    throw new Error(`PAPER_BOOTSTRAP_FAILURE: campaign status exited with ${status.status}`);
  }

  const completed = {
    ...audit,
    status: "BOOTSTRAP_PROVEN",
    campaignStarted: true,
    baselineCommit: campaign.baselineCommit,
    baselineFingerprint: campaign.baselineFingerprint?.digest || null,
  };
  await writeAudit(completed);
  console.log(`Fenice PAPER bootstrap dry-run: PASS; version=${campaign.version}; baseline=${campaign.baselineCommit.slice(0, 12)}; liveTradingAllowed=false.`);
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
