/**
 * V8 PAPER technical certification observer. Prospective-only and independent
 * of legacy V6/V7 B2. This audits virtual execution engineering, NOT profitable
 * investment decisions and never authorizes brokerage orders or LIVE trading.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { replayExecutionLabLedger } from "./run-paper-execution-lab.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SHA1 = /^[a-f0-9]{40}$/;
export const PINNED_V8_FILES = Object.freeze([
  ".github/workflows/paper-execution-lab.yml",
  "scripts/run-paper-execution-lab.mjs",
  "scripts/test-paper-execution-lab.mjs",
  "scripts/run-v8-technical-evidence.mjs",
  "scripts/run-v8-technical-samples.mjs",
  "scripts/test-v8-technical-evidence.mjs",
]);
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const millis = value => {
  const n = typeof value === "string" ? Date.parse(value) : NaN;
  return Number.isFinite(n) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
    && new Date(n).toISOString() === value ? n : null;
};
const recent = (time, now) => {
  const t = millis(time);
  return t !== null && now >= t && now - t <= 120000;
};
const blocked = (reason, days) => ({
  status: "BLOCKED", reason, days, newValidDay: false, readyForTechnicalReview: false,
  liveTradingAllowed: false, brokerConnectivityAllowed: false, countsTowardB2: false,
  countsTowardV6: false, technicalOnly: true,
});
const validQuote = (q, symbol, now) =>
  q?.symbol === symbol && q.currency === "USD"
  && ["alpaca", "twelve-data"].includes(q.sourceFamily)
  && q.eligibility === "PAPER" && q.provenanceVerified === true
  && typeof q.provenanceMethod === "string" && q.provenanceMethod.length > 4
  && Number.isFinite(q.price) && q.price > 0 && recent(q.observedAt, now);

function proofCheck(proof, now) {
  if (!proof || !recent(proof.capturedAt, now)
    || proof.market?.venue !== "US_EQUITIES" || proof.market?.state !== "OPEN"
    || proof.market?.authoritative !== true || !recent(proof.market.observedAt, now)
    || millis(proof.market.nextClose) === null
    || millis(proof.market.nextClose) - now < 300000
    || !recent(proof.coverage?.generatedAt, now)
    || Number(proof.coverage?.minIndependentSourceFamilies) < 2
    || Number(proof.coverage?.paperEligibleSymbols) < 3
    || proof.fx?.provider !== "twelve-data" || !recent(proof.fx?.observedAt, now)
    || !(Number.isFinite(proof.fx?.rate) && proof.fx.rate > 0 && proof.fx.rate <= 5)
    || !recent(proof.executionReportAt, now)
    || !Array.isArray(proof.instruments) || proof.instruments.length < 3) {
    return false;
  }
  const symbols = new Set();
  for (const item of proof.instruments) {
    if (symbols.has(item.symbol)
      || !["SPY", "QQQ", "AAPL", "MSFT"].includes(item.symbol)
      || !Number.isFinite(item.medianPrice) || item.medianPrice <= 0
      || !Number.isFinite(item.spreadPercent) || item.spreadPercent < 0
      || item.spreadPercent > 1 || !Array.isArray(item.quotes)
      || item.quotes.length !== 2
      || !validQuote(item.quotes[0], item.symbol, now)
      || !validQuote(item.quotes[1], item.symbol, now)
      || new Set(item.quotes.map(q => q.sourceFamily)).size !== 2
      || !["alpaca", "twelve-data"].every(fam => item.quotes.some(q => q.sourceFamily === fam))) {
      return false;
    }
    const med = (item.quotes[0].price + item.quotes[1].price) / 2;
    const spread = Math.abs(item.quotes[0].price - item.quotes[1].price) / med * 100;
    if (Math.abs(med - item.medianPrice) > 0.001
      || Math.abs(spread - item.spreadPercent) > 0.005 || spread > 1) return false;
    symbols.add(item.symbol);
  }
  return true;
}
export function buildV8Proof({ session, coverage, executionEvidence, fx, nowIso }) {
  const now = millis(nowIso);
  if (now === null) return { valid: false, reason: "INVALID_CLOCK" };
  if (session?.configured !== true || session?.liveTradingAllowed !== false
    || session?.evidence?.authoritative !== true || session?.evidence?.state !== "OPEN"
    || session?.evidence?.venue !== "US_EQUITIES" || session?.decision?.allowed !== true
    || coverage?.policy?.liveTradingAllowed !== false
    || Number(coverage?.policy?.minIndependentSourceFamilies) < 2
    || fx?.liveTradingAllowed !== false || fx?.brokerConnectivityAllowed !== false
    || fx?.provenanceVerified !== true || fx?.provider !== "twelve-data"
    || fx?.baseCurrency !== "EUR" || fx?.maxAgeSeconds > 120
    || executionEvidence?.policy?.liveTradingAllowed !== false
    || !Array.isArray(coverage?.rows)
    || !Array.isArray(executionEvidence?.observations)) {
    return { valid: false, reason: "SOURCE_OR_MARKET_POLICY_BLOCK" };
  }
  const instruments = [];
  for (const row of coverage.rows) {
    if (!["SPY", "QQQ", "MSFT", "AAPL"].includes(row.symbol)
      || row.paperEligible !== true
      || !["GREEN", "CAUTION"].includes(row.state)
      || row.independentSourceFamilies < 2
      || !row.sourceFamilies?.includes("alpaca")
      || !row.sourceFamilies?.includes("twelve-data")
      || !row.approvedIndependentPaperFamilies?.includes("alpaca")
      || !row.approvedIndependentPaperFamilies?.includes("twelve-data")
      || row.staleEvidence !== 0 || row.invalidEvidence !== 0) continue;
    const selected = ["alpaca", "twelve-data"].map(fam =>
      executionEvidence.observations
        .filter(q => q.sourceFamily === fam && validQuote(q, row.symbol, now))
        .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0]);
    if (selected.some(q => !q)) continue;
    const median = (selected[0].price + selected[1].price) / 2;
    const spread = Math.abs(selected[0].price - selected[1].price) / median * 100;
    if (Math.abs(median - row.medianPrice) > 0.001 || spread > 1
      || Math.abs(spread - row.maxSpreadPercent) > 0.005) continue;
    instruments.push({
      symbol: row.symbol, medianPrice: row.medianPrice,
      spreadPercent: row.maxSpreadPercent,
      quotes: selected.map(q => ({
        symbol: q.symbol, currency: q.currency, sourceFamily: q.sourceFamily,
        eligibility: q.eligibility, provenanceVerified: q.provenanceVerified,
        provenanceMethod: q.provenanceMethod, price: q.price, observedAt: q.observedAt,
      })),
    });
  }
  const proof = {
    capturedAt: nowIso,
    market: {
      venue: session.evidence.venue, state: session.evidence.state,
      authoritative: session.evidence.authoritative,
      observedAt: session.evidence.observedAt, nextClose: session.nextClose,
    },
    coverage: {
      generatedAt: coverage.generatedAt,
      minIndependentSourceFamilies: coverage.policy.minIndependentSourceFamilies,
      paperEligibleSymbols: coverage.paperEligibleSymbols,
    },
    executionReportAt: executionEvidence.generatedAt,
    fx: {
      provider: fx.provider, rate: fx.ratesToEuro?.USD?.rate,
      observedAt: fx.ratesToEuro?.USD?.observedAt,
    },
    instruments,
  };
  return proofCheck(proof, now) ? { valid: true, proof }
    : { valid: false, reason: "FRESH_DUAL_PROVIDER_OPEN_PROOF_MISSING" };
}

export function replayV8Days(days, approval) {
  if (days?.version !== 1 || days?.mode !== "V8_TECHNICAL_PAPER_DAYS"
    || days.campaignId !== approval?.campaignId
    || days.liveTradingAllowed !== false || days.brokerConnectivityAllowed !== false
    || !Array.isArray(days.records) || days.records.length > 90) {
    return { valid: false, reason: "DAY_LEDGER_SCHEMA_INVALID" };
  }
  const start = millis(approval?.effectiveFrom);
  if (start === null) return { valid: false, reason: "APPROVAL_TIME_INVALID" };
  let previousHash = "GENESIS", previousDate = "";
  for (const record of days.records) {
    const observed = millis(record?.observedAt);
    if (!record || !/^\d{4}-\d{2}-\d{2}$/.test(record.date || "")
      || record.date <= previousDate || observed === null || observed < start
      || record.date !== record.observedAt.slice(0, 10)
      || record.prevHash !== previousHash
      || record.proofSha256 !== digest(record.proof)
      || record.hash !== digest(Object.fromEntries(Object.entries(record)
        .filter(([key]) => key !== "hash")))
      || !proofCheck(record.proof, observed)
      || record.liveTradingAllowed !== false
      || record.brokerConnectivityAllowed !== false
      || record.certificationScope !== "V8_TECHNICAL_ONLY") {
      return { valid: false, reason: "DAY_EVIDENCE_REPLAY_INVALID" };
    }
    previousHash = record.hash; previousDate = record.date;
  }
  return { valid: true, validDays: days.records.length, tip: previousHash };
}

export function assessV8({ approval, observedCoreBlobs, days, lab, session,
  coverage, executionEvidence, fx, nowIso }) {
  const now = millis(nowIso);
  if (now === null) return blocked("INVALID_CLOCK", days);
  if (approval?.approved !== true || approval.humanConfirmation !== true
    || approval.mode !== "PAPER_TECHNICAL_V8" || approval.prospectiveOnly !== true
    || approval.allowBackfill !== false || approval.liveTradingAllowed !== false
    || approval.brokerConnectivityAllowed !== false
    || approval.minCalendarDays !== 30 || approval.minEvidenceDays !== 25
    || approval.minTechnicalSamples !== 10 || approval.maxTechnicalSamples !== 10
    || approval.minIndependentSourceFamilies !== 2
    || approval.creditTowardV6 !== false || approval.creditTowardB2 !== false) {
    return blocked("NOT_APPROVED_OR_POLICY_CHANGED", days);
  }
  const start = millis(approval.effectiveFrom), expires = millis(approval.expiresAt);
  if (start === null || expires === null || start > now || now >= expires
    || expires - start < 30 * 86400000) return blocked("OUTSIDE_APPROVED_WINDOW", days);
  if (!SHA1.test(approval.baselineCommit || "")
    || JSON.stringify(Object.keys(approval.coreFileBlobs || {}).sort())
       !== JSON.stringify([...PINNED_V8_FILES].sort())
    || PINNED_V8_FILES.some(path => !SHA1.test(approval.coreFileBlobs[path])
      || approval.coreFileBlobs[path] !== observedCoreBlobs?.[path])) {
    return blocked("V8_PINNED_CORE_CHANGED", days);
  }
  const replayDays = replayV8Days(days, approval);
  if (!replayDays.valid) return blocked("V8_" + replayDays.reason, days);
  const replayLab = replayExecutionLabLedger(lab);
  if (!replayLab.valid) return blocked("ENGINEERING_LAB_TAMPER_" + replayLab.reason, days);
  // V8 has its own dedicated prospective sample ledger. Historical lab events
  // must never be copied into it, even if someone tries to inflate progress.
  if (lab.events.some(e => millis(e.occurredAt) < start
    || millis(e.occurredAt) >= expires))
    return blocked("V8_SAMPLE_OUTSIDE_PROSPECTIVE_WINDOW", days);
  // Historical V6/V7 and the old engineering lab receive no certification credit.
  const technicalSamples = lab.events.filter(e => millis(e.occurredAt) >= start
    && millis(e.occurredAt) < expires).length;
  const elapsed = Math.floor((now - start) / 86400000);
  const already = days.records.some(rec => rec.date === nowIso.slice(0, 10));
  const evidence = already ? { valid: true }
    : buildV8Proof({ session, coverage, executionEvidence, fx, nowIso });
  let next = days;
  if (!already && evidence.valid) {
    const prevHash = replayDays.tip;
    const body = {
      date: nowIso.slice(0, 10), observedAt: nowIso, prevHash,
      proof: evidence.proof, proofSha256: digest(evidence.proof),
      certificationScope: "V8_TECHNICAL_ONLY",
      liveTradingAllowed: false, brokerConnectivityAllowed: false,
    };
    const record = { ...body, hash: digest(body) };
    next = { ...days, records: [...days.records, record] };
    if (!replayV8Days(next, approval).valid) throw Error("V8_POST_RECORD_REPLAY_FAILED");
  }
  const count = next.records.length;
  const ready = elapsed >= 30 && count >= 25 && technicalSamples >= 10;
  const report = {
    version: 1, campaignId: approval.campaignId, mode: "V8_TECHNICAL_ONLY",
    generatedAt: nowIso, status: ready ? "READY_FOR_INDEPENDENT_TECHNICAL_REVIEW"
      : count < 25 || technicalSamples < 10 || elapsed < 30 ? "COLLECTING" : "BLOCKED",
    reason: evidence.valid ? null : (evidence.reason || "UNVERIFIED_DAY"),
    validDays: count, requiredValidDays: 25,
    calendarDaysElapsed: elapsed, requiredCalendarDays: 30,
    validTechnicalSamples: technicalSamples, requiredTechnicalSamples: 10,
    newValidDay: next !== days,
    readyForTechnicalReview: ready, automaticallyLiveReady: false,
    investmentSignalQualityCertified: false,
    countsTowardB2: false, countsTowardV6: false,
    liveTradingAllowed: false, brokerConnectivityAllowed: false,
    baselineCommit: approval.baselineCommit,
  };
  return { ...report, days: next };
}

async function main() {
  const read = async name => JSON.parse(await readFile(resolve(ROOT, "data", name), "utf8"));
  const approval = await read("paper-v8-technical-approval.json");
  if (approval.approved !== true) {
    console.log("V8 technical evidence: pending explicit approved baseline; zero credit.");
    return;
  }
  const observedCoreBlobs = Object.fromEntries(PINNED_V8_FILES.map(path => [
    path, execFileSync("git", ["hash-object", path], { cwd: ROOT, encoding: "utf8" }).trim(),
  ]));
  const [days, lab, session, coverage, executionEvidence, fx] = await Promise.all([
    "paper-v8-technical-days.json", "paper-v8-technical-samples.json",
    "paper-market-session.json", "execution-market-coverage.json",
    "execution-market-evidence.json", "paper-fx-evidence.json",
  ].map(read));
  const result = assessV8({
    approval, observedCoreBlobs, days, lab, session, coverage,
    executionEvidence, fx, nowIso: new Date().toISOString(),
  });
  const atomic = async (name, value) => {
    const path = resolve(ROOT, "data", name), temp = path + ".tmp";
    await writeFile(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
    await rename(temp, path);
  };
  if (result.newValidDay) await atomic("paper-v8-technical-days.json", result.days);
  const { days: unused, ...report } = result;
  await atomic("paper-v8-technical-status.json", report);
  console.log("Fenice V8 technical: " + JSON.stringify(report));
  if (result.status === "BLOCKED") process.exitCode = 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await main();
