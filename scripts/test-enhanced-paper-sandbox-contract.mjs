import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(".github/workflows/fenice-enhanced-paper-manual-sandbox.yml", "utf8");
const enhanced = readFileSync("scripts/refresh-twelve-data-batch-evidence-enhanced.mjs", "utf8");
const frozen = readFileSync("scripts/refresh-twelve-data-batch-evidence.mjs", "utf8");

assert.match(workflow, /workflow_dispatch:/, "manual dispatch required");
assert.doesNotMatch(workflow, /^\s*schedule:/m, "never schedule the sandbox");
assert.match(workflow, /inputs\.confirm == 'PAPER_ONLY'/, "explicit PAPER_ONLY opt-in");
assert.match(workflow, /permissions:\s*\n\s*contents: read/, "read-only token");
assert.match(workflow, /persist-credentials: false/, "no persisted GitHub credentials");
assert.match(workflow, /refresh-twelve-data-batch-evidence-enhanced\.mjs/, "enhanced runner required");
assert.doesNotMatch(workflow, /actions\/upload-artifact|git push|git commit|directa|broker.*order/i, "no publishing or broker execution");
assert.match(enhanced, /validateFxTimestamp\(/, "future FX timestamp rejection must be used");
assert.match(enhanced, /prioritizeMissingSecondSource\(/, "independent-source priority must be used");
assert.match(enhanced, /const fx = await fetchFreshUsdEur\(\)/, "FX preflight must run before publishing");
assert.match(enhanced, /liveTradingAllowed: false/, "LIVE must be disabled");
assert.doesNotMatch(frozen, /validateFxTimestamp|prioritizeMissingSecondSource/, "V6 runner must remain frozen");
console.log("Enhanced PAPER sandbox static safety contracts: PASS (no provider execution)");
