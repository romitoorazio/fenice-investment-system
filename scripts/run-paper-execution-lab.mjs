/**
 * Prospective, engineering-only market execution laboratory.
 *
 * These are simulated execution samples, NOT B2 PAPER fills, broker orders,
 * investment recommendations or certification evidence. This module never
 * imports a broker/OMS client and never reads or writes a V6/V7 ledger.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = resolve(ROOT, "data");
const SHA = /^[a-f0-9]{64}$/;
const SYMBOLS = ["SPY", "QQQ", "MSFT", "AAPL"];
const round = n => Math.round((n + Number.EPSILON) * 10000) / 10000;
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const time = value => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const n = Date.parse(value);
  return Number.isFinite(n) && new Date(n).toISOString() === value ? n : null;
};
const fresh = (value, now, maxAgeMs = 120000) => {
  const at = time(value);
  return at !== null && at <= now && now - at <= maxAgeMs;
};
const blocked = (reason, ledger) => ({
  status: "BLOCKED", reason, ledger, simulatedExecutionsAdded: 0,
  certificationCredit: 0, brokerConnectivityAllowed: false, liveTradingAllowed: false,
});

export const freshExecutionLabLedger = () => ({
  version: 1, mode: "ENGINEERING_EXECUTION_LAB_V1",
  initialVirtualEuro: 10000, cashEuro: 10000, positions: {},
  events: [], tip: "GENESIS", certificationCredit: 0,
  brokerConnectivityAllowed: false, liveTradingAllowed: false,
});

export function replayExecutionLabLedger(ledger) {
  if (!ledger || ledger.version !== 1 || ledger.mode !== "ENGINEERING_EXECUTION_LAB_V1"
    || ledger.initialVirtualEuro !== 10000 || ledger.certificationCredit !== 0
    || ledger.brokerConnectivityAllowed !== false || ledger.liveTradingAllowed !== false
    || !Array.isArray(ledger.events) || ledger.events.length > 10
    || !ledger.positions || typeof ledger.positions !== "object" || Array.isArray(ledger.positions)) {
    return { valid: false, reason: "SCHEMA_OR_SAFETY_INVALID" };
  }
  let cash = 10000, tip = "GENESIS", last = -1;
  const positions = {}, days = new Set();
  for (const event of ledger.events) {
    const at = time(event?.occurredAt);
    const day = event?.occurredAt?.slice(0, 10);
    const expectedHash = event && hash(Object.fromEntries(Object.entries(event).filter(([key]) => key !== "hash")));
    if (!event || event.prevHash !== tip || event.hash !== expectedHash
      || at === null || at <= last || days.has(day)
      || event.mode !== "ENGINEERING_EXECUTION_LAB_V1" || event.status !== "SIMULATED_EXECUTION"
      || event.simulated !== true || event.certificationCredit !== 0
      || event.liveTradingAllowed !== false || event.brokerConnectivityAllowed !== false
      || !SYMBOLS.includes(event.symbol) || !SHA.test(event.evidenceSha256 || "")
      || !event.evidenceSnapshot || hash(event.evidenceSnapshot) !== event.evidenceSha256
      || event.id !== "lab-" + day + "-" + event.symbol
      || !(event.quantity > 0 && Number.isFinite(event.quantity))
      || !(event.unitPriceEuro > 0 && Number.isFinite(event.unitPriceEuro))
      || !(event.notionalEuro >= 250 && event.notionalEuro <= 300)
      || event.feeEuro !== 1
      || Math.abs(round(event.quantity * event.unitPriceEuro) - event.notionalEuro) > 0.01) {
      return { valid: false, reason: "EVENT_HASH_OR_RISK_INVALID" };
    }
    const proof = event.evidenceSnapshot;
    const quotes = proof?.observations;
    if (proof?.version !== 1 || proof.symbol !== event.symbol
      || proof.slippageBps !== 5 || !Number.isFinite(proof.fxToEuro)
      || proof.fxToEuro <= 0 || proof.fxToEuro > 5
      || !Number.isFinite(proof.rowMedianPrice) || proof.rowMedianPrice <= 0
      || !Number.isFinite(proof.maxSpreadPercent) || proof.maxSpreadPercent > 1
      || !fresh(proof.coverageAt, at) || !fresh(proof.sourceReportAt, at)
      || !fresh(proof.marketSessionAt, at) || !fresh(proof.fxAt, at)
      || !Array.isArray(quotes) || quotes.length !== 2
      || !["alpaca", "twelve-data"].every(family =>
        quotes.some(q => q.sourceFamily === family))
      || quotes.some(q => q.symbol !== event.symbol || q.currency !== "USD"
        || q.eligibility !== "PAPER" || q.provenanceVerified !== true
        || typeof q.provenanceMethod !== "string" || !q.provenanceMethod
        || !Number.isFinite(q.price) || q.price <= 0
        || !fresh(q.observedAt, at))
      || Math.abs((quotes[0].price + quotes[1].price) / 2 - proof.rowMedianPrice) > 0.001
      || Math.abs((Math.abs(quotes[0].price - quotes[1].price) / proof.rowMedianPrice) * 100
        - proof.maxSpreadPercent) > 0.005
      || event.unitPriceEuro !== round(proof.rowMedianPrice * proof.fxToEuro * 1.0005))
      return { valid: false, reason: "QUOTE_EVIDENCE_REPLAY_INVALID" };
    const cost = round(event.notionalEuro + event.feeEuro);
    const position = positions[event.symbol] || { quantity: 0, bookCostEuro: 0 };
    if (cost > cash || round(position.bookCostEuro + cost) > 1500) {
      return { valid: false, reason: "CASH_OR_CONCENTRATION_INVALID" };
    }
    positions[event.symbol] = {
      quantity: round(position.quantity + event.quantity),
      bookCostEuro: round(position.bookCostEuro + cost),
    };
    cash = round(cash - cost);
    if (event.cashAfterEuro !== cash
      || JSON.stringify(event.positionsAfter) !== JSON.stringify(positions)) {
      return { valid: false, reason: "EVENT_RECONCILIATION_INVALID" };
    }
    days.add(day); last = at; tip = event.hash;
  }
  if (ledger.cashEuro !== cash || ledger.tip !== tip
    || JSON.stringify(ledger.positions) !== JSON.stringify(positions)) {
    return { valid: false, reason: "LEDGER_RECONCILIATION_INVALID" };
  }
  return { valid: true, simulatedExecutions: ledger.events.length, cashEuro: cash, positions, tip };
}

export function runExecutionLab({ ledger, session, coverage, executionEvidence, fx, nowIso } = {}) {
  const previous = replayExecutionLabLedger(ledger);
  if (!previous.valid) throw Error("ENGINEERING_LEDGER_INTEGRITY_" + previous.reason);
  const now = time(nowIso);
  if (now === null) return blocked("INVALID_CLOCK", ledger);
  if (ledger.events.length >= 10) return blocked("ENGINEERING_SAMPLE_TARGET_REACHED", ledger);
  const day = nowIso.slice(0, 10);
  if (ledger.events.some(event => event.occurredAt.slice(0, 10) === day))
    return blocked("ALREADY_SAMPLED_THIS_UTC_DAY", ledger);

  if (session?.liveTradingAllowed !== false || session?.configured !== true
    || session?.evidence?.venue !== "US_EQUITIES"
    || session?.evidence?.state !== "OPEN" || session?.evidence?.authoritative !== true
    || session?.decision?.allowed !== true
    || !fresh(session?.evidence?.observedAt, now)
    || time(session?.nextClose) === null || time(session.nextClose) - now < 300000)
    return blocked("NO_FRESH_AUTHORITATIVE_OPEN_SESSION", ledger);

  if (coverage?.policy?.liveTradingAllowed !== false
    || Number(coverage?.policy?.minIndependentSourceFamilies) < 2
    || !fresh(coverage?.generatedAt, now)
    || Number(coverage?.paperEligibleSymbols) < 3
    || !Array.isArray(coverage.rows))
    return blocked("NO_FRESH_DUAL_PROVIDER_COVERAGE", ledger);

  if (executionEvidence?.policy?.liveTradingAllowed !== false
    || !fresh(executionEvidence?.generatedAt, now)
    || !Array.isArray(executionEvidence.observations))
    return blocked("NO_FRESH_EXECUTION_OBSERVATIONS", ledger);
  const usd = fx?.ratesToEuro?.USD;
  if (fx?.liveTradingAllowed !== false || fx?.brokerConnectivityAllowed !== false
    || fx?.provider !== "twelve-data" || fx?.provenanceVerified !== true
    || fx?.baseCurrency !== "EUR" || fx?.maxAgeSeconds > 120
    || !fresh(fx?.generatedAt, now) || !fresh(usd?.observedAt, now)
    || !(Number.isFinite(usd?.rate) && usd.rate > 0 && usd.rate <= 5))
    return blocked("NO_FRESH_VERIFIED_USD_EUR", ledger);

  const eligible = coverage.rows.filter(row =>
    SYMBOLS.includes(row?.symbol) && row.paperEligible === true
    && ["GREEN", "CAUTION"].includes(row.state)
    && Number(row.independentSourceFamilies) >= 2
    && Array.isArray(row.sourceFamilies)
    && row.sourceFamilies.includes("alpaca")
    && row.sourceFamilies.includes("twelve-data")
    && Array.isArray(row.approvedIndependentPaperFamilies)
    && row.approvedIndependentPaperFamilies.includes("alpaca")
    && row.approvedIndependentPaperFamilies.includes("twelve-data")
    && Number.isFinite(row.medianPrice) && row.medianPrice > 0
    && Number.isFinite(row.maxSpreadPercent) && row.maxSpreadPercent >= 0
    && row.maxSpreadPercent <= 1
    && row.staleEvidence === 0 && row.invalidEvidence === 0
  );
  const verifiedQuotes = row => {
    const observations = executionEvidence.observations
      .filter(q => q?.symbol === row.symbol && q.currency === "USD"
        && ["alpaca", "twelve-data"].includes(q.sourceFamily)
        && q.eligibility === "PAPER" && q.provenanceVerified === true
        && typeof q.provenanceMethod === "string" && q.provenanceMethod
        && Number.isFinite(q.price) && q.price > 0
        && fresh(q.observedAt, now))
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
    const byFamily = new Map();
    for (const observation of observations)
      if (!byFamily.has(observation.sourceFamily)) byFamily.set(observation.sourceFamily, observation);
    const two = ["alpaca", "twelve-data"].map(family => byFamily.get(family));
    if (two.some(q => !q)) return null;
    const median = (two[0].price + two[1].price) / 2;
    const spread = Math.abs(two[0].price - two[1].price) / median * 100;
    if (Math.abs(median - row.medianPrice) > 0.001
      || Math.abs(spread - row.maxSpreadPercent) > 0.005
      || spread > 1) return null;
    return two.map(q => ({
      symbol: q.symbol, currency: q.currency, sourceFamily: q.sourceFamily,
      eligibility: q.eligibility, provenanceVerified: q.provenanceVerified,
      provenanceMethod: q.provenanceMethod, price: q.price, observedAt: q.observedAt,
    }));
  };
  const admitted = eligible.map(row => ({ row, receipts: verifiedQuotes(row) }))
    .filter(item => item.receipts !== null);
  if (admitted.length < 3) return blocked("NO_THREE_VERIFIED_ELIGIBLE_INSTRUMENTS", ledger);
  // Rotate across the verified source universe; not an investment BUY recommendation.
  const order = [...admitted].sort((a, b) => SYMBOLS.indexOf(a.row.symbol) - SYMBOLS.indexOf(b.row.symbol));
  const offset = ledger.events.length % order.length;
  const candidates = [...order.slice(offset), ...order.slice(0, offset)];
  let selection = null;
  for (const { row, receipts } of candidates) {
    const unitPriceEuro = round(row.medianPrice * usd.rate * 1.0005);
    if (!(unitPriceEuro > 0)) continue;
    const quantity = Math.floor(275 / unitPriceEuro * 1e6) / 1e6;
    const notionalEuro = round(quantity * unitPriceEuro);
    const cost = round(notionalEuro + 1);
    const existingCost = ledger.positions[row.symbol]?.bookCostEuro || 0;
    if (quantity > 0 && notionalEuro >= 250 && notionalEuro <= 300
      && cost <= ledger.cashEuro && round(existingCost + cost) <= 1500) {
      selection = { row, receipts, unitPriceEuro, quantity, notionalEuro, cost };
      break;
    }
  }
  if (!selection) return blocked("NO_RISK_VALID_ENGINEERING_SAMPLE", ledger);

  const { row, receipts, unitPriceEuro, quantity, notionalEuro, cost } = selection;
  const positions = { ...ledger.positions };
  const current = positions[row.symbol] || { quantity: 0, bookCostEuro: 0 };
  positions[row.symbol] = {
    quantity: round(current.quantity + quantity),
    bookCostEuro: round(current.bookCostEuro + cost),
  };
  const cashAfterEuro = round(ledger.cashEuro - cost);
  // Compact normalized provider receipts make the evidence hash independently
  // reproducible. Do not store raw HTTP responses, headers or API credentials.
  const evidenceSnapshot = {
    version: 1, symbol: row.symbol, rowMedianPrice: row.medianPrice,
    maxSpreadPercent: row.maxSpreadPercent, sourceReportAt: executionEvidence.generatedAt,
    coverageAt: coverage.generatedAt, marketSessionAt: session.evidence.observedAt,
    fxAt: usd.observedAt, fxToEuro: usd.rate, slippageBps: 5,
    observations: receipts,
  };
  const eventBody = {
    prevHash: ledger.tip, id: "lab-" + day + "-" + row.symbol,
    mode: "ENGINEERING_EXECUTION_LAB_V1", status: "SIMULATED_EXECUTION",
    occurredAt: nowIso, symbol: row.symbol, currency: "USD",
    quantity, unitPriceEuro, notionalEuro, feeEuro: 1,
    evidenceSha256: hash(evidenceSnapshot), evidenceSnapshot,
    cashAfterEuro, positionsAfter: positions,
    simulated: true, certificationCredit: 0,
    liveTradingAllowed: false, brokerConnectivityAllowed: false,
  };
  const event = { ...eventBody, hash: hash(eventBody) };
  const updated = {
    ...ledger, cashEuro: cashAfterEuro, positions,
    events: [...ledger.events, event], tip: event.hash,
  };
  if (!replayExecutionLabLedger(updated).valid)
    throw Error("ENGINEERING_POST_SAMPLE_RECONCILIATION_FAILED");
  return {
    status: "SIMULATED_EXECUTION", reason: null, ledger: updated,
    simulatedExecutionsAdded: 1, symbol: row.symbol,
    certificationCredit: 0, brokerConnectivityAllowed: false, liveTradingAllowed: false,
  };
}

const read = async filename => JSON.parse(await readFile(resolve(DATA, filename), "utf8"));
const atomic = async (filename, object) => {
  const target = resolve(DATA, filename);
  const temp = target + ".tmp";
  await writeFile(temp, JSON.stringify(object, null, 2) + "\n", { mode: 0o600 });
  await rename(temp, target);
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [ledger, session, coverage, executionEvidence, fx] = await Promise.all([
    "paper-execution-lab-ledger.json", "paper-market-session.json",
    "execution-market-coverage.json", "execution-market-evidence.json",
    "paper-fx-evidence.json",
  ].map(read));
  const nowIso = new Date().toISOString();
  const result = runExecutionLab({ ledger, session, coverage, executionEvidence, fx, nowIso });
  if (result.simulatedExecutionsAdded === 1)
    await atomic("paper-execution-lab-ledger.json", result.ledger);
  await atomic("paper-execution-lab-report.json", {
    version: 1, generatedAt: nowIso, mode: "ENGINEERING_SHADOW_ONLY",
    status: result.status, reason: result.reason, symbol: result.symbol || null,
    totalSimulatedExecutions: result.ledger.events.length,
    simulatedExecutionsAdded: result.simulatedExecutionsAdded,
    certificationCredit: 0, countsTowardB2: false, countsTowardV6: false,
    liveTradingAllowed: false, brokerConnectivityAllowed: false,
  });
  console.log(JSON.stringify({
    mode: "ENGINEERING_SHADOW_ONLY", status: result.status, reason: result.reason,
    symbol: result.symbol || null, totalSimulatedExecutions: result.ledger.events.length,
    certificationCredit: 0, countsTowardB2: false,
    liveTradingAllowed: false, brokerConnectivityAllowed: false,
  }));
}
