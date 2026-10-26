/**
 * Isolated V7 Phase B PAPER simulation FIXTURE ledger.
 *
 * This is a pure replayable accounting contract for tests, NOT a live
 * approved PAPER campaign. No broker calls, files, secrets or source rights.
 * Fixture events cannot be transferred to any certifying campaign.
 */
import { createHash } from "node:crypto";

const SEED_EUR = 10000;
const CAMPAIGN = "V7_PHASE_B_TEST_FIXTURE_ONLY";
const MAX_DAILY = 1, MAX_ATTEMPTS = 20;
const MAX_NOTIONAL = 300, MIN_NOTIONAL = 250, MAX_SHARE = .03;
const MAX_ASSET_SHARE = .15;
const IMPACT = .0005, FEE_RATE = .0015;
const round = n => Math.round((n + Number.EPSILON) * 10000) / 10000;
const validMoney = n => typeof n === "number" && Number.isFinite(n) && n >= 0;
const validTime = t => {
  if (typeof t !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(t)) return null;
  const n = Date.parse(t);
  return Number.isFinite(n) && n >= 0 && new Date(n).toISOString() === t ? n : null;
};
const validId = s => typeof s === "string" && /^[a-zA-Z0-9._-]{8,80}$/.test(s);
const validKey = s => typeof s === "string" && /^[A-Z0-9]{4}:[A-Z0-9][A-Z0-9._:-]{0,23}$/.test(s);
const hash = obj => createHash("sha256").update(JSON.stringify(obj)).digest("hex");
const close = (a,b) => Math.abs(a-b) < 0.00001;
const eq = (a,b) => JSON.stringify(a) === JSON.stringify(b);

