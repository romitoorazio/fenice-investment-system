import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { V7_PHASE_B_CORE_FILES } from "../lib/trading/paper-v7-phase-b-forward-fingerprint.mjs";
import { PAPER_VALIDATION_CORE_FILES } from "../lib/trading/validation-fingerprint.mjs";

const v6 = readFileSync(".github/workflows/paper-validation.yml", "utf8");
const v7 = readFileSync(".github/workflows/v7-phase-b-forward-paper.yml", "utf8");
const runner = readFileSync("scripts/refresh-twelve-data-batch-evidence.mjs", "utf8");
const batchCmd = "node --experimental-strip-types scripts/refresh-twelve-data-batch-evidence.mjs";
const stageMarket = v7.indexOf("npm run marketdata:execution");
const stageBatch = v7.indexOf(batchCmd);
const stageFx = v7.indexOf("node scripts/refresh-paper-fx-evidence.mjs");
const stageCoverage = v7.indexOf("check-execution-market-coverage.mjs");
assert(v6.includes(batchCmd), "V6 canonical batch must stay unchanged");
assert(stageMarket > 0 && stageBatch > stageMarket, "V7 must refresh Twelve Data after market data");
assert(stageFx > stageBatch && stageCoverage > stageFx,
  "V7 must evaluate strict FX and execution coverage only after Twelve batch");
assert(v7.includes('FENICE_TWELVE_DATA_EXECUTION_PROBES: "-1"'),
  "Per-symbol Twelve API requests stay disabled; single batch respects free limits");
assert(runner.includes("isTwelveDataUsRealtimeVenue"),
  "Batch must validate provider's US realtime venue");
assert(runner.includes("classifyExecutionPaperEligibility"),
  "Batch must preserve provenance and freshness policy");
assert(runner.includes("PAPER_FX_STALE_"), "Strict 120-second FX freshness never relaxed");
assert(V7_PHASE_B_CORE_FILES.includes(".github/workflows/v7-phase-b-forward-paper.yml"),
  "Changing this workflow MUST require a new prospective, explicit V7 approval");
assert(!PAPER_VALIDATION_CORE_FILES.includes("scripts/test-v7-batch-parity-next-baseline.mjs"));
assert(v7.includes("liveTradingAllowed") === false, "Workflow must never enable broker trading");
console.log("NEXT BASELINE V7 Twelve batch parity: PASS; frozen V7 approval intentionally not modified");
