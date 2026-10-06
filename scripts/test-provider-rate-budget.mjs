import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runner = await readFile(new URL("./run-execution-market-data.mjs", import.meta.url), "utf8");
const paperWorkflow = await readFile(new URL("../.github/workflows/paper-validation.yml", import.meta.url), "utf8");

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

const batchLimit = Number((paperWorkflow.match(/FENICE_TWELVE_DATA_BATCH_PROBES:\s*"([0-9]+)"/) || [])[1]);
const basicApiCreditsPerMinute = 8;
const fxCreditsPerPaperCycle = 1;
assert(Number.isFinite(batchLimit) && batchLimit > 0, "PAPER workflow must configure a positive Twelve Data batch limit");
assert(batchLimit + fxCreditsPerPaperCycle <= basicApiCreditsPerMinute, "Twelve Data batch plus USD/EUR refresh must stay inside the Basic 8-credit/minute budget");
assert.equal(batchLimit, 6, "PAPER batch coverage is expected to use six symbols while retaining one credit/minute of headroom");

console.log("Fenice provider rate-budget invariants: PASS");
