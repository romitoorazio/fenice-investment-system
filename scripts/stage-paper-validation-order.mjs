import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateDecisionDataGate } from "../lib/trading/decision-data-gate.mjs";
import { buildPaperValidationProbe } from "./paper-validation-stager.mjs";
import { reservePaperValidationFillCap } from "./paper-validation-fill-cap.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");

async function readJson(name, fallback = null) {
  try {
    return JSON.parse(await readFile(path.join(dataDir, name), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

const [campaign, approval, marketSession, coverage, state, queue, terminal, committee, sourceHealth, intelligence] = await Promise.all([
  readJson("paper-validation-campaign.json", {}),
  readJson("paper-validation-approval.json", {}),
  readJson("paper-market-session.json", {}),
  readJson("execution-market-coverage.json", {}),
  readJson("paper-oms-state.json", {}),
  readJson("paper-order-queue.json", { version: 1, mode: "PAPER", orders: [] }),
  readJson("terminal-intelligence.json", {}),
  readJson("investment-committee.json", {}),
  readJson("global-source-health.json", {}),
  readJson("intelligence-quality.json", {}),
]);

// The stager and the pre-trade risk engine must consume the same current
// institutional decision-data boundary. A high/stale Committee snapshot must
// never be allowed to stage a probe when the freshly rebuilt intelligence
// quality has already fallen below the execution threshold. Failing here keeps
// the queue empty, preserves the daily probe budget, and lets the next healthy
// cycle try again without manufacturing a RISK_REJECTED sample.
const decisionData = evaluateDecisionDataGate({ sourceHealth, intelligence });
if (!decisionData.ready) {
  console.log(
    `Fenice PAPER validation stager: NO_ORDER reason=decision-data-not-ready; `
      + `sources=${decisionData.metrics.criticalReady}/${decisionData.metrics.criticalTotal}; `
      + `confidence=${decisionData.metrics.confidence}; checks=${decisionData.metrics.crossChecks}; `
      + `divergent=${decisionData.metrics.divergent}; concentration=${decisionData.metrics.sourceConcentrationPercent}; `
      + `sourceAge=${decisionData.metrics.sourceAgeMinutes}m; intelligenceAge=${decisionData.metrics.intelligenceAgeMinutes}m; `
      + `liveTradingAllowed=false.`,
  );
  process.exit(0);
}

const stagedResult = buildPaperValidationProbe({
  campaign,
  approval,
  marketSession,
  coverage,
  state,
  queue,
  terminal,
  committee,
});
const result = reservePaperValidationFillCap(stagedResult, approval);

if (!result.staged) {
  console.log(`Fenice PAPER validation stager: NO_ORDER reason=${result.reason}; liveTradingAllowed=false.`);
  process.exit(0);
}

await writeFile(path.join(dataDir, "paper-order-queue.json"), `${JSON.stringify(result.queue, null, 2)}\n`, "utf8");
console.log(`Fenice PAPER validation stager: STAGED id=${result.order.clientOrderId} symbol=${result.order.symbol} quantity=${result.order.quantity} maxNotionalEuro=${result.order.validationRationale.maxNotionalEuro} maxSimulatedFillNotionalEuro=${result.order.validationRationale.maxSimulatedFillNotionalEuro}; liveTradingAllowed=false.`);