export const newFixturePhaseBLedger = () => ({
  schemaVersion: 1, campaignId: CAMPAIGN, fixtureOnly: true,
  seedCashEuro: SEED_EUR, cashEuro: SEED_EUR,
  positions: {}, attempts: [], lastHash: "GENESIS",
  authorizedForOperationalPaper: false,
  brokerSubmissionAllowed: false, liveTradingAllowed: false,
});
export function replayFixturePhaseBLedger(input) {
  const fail = reason => ({valid:false,reason,summary:null});
  if (!input || input.schemaVersion !== 1 || input.campaignId !== CAMPAIGN
    || input.fixtureOnly !== true || input.seedCashEuro !== SEED_EUR
    || input.authorizedForOperationalPaper !== false
    || input.brokerSubmissionAllowed !== false || input.liveTradingAllowed !== false
    || !Array.isArray(input.attempts) || input.attempts.length > MAX_ATTEMPTS
    || !validMoney(input.cashEuro) || typeof input.lastHash !== "string"
    || !input.positions || typeof input.positions !== "object"
    || Array.isArray(input.positions)) return fail("INVALID_FIXTURE_LEDGER_SHAPE");
  let cashEuro = SEED_EUR, prevHash = "GENESIS", filled = 0;
  const positions = {}, ids = new Set(), days = new Set();
  let prevTime = -1;
  for (const e of input.attempts) {
    if (!e || typeof e !== "object" || Array.isArray(e)) return fail("INVALID_EVENT");
    const {hash:eventHash,...body} = e;
    const at = validTime(body.occurredAt);
    const day = body.occurredAt?.slice(0,10);
    if (!validId(body.intentId) || !validKey(body.instrumentKey)
      || at === null || at <= prevTime || ids.has(body.intentId) || days.has(day)
      || body.prevHash !== prevHash || hash(body) !== eventHash
      || body.fixtureOnly !== true || body.liveTradingAllowed !== false
      || body.brokerSubmissionAllowed !== false
      || !["SIM_FILLED","SIM_REJECTED"].includes(body.status))
      return fail("EVENT_CHAIN_OR_DAILY_UNIQUENESS_INVALID");
    if (!validMoney(body.proposedNotionalEuro) || body.proposedNotionalEuro < MIN_NOTIONAL
      || body.proposedNotionalEuro > MAX_NOTIONAL)
      return fail("PROPOSED_NOTIONAL_INVALID");
    if (body.status === "SIM_FILLED") {
      if (body.side !== "BUY" || !Number.isSafeInteger(body.quantity)
        || body.quantity < 1 || !validMoney(body.quoteUnitEuro)
        || body.quoteUnitEuro <= 0
        || !validMoney(body.filledUnitEuro)
        || !validMoney(body.notionalEuro) || !validMoney(body.feeEuro)
        || !close(body.filledUnitEuro,round(body.quoteUnitEuro * (1+IMPACT)))
        || !close(body.notionalEuro,round(body.quantity*body.filledUnitEuro))
        || !close(body.feeEuro,Math.max(1,round(body.notionalEuro*FEE_RATE)))
        || body.notionalEuro < MIN_NOTIONAL || body.notionalEuro > MAX_NOTIONAL
        || body.notionalEuro > body.proposedNotionalEuro+0.00001
        || body.notionalEuro > SEED_EUR*MAX_SHARE+0.00001)
        return fail("FILL_ARITHMETIC_INVALID");
      const asset = positions[body.instrumentKey] || {quantity:0,costEuro:0};
      const cost = round(body.notionalEuro+body.feeEuro);
      if (cost > cashEuro || asset.costEuro+cost > SEED_EUR*MAX_ASSET_SHARE)
        return fail("FILL_CAPITAL_OR_CONCENTRATION_INVALID");
      asset.quantity += body.quantity;
      asset.costEuro = round(asset.costEuro + cost);
      positions[body.instrumentKey] = asset;
      cashEuro=round(cashEuro-cost);
      filled++;
    } else {
      if (body.side !== "BUY" || typeof body.reason !== "string"
        || !/^[A-Z_]{3,80}$/.test(body.reason)
        || ["SIM_FILLED","GENUINE_FILL"].includes(body.reason)
        || body.quantity !== 0 || body.notionalEuro !== 0 || body.feeEuro !== 0)
        return fail("REJECTION_EVENT_INVALID");
    }
    if (!close(body.cashAfterEuro,cashEuro)
      || !eq(body.positionsAfter,positions))
      return fail("EVENT_REPLAY_STATE_INCONSISTENT");
    ids.add(body.intentId);
    days.add(day);
    prevHash=eventHash;
    prevTime=at;
  }
  if (!close(input.cashEuro,cashEuro)
    || !eq(input.positions,positions)
    || input.lastHash !== prevHash)
    return fail("JOURNAL_BALANCE_OR_HASH_MISMATCH");
  return {
    valid:true, reason:null,
    summary:{seedCashEuro:SEED_EUR,cashEuro,attempts:input.attempts.length,
      fixtureFills:filled,positions,verifiedHashTip:prevHash,
      genuineOperationalPhaseBFills:0,brokerOrders:0,liveOrders:0},
  };
}
/** Only a test-only fixture operation: never accepts owner credentials or unlocks PAPER. */
export function appendFixturePhaseBProbe(input, {intent,verifiedQuoteEuro,nowIso}={}) {
  const inspected = replayFixturePhaseBLedger(input);
  if (!inspected.valid) return {status:"BLOCKED_INVALID_FIXTURE_LEDGER",reason:inspected.reason,ledger:null};
  const now = validTime(nowIso), created = validTime(intent?.createdAt);
  if (now === null || created === null || created > now || now-created > 180000)
    return {status:"BLOCKED_INVALID_INTENT_TIME",ledger:null};
  if (!validId(intent?.id) || !validKey(intent?.instrumentKey)
    || intent?.side !== "BUY" || intent?.phase !== "V7_PHASE_B_TEST_FIXTURE_ONLY"
    || !validMoney(intent.proposedNotionalEuro)
    || intent.proposedNotionalEuro < MIN_NOTIONAL
    || intent.proposedNotionalEuro > MAX_NOTIONAL
    || !validMoney(verifiedQuoteEuro) || verifiedQuoteEuro <= 0)
    return {status:"BLOCKED_INVALID_FIXTURE_INPUT",ledger:null};
  if (input.attempts.length >= MAX_ATTEMPTS)
    return {status:"BLOCKED_MAX_20_ATTEMPTS",ledger:null};
  if (input.attempts.some(e=>e.intentId===intent.id))
    return {status:"BLOCKED_DUPLICATE_INTENT",ledger:null};
  if (input.attempts.some(e=>e.occurredAt.slice(0,10)===nowIso.slice(0,10)))
    return {status:"BLOCKED_ONE_PER_UTC_DAY",ledger:null};
  const prevAt = input.attempts.length
    ? validTime(input.attempts.at(-1).occurredAt) : -1;
  if (now <= prevAt) return {status:"BLOCKED_NON_MONOTONIC_TIME",ledger:null};
  const filledUnitEuro=round(verifiedQuoteEuro*(1+IMPACT));
  const quantity=Math.floor(intent.proposedNotionalEuro/filledUnitEuro);
  const notionalEuro=round(quantity*filledUnitEuro);
  const feeEuro=Math.max(1,round(notionalEuro*FEE_RATE));
  const asset=input.positions[intent.instrumentKey] || {quantity:0,costEuro:0};
  const eligible=quantity>=1 && notionalEuro>=MIN_NOTIONAL
    && notionalEuro<=MAX_NOTIONAL && notionalEuro<=SEED_EUR*MAX_SHARE
    && round(notionalEuro+feeEuro)<=input.cashEuro
    && round(asset.costEuro+notionalEuro+feeEuro)<=SEED_EUR*MAX_ASSET_SHARE;
  const positions=structuredClone(input.positions);
  let cash=input.cashEuro;
  if (eligible) {
    cash=round(cash-notionalEuro-feeEuro);
    positions[intent.instrumentKey]={
      quantity:asset.quantity+quantity,
      costEuro:round(asset.costEuro+notionalEuro+feeEuro),
    };
  }
  const body={
    prevHash:input.lastHash,intentId:intent.id,
    instrumentKey:intent.instrumentKey,occurredAt:nowIso,side:"BUY",
    proposedNotionalEuro:intent.proposedNotionalEuro,
    status:eligible?"SIM_FILLED":"SIM_REJECTED",
    ...(eligible ? {quantity,quoteUnitEuro:verifiedQuoteEuro,
      filledUnitEuro,notionalEuro,feeEuro}
      : {quantity:0,notionalEuro:0,feeEuro:0,reason:"BUDGET_OR_QUANTITY_REJECTED"}),
    cashAfterEuro:cash,positionsAfter:positions,
    fixtureOnly:true,brokerSubmissionAllowed:false,liveTradingAllowed:false,
  };
  const event={...body,hash:hash(body)};
  const ledger={...input,cashEuro:cash,positions,
    attempts:[...input.attempts,event],lastHash:event.hash};
  const check=replayFixturePhaseBLedger(ledger);
  if (!check.valid) return {status:"BLOCKED_REPLAY_FAILURE",reason:check.reason,ledger:null};
  return {status:eligible?"TEST_FIXTURE_SIM_FILL":"TEST_FIXTURE_RISK_REJECTED",
    ledger,fixtureFill:eligible?event:null,
    genuineOperationalPhaseBFills:0,brokerSubmissionAllowed:false,
    liveTradingAllowed:false};
}
