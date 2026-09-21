import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendAuditEvent, verifyAuditChain } from "../lib/trading/audit-chain.ts";
import { readJsonState, writeJsonStateAtomic } from "../lib/trading/atomic-state-store.ts";
import { evaluateKillSwitch } from "../lib/trading/kill-switch.ts";
import { evaluateOperationalGates } from "../lib/trading/operational-gates.ts";
import { PaperOms } from "../lib/trading/paper-oms.ts";
import { evaluatePortfolioRisk } from "../lib/trading/portfolio-risk.ts";
import { reconcilePaperExecutions } from "../lib/trading/reconciliation.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const now = new Date();

async function readJson(name, fallback) {
  return readJsonState(path.join(dataDir, name), fallback);
}

const [queue, state, terminal, intelligence, sources, committee, executionMarket, eventRegistry] = await Promise.all([
  readJson("paper-order-queue.json", { version: 1, mode: "PAPER", orders: [] }),
  readJson("paper-oms-state.json", { version: 1, mode: "PAPER", openOrders: [], executions: [], positions: [], reconciliation: { balanced: true, breaks: [] }, auditChain: [] }),
  readJson("terminal-intelligence.json", { assets: [], capitalEuro: 0, generatedAt: null }),
  readJson("intelligence-quality.json", { intelligenceConfidence: 0, generatedAt: null, crossSourceValidation: { checks: [] } }),
  readJson("global-source-health.json", { critical: { gate: "UNKNOWN" }, sources: [] }),
  readJson("investment-committee.json", { capitalEuro: 0 }),
  readJson("execution-market-evidence.json", { version: 1, generatedAt: null, observations: [] }),
  readJson("market-risk-events.json", { version: 1, generatedAt: null, events: [] }),
]);

if (queue.mode !== "PAPER" || state.mode !== "PAPER") {
  throw new Error("FENICE_PAPER_OMS_ONLY: queue and state must remain in PAPER mode.");
}

state.executions = Array.isArray(state.executions) ? state.executions : [];
state.positions = Array.isArray(state.positions) ? state.positions : [];
state.openOrders = Array.isArray(state.openOrders) ? state.openOrders : [];
state.auditChain = Array.isArray(state.auditChain) ? state.auditChain : [];
const existingIds = new Set(state.executions.map((execution) => execution.clientOrderId));
const assets = new Map((terminal.assets || []).map((asset) => [String(asset.symbol || "").toUpperCase(), asset]));
const checks = Array.isArray(intelligence?.crossSourceValidation?.checks) ? intelligence.crossSourceValidation.checks : [];
const executionObservations = Array.isArray(executionMarket?.observations) ? executionMarket.observations : [];
const riskEvents = Array.isArray(eventRegistry?.events) ? eventRegistry.events : [];
const staleCriticalSources = Array.isArray(sources.sources)
  ? sources.sources.filter((source) => source?.critical === true && (source?.stale === true || source?.status === "failed")).length
  : 0;
const intelligenceAgeHours = Number.isFinite(Date.parse(intelligence.generatedAt || ""))
  ? Math.max(0, (now.getTime() - Date.parse(intelligence.generatedAt)) / 3_600_000)
  : Number.POSITIVE_INFINITY;
const auditBefore = verifyAuditChain(state.auditChain);

function findValidation(symbol) {
  const prefix = `${String(symbol).toUpperCase()}:`;
  return checks.find((check) => String(check.instrument || "").toUpperCase().startsWith(prefix));
}

function findExecutionEvidence(symbol, currency) {
  const normalizedSymbol = String(symbol || "").toUpperCase();
  const normalizedCurrency = String(currency || "").toUpperCase();
  return executionObservations
    .filter((item) => String(item?.symbol || "").toUpperCase() === normalizedSymbol)
    .filter((item) => !normalizedCurrency || String(item?.currency || "").toUpperCase() === normalizedCurrency)
    .map((item) => ({
      source: item.source,
      sourceFamily: item.sourceFamily,
      eligibility: item.eligibility,
      price: Number(item.price),
      observedAt: item.observedAt,
    }));
}

