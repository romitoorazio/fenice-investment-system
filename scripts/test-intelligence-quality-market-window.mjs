import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflow = await readFile(path.join(root, ".github/workflows/intelligence-quality.yml"), "utf8");

assert.match(
  workflow,
  /id: execution_session[\s\S]*paper-probe-request-window\.mjs[\s\S]*--github-output "\$GITHUB_OUTPUT"/,
  "Intelligence Quality must compute a deterministic regular-session gate before execution provider calls",
);

for (const stepName of [
  "Build independent execution market evidence",
  "Measure per-symbol PAPER execution quorum coverage",
]) {
  const escapedName = stepName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(
    workflow,
    new RegExp(`- name: ${escapedName}\\n\\s+if: steps\\.execution_session\\.outputs\\.allowed == 'true'`),
    `${stepName} must be skipped outside the regular New York session`,
  );
}

assert.match(
  workflow,
  /EXECUTION_SESSION_OPEN: \$\{\{ steps\.execution_session\.outputs\.allowed \}\}/,
  "Validation must receive the execution-session result",
);
assert.match(
  workflow,
  /executionSessionOpen && \(!Number\.isFinite\(executionAge\)/,
  "Execution evidence freshness may only be required when providers were refreshed",
);
assert.match(
  workflow,
  /executionSessionOpen && \(!Number\.isFinite\(coverageAge\)/,
  "Execution coverage freshness may only be required when providers were refreshed",
);

const publishBlock = workflow.split("- name: Publish refreshed quality evidence")[1] || "";
assert.match(
  publishBlock,
  /if \[ "\$EXECUTION_SESSION_OPEN" = "true" \]; then[\s\S]*cp data\/execution-market-evidence\.json[\s\S]*cp data\/execution-market-coverage\.json/,
  "Closed-market runs must not stage execution-provider artifacts for publication",
);
assert.match(
  publishBlock,
  /if \[ "\$EXECUTION_SESSION_OPEN" = "true" \]; then[\s\S]*git add data\/execution-market-evidence\.json data\/execution-market-coverage\.json/,
  "Closed-market runs must not republish stale execution-provider artifacts",
);

console.log("Intelligence Quality closed-market provider budget invariants: PASS");
