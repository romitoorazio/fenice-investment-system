/**
 * V8 exclusive, prospective engineering PAPER sample writer.
 * Does NOT read the pre-approval lab ledger, B2, V7 or V6 historical fills.
 * Reuses the audited pure, virtual-only engine and its independent quote gates.
 */
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { runExecutionLab, replayExecutionLabLedger } from "./run-paper-execution-lab.mjs";
import { PINNED_V8_FILES } from "./run-v8-technical-evidence.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = resolve(ROOT, "data");
const read = async name => JSON.parse(await readFile(resolve(DATA, name), "utf8"));

async function main() {
  const approval = await read("paper-v8-technical-approval.json");
  if (approval.approved !== true) {
    console.log("V8 prospective sample: approval/baseline not active; no write and no credit.");
    return;
  }
  const nowIso = new Date().toISOString();
  const now = Date.parse(nowIso), start = Date.parse(approval.effectiveFrom || "");
  const end = Date.parse(approval.expiresAt || "");
  if (approval.mode !== "PAPER_TECHNICAL_V8"
    || approval.humanConfirmation !== true
    || approval.prospectiveOnly !== true || approval.allowBackfill !== false
    || approval.liveTradingAllowed !== false
    || approval.brokerConnectivityAllowed !== false
    || !Number.isFinite(start) || !Number.isFinite(end)
    || now < start || now >= end) {
    throw Error("V8_PROSPECTIVE_APPROVAL_OR_WINDOW_BLOCK");
  }
  const keys = Object.keys(approval.coreFileBlobs || {}).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...PINNED_V8_FILES].sort()))
    throw Error("V8_PINNED_FILE_SET_INVALID");
  for (const path of PINNED_V8_FILES) {
    const actual = execFileSync("git", ["hash-object", path], {
      cwd: ROOT, encoding: "utf8",
    }).trim();
    if (approval.coreFileBlobs[path] !== actual)
      throw Error("V8_PINNED_CORE_DRIFT_" + path.replace(/[^a-zA-Z0-9]/g, "_"));
  }
  const [ledger, session, coverage, executionEvidence, fx] = await Promise.all([
    "paper-v8-technical-samples.json", "paper-market-session.json",
    "execution-market-coverage.json", "execution-market-evidence.json",
    "paper-fx-evidence.json",
  ].map(read));
  const audit = replayExecutionLabLedger(ledger);
  if (!audit.valid) throw Error("V8_SAMPLE_LEDGER_INTEGRITY_" + audit.reason);
  if (ledger.events.some(event =>
    Date.parse(event.occurredAt) < start || Date.parse(event.occurredAt) >= end))
    throw Error("V8_SAMPLE_LEDGER_PREAPPROVAL_OR_OUTSIDE_WINDOW");
  const result = runExecutionLab({
    ledger, session, coverage, executionEvidence, fx, nowIso,
  });
  if (result.simulatedExecutionsAdded === 1) {
    const target = resolve(DATA, "paper-v8-technical-samples.json"), temp = target + ".tmp";
    await writeFile(temp, JSON.stringify(result.ledger, null, 2) + "\n", { mode: 0o600 });
    await rename(temp, target);
  }
  console.log(JSON.stringify({
    mode: "V8_PAPER_TECHNICAL_PROSPECTIVE_ONLY",
    state: result.status, reason: result.reason,
    newTechnicalSamples: result.simulatedExecutionsAdded,
    totalV8Samples: result.ledger.events.length,
    excludedPreviousLabSamples: true,
    countsTowardB2: false, countsTowardV6: false,
    brokerConnectivityAllowed: false, liveTradingAllowed: false,
  }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