function latestObservedAt(evidence, fallback) {
  const timestamps = evidence
    .map((item) => Date.parse(String(item?.observedAt || "")))
    .filter(Number.isFinite);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : fallback;
}

function grossExposureEuro() {
  return state.positions.reduce((sum, position) => {
    const asset = assets.get(String(position.symbol || "").toUpperCase());
    const price = Number(asset?.price);
    const fx = Number(position.fxToEuro);
    const quantity = Number(position.quantity);
    return Number.isFinite(price) && Number.isFinite(fx) && Number.isFinite(quantity)
      ? sum + Math.abs(quantity * price * fx)
      : sum;
  }, 0);
}

function todaysTurnoverEuro() {
  const date = now.toISOString().slice(0, 10);
  return state.executions
    .filter((execution) => execution.status === "PAPER_FILLED" && String(execution.filledAt || "").startsWith(date))
    .reduce((sum, execution) => sum + Math.abs(Number(execution.notionalEuro) || 0), 0);
}

function existingPosition(symbol) {
  return state.positions.find((position) => String(position.symbol || "").toUpperCase() === String(symbol).toUpperCase());
}

function projectedPortfolioRisk(queued, referencePrice, fxToEuro, capitalEuro) {
  const projected = new Map();
  for (const position of state.positions) {
    const symbol = String(position.symbol || "").toUpperCase();
    const asset = assets.get(symbol) || {};
    const price = Number(asset.price);
    const fx = Number(position.fxToEuro);
    const quantity = Number(position.quantity);
    if (!symbol || !Number.isFinite(price) || price <= 0 || !Number.isFinite(fx) || fx <= 0 || !Number.isFinite(quantity)) continue;
    projected.set(symbol, {
      symbol,
      notionalEuro: Math.abs(quantity * price * fx),
      sector: String(asset.sector || asset.industry || "UNKNOWN"),
      assetClass: String(asset.assetClass || asset.category || "UNKNOWN"),
    });
  }

  const symbol = String(queued.symbol || "").toUpperCase();
  const asset = assets.get(symbol) || {};
  const delta = Math.abs(Number(queued.quantity) * referencePrice * fxToEuro);
  const existing = projected.get(symbol) || {
    symbol,
    notionalEuro: 0,
    sector: String(asset.sector || asset.industry || "UNKNOWN"),
    assetClass: String(asset.assetClass || asset.category || "UNKNOWN"),
  };
  existing.notionalEuro = queued.side === "SELL"
    ? Math.max(0, existing.notionalEuro - delta)
    : existing.notionalEuro + delta;
  if (existing.notionalEuro > 0) projected.set(symbol, existing);
  else projected.delete(symbol);

  return evaluatePortfolioRisk(capitalEuro, [...projected.values()]);
}

function updatePosition(execution, fxToEuro) {
  if (execution.status !== "PAPER_FILLED" || execution.fillPrice === null) return;
  const symbol = String(execution.symbol).toUpperCase();
  let position = existingPosition(symbol);
  if (!position) {
    position = { symbol, quantity: 0, averagePrice: 0, currency: "UNKNOWN", fxToEuro };
    state.positions.push(position);
  }
  const oldQuantity = Number(position.quantity) || 0;
  const signed = execution.side === "BUY" ? execution.filledQuantity : -execution.filledQuantity;
  const newQuantity = oldQuantity + signed;
  if (execution.side === "BUY" && newQuantity > 0) {
    position.averagePrice = ((oldQuantity * Number(position.averagePrice || 0)) + (execution.filledQuantity * execution.fillPrice)) / newQuantity;
  }
  position.quantity = Number(newQuantity.toFixed(8));
  position.fxToEuro = fxToEuro;
  if (Math.abs(position.quantity) <= 1e-8) {
    state.positions = state.positions.filter((item) => item !== position);
  }
}

