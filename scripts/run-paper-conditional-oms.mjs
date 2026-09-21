import path from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonState, writeJsonStateAtomic } from "../lib/trading/atomic-state-store.ts";
import { createLongBracketOco, createOcoState } from "../lib/trading/conditional-orders.ts";
import { evaluateOperationalGates } from "../lib/trading/operational-gates.ts";
import {
  applyPaperConditionalMarketObservation,
  normalizePaperConditionalBook,
  registerPaperConditionalOrder,
  registerPaperOco,
} from "../lib/trading/paper-conditional-book.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");
const now = new Date();

async function readJson(name, fallback) {
  return readJsonState(path.join(dataDir, name), fallback);
}

const [queue, state, executionMarket, eventRegistry, paperQueue] = await Promise.all([
  readJson("paper-conditional-queue.json", { version: 1, mode: "PAPER", intents: [] }),
  readJson("paper-conditional-state.json", { version: 1, mode: "PAPER", book: { singles: [], ocoGroups: [] }, metadata: {}, generatedAt: null }),
  readJson("execution-market-evidence.json", { version: 1, observations: [] }),
  readJson("market-risk-events.json", { version: 1, events: [] }),
  readJson("paper-order-queue.json", { version: 1, mode: "PAPER", orders: [] }),
]);

if (queue.mode !== "PAPER" || state.mode !== "PAPER" || paperQueue.mode !== "PAPER") {
  throw new Error("FENICE_PAPER_ONLY: conditional and immediate queues must remain PAPER.");
}

state.book = normalizePaperConditionalBook(state.book);
state.metadata = state.metadata && typeof state.metadata === "object" ? state.metadata : {};
const observations = Array.isArray(executionMarket.observations) ? executionMarket.observations : [];
const events = Array.isArray(eventRegistry.events) ? eventRegistry.events : [];
const immediateOrders = Array.isArray(paperQueue.orders) ? paperQueue.orders : [];
const existingImmediateIds = new Set(immediateOrders.map((order) => order?.clientOrderId).filter(Boolean));
const remainingIntents = [];
let registered = 0;

function validMeta(intent) {
  const fxToEuro = Number(intent?.fxToEuro);
  return intent?.humanConfirmed === true && Number.isFinite(fxToEuro) && fxToEuro > 0;
}

function setMeta(id, intent, overrides = {}) {
  state.metadata[id] = {
    currency: String(overrides.currency || intent.currency || "UNKNOWN").toUpperCase(),
    fxToEuro: Number(intent.fxToEuro),
    humanConfirmed: intent.humanConfirmed === true,
    requestedAt: intent.requestedAt || now.toISOString(),
    assetClass: overrides.assetClass || intent.assetClass || "UNKNOWN",
  };
}

for (const intent of Array.isArray(queue.intents) ? queue.intents : []) {
  try {
    if (!intent?.kind || !intent?.symbol || !validMeta(intent)) throw new Error("INVALID_CONDITIONAL_INTENT_META");
    const kind = String(intent.kind).toUpperCase();
    if (["STOP", "STOP_LIMIT", "TRAILING_STOP", "LIMIT"].includes(kind)) {
      if (!intent.clientOrderId) throw new Error("MISSING_CLIENT_ORDER_ID");
      state.book = registerPaperConditionalOrder(state.book, {
        clientOrderId: String(intent.clientOrderId),
        symbol: String(intent.symbol).toUpperCase(),
        side: intent.side,
        kind,
        quantity: Number(intent.quantity),
        ...(intent.limitPrice === undefined ? {} : { limitPrice: Number(intent.limitPrice) }),
        ...(intent.stopPrice === undefined ? {} : { stopPrice: Number(intent.stopPrice) }),
        ...(intent.trailPercent === undefined ? {} : { trailPercent: Number(intent.trailPercent) }),
        ...(intent.trailAmount === undefined ? {} : { trailAmount: Number(intent.trailAmount) }),
      }, Number(intent.initialMarketPrice));
      setMeta(String(intent.clientOrderId), intent);
    } else if (kind === "OCO") {
      const groupId = String(intent.groupId || intent.clientOrderId || "");
      if (!groupId || !intent.first || !intent.second) throw new Error("INVALID_OCO_INTENT");
      const first = { ...intent.first, symbol: String(intent.symbol).toUpperCase(), quantity: Number(intent.first.quantity ?? intent.quantity) };
      const second = { ...intent.second, symbol: String(intent.symbol).toUpperCase(), quantity: Number(intent.second.quantity ?? intent.quantity) };
      const group = createOcoState(groupId, first, second, Number(intent.initialMarketPrice));
      state.book = registerPaperOco(state.book, group);
      setMeta(first.clientOrderId, intent);
      setMeta(second.clientOrderId, intent);
    } else if (kind === "BRACKET") {
      const groupId = String(intent.groupId || intent.clientOrderId || "");
      if (!groupId) throw new Error("INVALID_BRACKET_INTENT");
      const group = createLongBracketOco({
        groupId,
        symbol: String(intent.symbol).toUpperCase(),
        quantity: Number(intent.quantity),
        takeProfitPrice: Number(intent.takeProfitPrice),
        stopLossPrice: Number(intent.stopLossPrice),
        initialMarketPrice: Number(intent.initialMarketPrice),
      });
      state.book = registerPaperOco(state.book, group);
      setMeta(group.first.order.clientOrderId, intent);
      setMeta(group.second.order.clientOrderId, intent);
    } else {
      throw new Error("UNSUPPORTED_CONDITIONAL_INTENT_KIND");
    }
    registered += 1;
  } catch (error) {
    remainingIntents.push({ ...intent, lastError: String(error?.message || "INVALID_CONDITIONAL_INTENT").slice(0, 120) });
  }
}

