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

const [campaign, approval, marketSession, coverage, state, queue, terminal, committee, sourceHealth, intelligence, fxEvidence] = await Promise.all([
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
  readJson("paper-fx-evidence.json", {}),
]);

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

const fxPolicy = approval?.fxPolicy || {};
const maxFxAgeSeconds = Math.max(1, Number(fxPolicy.maxAgeSeconds || 120));
const usd = fxEvidence?.ratesToEuro?.USD;
const usdObservedMs = Date.parse(String(usd?.observedAt || ""));
const usdAgeSeconds = Number.isFinite(usdObservedMs) ? Math.max(0, (Date.now() - usdObservedMs) / 1000) : Number.POSITIVE_INFINITY;
const fxReady = fxEvidence?.provider === "twelve-data"
  && fxEvidence?.provenanceVerified === true
  && fxEvidence?.liveTradingAllowed === false
  && fxEvidence?.brokerConnectivityAllowed === false
  && Number.isFinite(Number(usd?.rate))
  && Number(usd.rate) > 0
  && usdAgeSeconds <= maxFxAgeSeconds;

if (fxPolicy?.requiredForNonEuro === true && !fxReady) {
  console.log(`Fenice PAPER validation stager: NO_ORDER reason=market-fx-not-ready; usdAgeSeconds=${Number.isFinite(usdAgeSeconds) ? usdAgeSeconds.toFixed(1) : "inf"}; liveTradingAllowed=false.`);
  process.exit(0);
}

// The pure stager historically consumes riskFxToEuroByCurrency. In v6 the
// wrapper injects verified market conversion rates at runtime so fxToEuro is an
// economic conversion, never a synthetic stress factor.
const runtimeApproval = {
  ...approval,
  riskFxToEuroByCurrency: {
    EUR: 1,
    ...(fxReady ? { USD: Number(usd.rate) } : {}),
  },
};

const stagedResult = buildPaperValidationProbe({
  campaign,
  approval: runtimeApproval,
  marketSession,
  coverage,
  state,
  queue,
  terminal,
  committee,
});
const result = reservePaperValidationFillCap(stagedResult, runtimeApproval);

if (!result.staged) {
  console.log(`Fenice PAPER validation stager: NO_ORDER reason=${result.reason}; liveTradingAllowed=false.`);
  process.exit(0);
}

result.order.validationRationale.fxProvider = fxReady ? "twelve-data" : "identity";
result.order.validationRationale.fxObservedAt = result.order.currency === "EUR" ? new Date().toISOString() : usd.observedAt;
result.order.validationRationale.fxAgeSeconds = result.order.currency === "EUR" ? 0 : Number(usdAgeSeconds.toFixed(1));
result.order.validationRationale.marketFxToEuro = result.order.fxToEuro;

await writeFile(path.join(dataDir, "paper-order-queue.json"), `${JSON.stringify(result.queue, null, 2)}\n`, "utf8");
console.log(`Fenice PAPER validation stager: STAGED id=${result.order.clientOrderId} symbol=${result.order.symbol} quantity=${result.order.quantity} fxToEuro=${result.order.fxToEuro} maxNotionalEuro=${result.order.validationRationale.maxNotionalEuro} maxSimulatedFillNotionalEuro=${result.order.validationRationale.maxSimulatedFillNotionalEuro}; liveTradingAllowed=false.`);