const oms = new PaperOms();
const remaining = [];
let processed = 0;

for (const queued of Array.isArray(queue.orders) ? queue.orders : []) {
  if (!queued?.clientOrderId || existingIds.has(queued.clientOrderId)) continue;
  const symbol = String(queued.symbol || "").toUpperCase();
  const asset = assets.get(symbol);
  const fxToEuro = Number(queued.fxToEuro);
  if (!asset || !Number.isFinite(Number(asset.price)) || !Number.isFinite(fxToEuro) || fxToEuro <= 0) {
    remaining.push(queued);
    continue;
  }

  const currency = String(asset.currency || queued.currency || "UNKNOWN").toUpperCase();
  const assetClass = String(asset.assetClass || asset.category || "UNKNOWN");
  const evidence = findExecutionEvidence(symbol, currency);
  const operationalGate = evaluateOperationalGates({
    marketEvidence: evidence,
    events: riskEvents,
    eventContext: { symbol, currency, assetClass },
    now: now.getTime(),
  });
  const validation = findValidation(symbol);
  const independentSources = operationalGate.marketData.independentSources;
  const dataConfidence = Math.min(Number(asset.confidence || 0), Number(intelligence.intelligenceConfidence || 0));
  const auditIntegrity = verifyAuditChain(state.auditChain);
  const killSwitch = evaluateKillSwitch({
    manualEngaged: state.killSwitch?.manualEngaged === true,
    reconciliationBreaks: Array.isArray(state.reconciliation?.breaks) ? state.reconciliation.breaks.length : 0,
    consecutiveExecutionErrors: Number(state.consecutiveExecutionErrors || 0),
    staleCriticalSources,
    dailyLossPercent: Number(state.dailyLossPercent || 0),
    dataConfidence,
    auditChainValid: auditIntegrity.valid,
  });

  const referencePrice = Number(operationalGate.marketData.medianPrice ?? asset.price);
  const position = existingPosition(symbol);
  const existingPositionNotionalEuro = position
    ? Math.abs(Number(position.quantity) * referencePrice * Number(position.fxToEuro || fxToEuro))
    : 0;
  const baseCapitalEuro = Number(committee.capitalEuro || terminal.capitalEuro || 0);
  const portfolioRisk = projectedPortfolioRisk(queued, referencePrice, fxToEuro, baseCapitalEuro);
  const order = {
    clientOrderId: queued.clientOrderId,
    symbol,
    side: queued.side,
    orderType: queued.orderType,
    timeInForce: queued.timeInForce,
    quantity: Number(queued.quantity),
    referencePrice,
    ...(queued.limitPrice === undefined ? {} : { limitPrice: Number(queued.limitPrice) }),
    currency,
    mode: "PAPER",
    requestedAt: queued.requestedAt || now.toISOString(),
    humanConfirmed: queued.humanConfirmed === true,
  };
  const context = {
    capitalEuro: baseCapitalEuro * operationalGate.riskMultiplier,
    fxToEuro,
    existingPositionNotionalEuro,
    currentGrossExposureEuro: grossExposureEuro(),
    dailyTurnoverEuro: todaysTurnoverEuro(),
    openOrders: state.openOrders.length,
    dataConfidence,
    independentSources,
    riskScore: Number(asset.riskScore ?? 100),
    quoteObservedAt: latestObservedAt(evidence, asset?.technical?.observedAt || terminal.generatedAt || ""),
    dataDivergent: validation?.status === "divergente" || operationalGate.marketData.allowNewRisk === false,
    sourceStale: intelligenceAgeHours > 24 || sources?.critical?.gate !== "GREEN" || operationalGate.marketData.allowNewRisk === false,
    killSwitchEngaged: killSwitch.engaged || operationalGate.allowNewRisk === false || portfolioRisk.allowNewRisk === false,
    brokerConnectivityAllowed: false,
    liveTradingReleased: false,
  };

  const execution = oms.submit(order, context, now.getTime());
  state.executions.push(execution);
  existingIds.add(execution.clientOrderId);
  updatePosition(execution, fxToEuro);
  state.auditChain = appendAuditEvent(state.auditChain, {
    timestamp: now.toISOString(),
    eventType: execution.status,
    entityId: execution.clientOrderId,
    payload: {
      symbol: execution.symbol,
      side: execution.side,
      filledQuantity: execution.filledQuantity,
      fillPrice: execution.fillPrice,
      riskAllowed: execution.risk.allowed,
      reasons: execution.risk.reasons,
      operationalGate: {
        state: operationalGate.state,
        riskMultiplier: operationalGate.riskMultiplier,
        marketDataState: operationalGate.marketData.state,
        marketDataSources: operationalGate.marketData.independentSources,
        marketDataSourceFamilies: operationalGate.marketData.sourceFamilies,
        marketDataRequiredEligibility: operationalGate.marketData.requiredEligibility,
        marketDataIneligibleEvidence: operationalGate.marketData.ineligibleEvidence,
        marketDataSpreadPercent: operationalGate.marketData.maxSpreadPercent,
        eventRiskState: operationalGate.eventRisk.state,
        reasons: operationalGate.reasons,
      },
      portfolioRisk: {
        state: portfolioRisk.state,
        riskMultiplier: portfolioRisk.riskMultiplier,
        grossExposurePercent: portfolioRisk.grossExposurePercent,
        largestPositionPercent: portfolioRisk.largestPositionPercent,
        largestSectorPercent: portfolioRisk.largestSectorPercent,
        largestAssetClassPercent: portfolioRisk.largestAssetClassPercent,
        capitalHhi: portfolioRisk.capitalHhi,
        weightedAbsCorrelation: portfolioRisk.weightedAbsCorrelation,
        maxCorrelatedClusterPercent: portfolioRisk.maxCorrelatedClusterPercent,
        reasons: portfolioRisk.reasons,
      },
    },
  });
  processed += 1;
}

