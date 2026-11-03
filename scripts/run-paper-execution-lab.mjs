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
      || event.id !== "lab-" + day + "-" + event.symbol
      || !(event.quantity > 0 && Number.isFinite(event.quantity))
      || !(event.unitPriceEuro > 0 && Number.isFinite(event.unitPriceEuro))
      || !(event.notionalEuro >= 250 && event.notionalEuro <= 300)
      || event.feeEuro !== 1
      || Math.abs(round(event.quantity * event.unitPriceEuro) - event.notionalEuro) > 0.01) {
      return { valid: false, reason: "EVENT_HASH_OR_RISK_INVALID" };
    }
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

export function runExecutionLab({ ledger, session, coverage, fx, nowIso } = {}) {
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
  if (eligible.length < 3) return blocked("NO_THREE_VERIFIED_ELIGIBLE_INSTRUMENTS", ledger);
  // Rotate across the verified source universe; not an investment BUY recommendation.
  const order = [...eligible].sort((a, b) => SYMBOLS.indexOf(a.symbol) - SYMBOLS.indexOf(b.symbol));
  const offset = ledger.events.length % order.length;
  const candidates = [...order.slice(offset), ...order.slice(0, offset)];
  let selection = null;
  for (const row of candidates) {
    const unitPriceEuro = round(row.medianPrice * usd.rate * 1.0005);
    if (!(unitPriceEuro > 0)) continue;
    const quantity = Math.floor(275 / unitPriceEuro * 1e6) / 1e6;
    const notionalEuro = round(quantity * unitPriceEuro);
    const cost = round(notionalEuro + 1);
    const existingCost = ledger.positions[row.symbol]?.bookCostEuro || 0;
    if (quantity > 0 && notionalEuro >= 250 && notionalEuro <= 300
      && cost <= ledger.cashEuro && round(existingCost + cost) <= 1500) {
      selection = { row, unitPriceEuro, quantity, notionalEuro, cost };
      break;
    }
  }
  if (!selection) return blocked("NO_RISK_VALID_ENGINEERING_SAMPLE", ledger);

  const { row, unitPriceEuro, quantity, notionalEuro, cost } = selection;
  const positions = { ...ledger.positions };
  const current = positions[row.symbol] || { quantity: 0, bookCostEuro: 0 };
  positions[row.symbol] = {
    quantity: round(current.quantity + quantity),
    bookCostEuro: round(current.bookCostEuro + cost),
  };
  const cashAfterEuro = round(ledger.cashEuro - cost);
  const eventBody = {
    prevHash: ledger.tip, id: "lab-" + day + "-" + row.symbol,
    mode: "ENGINEERING_EXECUTION_LAB_V1", status: "SIMULATED_EXECUTION",
    occurredAt: nowIso, symbol: row.symbol, currency: "USD",
    quantity, unitPriceEuro, notionalEuro, feeEuro: 1,
    evidenceSha256: hash({
      coverageAt: coverage.generatedAt, sessionAt: session.evidence.observedAt,
      fxAt: usd.observedAt, symbol: row.symbol, sourceFamilies: row.sourceFamilies,
      referencePrice: row.medianPrice, spread: row.maxSpreadPercent, rate: usd.rate,
    }),
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
  const [ledger, session, coverage, fx] = await Promise.all([
    "paper-execution-lab-ledger.json", "paper-market-session.json",
    "execution-market-coverage.json", "paper-fx-evidence.json",
  ].map(read));
  const nowIso = new Date().toISOString();
  const result = runExecutionLab({ ledger, session, coverage, fx, nowIso });
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