const symbols = new Set();
for (const item of state.book.singles) if (item.status === "WORKING") symbols.add(String(item.order.symbol).toUpperCase());
for (const group of state.book.ocoGroups) if (group.status === "WORKING") symbols.add(String(group.first.order.symbol).toUpperCase());

let activated = 0;
let blocked = false;
const blockedReasons = [];
for (const symbol of symbols) {
  const metadataEntry = [
    ...state.book.singles.filter((item) => String(item.order.symbol).toUpperCase() === symbol).map((item) => state.metadata[item.order.clientOrderId]),
    ...state.book.ocoGroups.filter((group) => String(group.first.order.symbol).toUpperCase() === symbol).flatMap((group) => [state.metadata[group.first.order.clientOrderId], state.metadata[group.second.order.clientOrderId]]),
  ].find(Boolean) || {};
  const currency = String(metadataEntry.currency || "").toUpperCase();
  const evidence = observations
    .filter((item) => String(item?.symbol || "").toUpperCase() === symbol)
    .filter((item) => !currency || String(item?.currency || "").toUpperCase() === currency)
    .map((item) => ({ source: item.source, price: Number(item.price), observedAt: item.observedAt }));
  const gate = evaluateOperationalGates({
    marketEvidence: evidence,
    events,
    eventContext: { symbol, currency, assetClass: metadataEntry.assetClass },
    now: now.getTime(),
  });
  if (!gate.allowNewRisk || gate.marketData.medianPrice === null) {
    blockedReasons.push(...gate.reasons.map((reason) => `${symbol}: ${reason}`));
    continue;
  }
  const timestamps = evidence.map((item) => Date.parse(String(item.observedAt || ""))).filter(Number.isFinite);
  const observedAt = timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : now.toISOString();
  const result = applyPaperConditionalMarketObservation(state.book, symbol, gate.marketData.medianPrice, observedAt);
  state.book = result.book;
  if (result.blocked) {
    blocked = true;
    blockedReasons.push(...result.reasons.map((reason) => `${symbol}: ${reason}`));
    continue;
  }
  for (const activation of result.activations) {
    if (existingImmediateIds.has(activation.clientOrderId)) continue;
    const meta = state.metadata[activation.clientOrderId] || metadataEntry;
    immediateOrders.push({
      clientOrderId: activation.clientOrderId,
      symbol: activation.symbol,
      side: activation.side,
      orderType: activation.orderType,
      timeInForce: "DAY",
      quantity: activation.quantity,
      ...(activation.limitPrice === undefined ? {} : { limitPrice: activation.limitPrice }),
      currency: meta.currency || currency || "UNKNOWN",
      fxToEuro: Number(meta.fxToEuro),
      requestedAt: activation.observedAt,
      humanConfirmed: meta.humanConfirmed === true,
      conditionalParentGroupId: activation.parentGroupId || null,
    });
    existingImmediateIds.add(activation.clientOrderId);
    activated += 1;
  }
}

state.generatedAt = now.toISOString();
state.locked = blocked;
state.blockedReasons = [...new Set(blockedReasons)].slice(0, 100);
state.liveTradingAllowed = false;
state.brokerConnectivityAllowed = false;

await writeJsonStateAtomic(path.join(dataDir, "paper-conditional-state.json"), state);
await writeJsonStateAtomic(path.join(dataDir, "paper-order-queue.json"), { ...paperQueue, orders: immediateOrders });
await writeJsonStateAtomic(path.join(dataDir, "paper-conditional-queue.json"), { ...queue, intents: remainingIntents });
console.log(`Fenice Paper Conditional OMS: registered=${registered}, activated=${activated}, remainingIntents=${remainingIntents.length}, locked=${blocked}.`);
