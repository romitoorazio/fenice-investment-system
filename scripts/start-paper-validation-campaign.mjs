import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { computePaperValidationFingerprint } from "../lib/trading/validation-fingerprint.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const campaignPath = path.join(root, "data", "paper-validation-campaign.json");
const statePath = path.join(root, "data", "paper-oms-state.json");

async function resolveCommit() {
  const envSha = String(process.env.GITHUB_SHA || "").trim();
  if (/^[a-f0-9]{40}$/i.test(envSha)) return envSha.toLowerCase();
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
  const sha = String(stdout || "").trim();
  if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error("PAPER_CAMPAIGN_BASELINE_SHA_INVALID");
  return sha.toLowerCase();
}

const campaign = JSON.parse(await readFile(campaignPath, "utf8"));
const state = JSON.parse(await readFile(statePath, "utf8"));

if (campaign?.startedAt || campaign?.baselineCommit) {
  throw new Error("PAPER_CAMPAIGN_ALREADY_STARTED: existing campaign must not be silently reset or backdated.");
}
if (campaign?.liveTradingAllowed !== false) {
  throw new Error("PAPER_CAMPAIGN_SAFETY: liveTradingAllowed must be false before campaign start.");
}
if (state?.mode !== "PAPER" || state?.liveTradingAllowed === true || state?.brokerConnectivityAllowed === true) {
  throw new Error("PAPER_CAMPAIGN_SAFETY: OMS must be PAPER-only with broker writes disabled.");
}

const fingerprint = await computePaperValidationFingerprint(root);
if (!fingerprint.complete) {
  throw new Error(`PAPER_CAMPAIGN_FINGERPRINT_INCOMPLETE: ${fingerprint.missingFiles.join(",")}`);
}

const baselineCommit = await resolveCommit();
const startedAt = new Date().toISOString();
const next = {
  ...campaign,
  version: Math.max(2, Number(campaign?.version || 1)),
  startedAt,
  baselineCommit,
  baselineFingerprint: fingerprint,
  liveTradingAllowed: false,
  dailyEvidence: [],
};

await writeFile(campaignPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
console.log(`Fenice paper validation campaign started at ${startedAt}; baseline=${baselineCommit.slice(0, 12)}; coreFingerprint=${fingerprint.digest.slice(0, 12)}.`);
