import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checker = await readFile(path.join(root, "scripts/check-paper-open-readiness.mjs"), "utf8");
const workflow = await readFile(path.join(root, ".github/workflows/paper-open-readiness.yml"), "utf8");

assert.match(checker, /readJson\("data\/paper-market-fx\.json"\)/, "readiness must load current PAPER FX evidence");
assert.match(checker, /readJson\("data\/paper-validation-approval\.json"\)/, "readiness must load PAPER approval policy");
assert.match(checker, /evaluatePaperBaselineEligibility\(\{[\s\S]*?fxEvidence,[\s\S]*?approval,[\s\S]*?fingerprint,[\s\S]*?\}\)/, "readiness must pass FX evidence and approval into baseline evaluation");

assert.match(workflow, /id: session_gate[\s\S]*?market_open=\$\{open\}/, "workflow must derive an authoritative open-session gate before provider refreshes");

for (const stepName of [
  "Refresh critical source health",
  "Build fresh intelligence quality",
  "Build fresh base execution evidence",
  "Refresh coherent Twelve Data batch evidence",
  "Measure per-symbol PAPER coverage",
]) {
  const escaped = stepName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(
    workflow,
    new RegExp(`- name: ${escaped}\\n\\s+if: steps\\.session_gate\\.outputs\\.market_open == 'true'`),
    `${stepName} must be skipped when the authoritative market session is not open`,
  );
}

assert.match(workflow, /data\/paper-market-fx\.json/, "readiness artifact must retain the FX evidence used by the gate");

console.log("Fenice PAPER open-readiness orchestration regression: PASS.");
