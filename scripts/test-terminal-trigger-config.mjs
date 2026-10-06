import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/terminal.yml", "utf8");

assert.match(
  workflow,
  /workflow_run:\n\s+workflows: \["Fenice Foundation"\]\n\s+types: \[completed\]\n\s+branches: \[main\]/,
  "World Terminal must refresh after a successful Foundation workflow",
);
assert.match(
  workflow,
  /if: \$\{\{ github\.event_name != 'workflow_run' \|\| github\.event\.workflow_run\.conclusion == 'success' \}\}/,
  "failed or cancelled Foundation runs must not refresh World Terminal",
);

assert.doesNotMatch(
  workflow,
  /^  schedule:/m,
  "World Terminal must not schedule a second refresh independently of Foundation",
);

const pushPaths = workflow.match(/  push:\n[\s\S]*?    paths:\n([\s\S]*?)\n\npermissions:/)?.[1] ?? "";
assert.ok(pushPaths, "terminal push path configuration must remain present");
assert.doesNotMatch(
  pushPaths,
  /data\/(?:fundamental-research|global-source-health)\.json/,
  "Foundation output files must not also dispatch World Terminal through push",
);
assert.match(pushPaths, /scripts\/run-terminal-engine\.mjs/, "terminal code changes must still trigger validation");
assert.match(
  workflow,
  /Verify Foundation-to-Terminal trigger is not duplicated\n\s+run: node scripts\/test-terminal-trigger-config\.mjs/,
  "the trigger regression must run inside World Terminal",
);

console.log("World Terminal trigger deduplication tests: PASS");
