import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = await readFile(path.join(root, ".github/workflows/paper-validation.yml"), "utf8");

const sessionIndex = workflow.indexOf("- name: Read authoritative PAPER market session");
const firstRefreshIndex = workflow.indexOf("- name: Refresh critical source health for PAPER baseline");
assert(sessionIndex >= 0, "validation workflow must read the authoritative market session");
assert(firstRefreshIndex > sessionIndex, "session gate must run before any provider refresh");

for (const stepName of [
  "Refresh critical source health for PAPER baseline",
  "Build fresh intelligence quality for PAPER baseline",
  "Refresh independent execution market evidence",
  "Refresh coherent Twelve Data batch evidence (best effort)",
  "Refresh fresh PAPER USD/EUR evidence",
  "Refresh per-symbol PAPER execution coverage",
]) {
  const escaped = stepName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(
    workflow,
    new RegExp(`- name: ${escaped}\\n\\s+if: steps\\.market_session\\.outputs\\.risk_allowed == 'true'`),
    `${stepName} must be skipped while the authoritative session is closed`,
  );
}

assert.match(
  workflow,
  /if \[ "\$\{\{ steps\.market_session\.outputs\.risk_allowed \}\}" != "true" \]; then[\s\S]*?baseline start skipped[\s\S]*?elif npm run paper:baseline:require/,
  "an inactive campaign must not start from stale evidence while the session is closed",
);
assert.match(workflow, /cron: "35 16 \* \* 0,6"/, "weekend fail-closed audit schedule must remain enabled");
assert.match(
  workflow,
  /- name: Record daily validation evidence\n\s+if: steps\.campaign\.outputs\.started == 'true'/,
  "an active campaign must retain its closed-day safety audit row",
);
assert.match(
  workflow,
  /- name: Exercise PAPER-only OMS\n\s+if: steps\.campaign\.outputs\.started == 'true' && steps\.market_session\.outputs\.risk_allowed == 'true'/,
  "OMS must remain unreachable while the session is closed",
);

console.log("Fenice PAPER validation closed-session orchestration regression: PASS.");
