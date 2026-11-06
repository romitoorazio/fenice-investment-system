#!/usr/bin/env node
// Read-only transition preflight. Never updates campaign, approvals, or broker state.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const campaignPath = "data/paper-validation-campaign.json";
const campaignBytes = readFileSync(campaignPath);
const campaign = JSON.parse(campaignBytes.toString("utf8"));
const sha256 = createHash("sha256").update(campaignBytes).digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const baseline = String(campaign.baselineCommit || "");
if (!/^[a-f0-9]{40}$/i.test(baseline)) throw Error("V6_BASELINE_INVALID");
if (campaign.liveTradingAllowed !== false) throw Error("V6_LIVE_SAFETY_INVALID");
if (campaign.baselineFingerprint?.complete !== true) throw Error("V6_FINGERPRINT_INCOMPLETE");
const files = campaign.baselineFingerprint.files;
if (!Array.isArray(files) || !files.length || new Set(files).size !== files.length) throw Error("V6_FILE_LIST_INVALID");
if (git("cat-file", "-t", baseline) !== "commit") throw Error("V6_BASELINE_COMMIT_MISSING");
const drift = [];
for (const file of files) {
  if (file.startsWith("/") || file.split("/").includes("..")) throw Error("V6_PROTECTED_PATH_INVALID");
  let original = null, current = null;
  try { original = git("rev-parse", baseline + ":" + file); } catch {}
  try { current = git("rev-parse", "HEAD:" + file); } catch {}
  if (!original || !current || original !== current) drift.push({ file, original, current });
}
const report = {
  mode: "READ_ONLY_V6_TRANSITION_PREFLIGHT",
  baselineCommit: baseline,
  historicalCampaignSha256: sha256,
  historicalEvidenceRecords: campaign.dailyEvidence?.length ?? null,
  protectedFiles: files.length,
  drift,
  successorActivated: false,
  liveTradingAllowed: false,
  brokerConnectivityAllowed: false,
};
console.log(JSON.stringify(report, null, 2));
if (drift.length) process.exitCode = 2;
