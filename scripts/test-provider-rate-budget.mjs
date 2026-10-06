import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runner = await readFile(new URL("./run-execution-market-data.mjs", import.meta.url), "utf8");

assert.match(runner, /FENICE_TWELVE_DATA_MIN_INTERVAL_MS/);
assert.match(runner, /FENICE_TWELVE_DATA_429_RETRIES/);
assert.match(runner, /async function waitForTwelveDataBudget\(\)/);
assert.match(runner, /async function requestTwelveData\(url\)/);
assert.match(runner, /Number\(error\?\.httpStatus\) !== 429/);
assert.match(runner, /retryAfterMs/);
assert.match(runner, /twelveDataRateLimitEvents \+= 1/);
assert.match(runner, /twelveDataRateLimitRetries \+= 1/);
assert.match(runner, /providerRateLimitsMustUsePacingAndBackoff:\s*true/);
assert.match(runner, /rateLimitRetriesNeverChangeEvidenceEligibility:\s*true/);
assert.match(runner, /classifyExecutionPaperEligibility\([\s\S]*?provenanceVerified:\s*true[\s\S]*?Date\.now\(\),\s*120\)/);
assert.match(runner, /version:\s*11/);

const defaultInterval = Number((runner.match(/FENICE_TWELVE_DATA_MIN_INTERVAL_MS \|\| ([\d_]+)/) || [])[1]?.replaceAll("_", ""));
assert(Number.isFinite(defaultInterval) && defaultInterval >= 8_000, "default Twelve Data pacing must stay conservative on the zero-cost path");

console.log("Fenice provider rate-budget invariants: PASS");