const expectedPositions = state.positions.map((position) => ({
  symbol: position.symbol,
  quantity: position.quantity,
  averagePrice: position.averagePrice,
  currency: position.currency || "UNKNOWN",
}));
const reconciliation = reconcilePaperExecutions([], state.executions, expectedPositions);
const auditAfter = verifyAuditChain(state.auditChain);
const finalKillSwitch = evaluateKillSwitch({
  manualEngaged: state.killSwitch?.manualEngaged === true,
  reconciliationBreaks: reconciliation.breaks.length,
  consecutiveExecutionErrors: Number(state.consecutiveExecutionErrors || 0),
  staleCriticalSources,
  dailyLossPercent: Number(state.dailyLossPercent || 0),
  dataConfidence: Number(intelligence.intelligenceConfidence || 0),
  auditChainValid: auditBefore.valid && auditAfter.valid,
});

state.generatedAt = now.toISOString();
state.reconciliation = reconciliation;
state.killSwitch = { ...finalKillSwitch, manualEngaged: state.killSwitch?.manualEngaged === true };
state.operational = true;
state.liveTradingAllowed = false;
state.brokerConnectivityAllowed = false;
state.executionDataGeneratedAt = executionMarket.generatedAt || null;
state.marketRiskEventsGeneratedAt = eventRegistry.generatedAt || null;

// State is committed before queue acknowledgement. If the process crashes
// between these two writes, idempotent clientOrderId recovery prevents a
// duplicate execution on the next run.
await writeJsonStateAtomic(path.join(dataDir, "paper-oms-state.json"), state);
await writeJsonStateAtomic(path.join(dataDir, "paper-order-queue.json"), { ...queue, orders: remaining });
console.log(`Fenice Paper OMS: processed=${processed}, remaining=${remaining.length}, executions=${state.executions.length}, positions=${state.positions.length}, killSwitch=${state.killSwitch.engaged ? "ON" : "OFF"}.`);
