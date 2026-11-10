/**
 * FENICE V8: prospective experimental exits of existing technical BUY samples.
 * This is a separate accounting experiment, never a certified strategy signal.
 * NO broker imports, no LIVE orders and no changes to pinned V8 files/ledgers.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { replayExecutionLabLedger } from "./run-paper-execution-lab.mjs";
import { replayV8Days, buildV8Proof, PINNED_V8_FILES } from "./run-v8-technical-evidence.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const DAY_MS = 86400000;
const sha = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const r4 = n => Math.round((n + Number.EPSILON) * 10000) / 10000;
const ms = value => {
  if (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/.test(value)) return NaN;
  const t = Date.parse(value);
  return Number.isFinite(t) && new Date(t).toISOString() === value ? t : NaN;
};
const fresh = (at, reference) => {
  const n = ms(at);
  return Number.isFinite(n) && n <= reference && reference - n <= 120000;
};
export const freshExitLedger = () => ({
  version: 1, mode: "V8_FORWARD_TECHNICAL_EXITS_ONLY",
  activatedAt: null, events: [], tip: "GENESIS",
  certificationCredit: 0, strategyPerformanceCertified: false,
  brokerConnectivityAllowed: false, liveTradingAllowed: false,
});
function validProof(proof, at, symbol) {
  if (!proof || !fresh(proof.capturedAt, at)
    || !fresh(proof.market?.observedAt, at)
    || proof.market?.venue !== "US_EQUITIES"
    || proof.market?.state !== "OPEN" || proof.market?.authoritative !== true
    || ms(proof.market?.nextClose) - at < 300000
    || !fresh(proof.coverage?.generatedAt, at)
    || Number(proof.coverage?.paperEligibleSymbols) < 3
    || Number(proof.coverage?.minIndependentSourceFamilies) < 2
    || !fresh(proof.executionReportAt, at)
    || proof.fx?.provider !== "twelve-data"
    || !fresh(proof.fx?.observedAt, at)
    || !(Number.isFinite(proof.fx?.rate) && proof.fx.rate > 0 && proof.fx.rate <= 5)
    || !Array.isArray(proof.instruments) || proof.instruments.length < 3) return false;
  const instruments = new Set();
  for (const item of proof.instruments) {
    if (!item || instruments.has(item.symbol)
      || !Number.isFinite(item.medianPrice) || item.medianPrice <= 0
      || !Number.isFinite(item.spreadPercent) || item.spreadPercent < 0
      || item.spreadPercent > 1 || !Array.isArray(item.quotes) || item.quotes.length !== 2) return false;
    instruments.add(item.symbol);
    const families = item.quotes.map(q => q.sourceFamily).sort();
    if (JSON.stringify(families) !== JSON.stringify(["alpaca", "twelve-data"])) return false;
    if (item.quotes.some(q => q.symbol !== item.symbol || q.currency !== "USD"
      || q.eligibility !== "PAPER" || q.provenanceVerified !== true
      || typeof q.provenanceMethod !== "string" || q.provenanceMethod.length <= 4
      || !Number.isFinite(q.price) || q.price <= 0 || !fresh(q.observedAt, at))) return false;
    const median = (item.quotes[0].price + item.quotes[1].price) / 2;
    const spread = Math.abs(item.quotes[0].price - item.quotes[1].price) / median * 100;
    if (spread > 1 || Math.abs(median - item.medianPrice) > 0.001
      || Math.abs(spread - item.spreadPercent) > 0.005) return false;
  }
  return instruments.has(symbol);
}
export function replayShadowExits({ ledger, samples, days, approval }) {
  if (!ledger || ledger.version !== 1 || ledger.mode !== "V8_FORWARD_TECHNICAL_EXITS_ONLY"
    || ledger.certificationCredit !== 0 || ledger.strategyPerformanceCertified !== false
    || ledger.brokerConnectivityAllowed !== false || ledger.liveTradingAllowed !== false
    || !Array.isArray(ledger.events) || ledger.events.length > 10)
    return { valid: false, reason: "LEDGER_SCHEMA_OR_LIVE_POLICY" };
  const old = replayExecutionLabLedger(samples);
  const evidence = replayV8Days(days, approval);
  if (!old.valid || !evidence.valid || approval?.approved !== true
    || approval?.liveTradingAllowed !== false || approval?.brokerConnectivityAllowed !== false
    || approval?.mode !== "PAPER_TECHNICAL_V8") return { valid: false, reason: "SOURCE_LEDGER_INVALID" };
  const activatedAt = ledger.activatedAt === null ? NaN : ms(ledger.activatedAt);
  if (ledger.activatedAt !== null && !Number.isFinite(activatedAt))
    return { valid: false, reason: "ACTIVATION_INVALID" };
  if (ledger.events.length && !Number.isFinite(activatedAt))
    return { valid: false, reason: "EVENT_BEFORE_ACTIVATION" };
  let tip = "GENESIS", last = -1, realizedEuro = 0;
  const closed = new Set(), dates = new Set();
  for (const e of ledger.events) {
    const sample = samples.events.find(s => s.id === e.entryEventId && s.hash === e.entryEventHash);
    const at = ms(e?.closedAt);
    if (!sample || !Number.isFinite(at) || at < activatedAt || at <= last
      || at > Date.parse(approval.expiresAt)
      || at <= ms(sample.occurredAt) + DAY_MS
      || e.closedAt.slice(0, 10) <= sample.occurredAt.slice(0, 10)
      || closed.has(e.entryEventId) || dates.has(e.closedAt.slice(0, 10))
      || e.prevHash !== tip || e.hash !== sha(Object.fromEntries(Object.entries(e).filter(([k]) => k !== "hash")))
      || e.entryAt !== sample.occurredAt || e.symbol !== sample.symbol
      || e.market !== "US_EQUITIES" || e.side !== "SELL"
      || e.scope !== "V8_TECHNICAL_EXPERIMENT_NOT_STRATEGY"
      || e.simulated !== true || e.certificationCredit !== 0
      || e.strategySignalCertified !== false || e.liveTradingAllowed !== false
      || e.brokerConnectivityAllowed !== false
      || e.entryNotionalEuro !== sample.notionalEuro || e.entryFeeEuro !== sample.feeEuro
      || e.quantity !== sample.quantity || e.exitFeeEuro !== 1
      || e.exitProofSha256 !== sha(e.exitProof) || !validProof(e.exitProof, at, e.symbol))
      return { valid: false, reason: "EXIT_EVENT_OR_SOURCE_TAMPER" };
    const item = e.exitProof.instruments.find(x => x.symbol === e.symbol);
    const price = r4(item.medianPrice * e.exitProof.fx.rate * (1 - 0.0005));
    const gross = r4(e.quantity * price);
    const pnl = r4(gross - e.exitFeeEuro - e.entryNotionalEuro - e.entryFeeEuro);
    if (e.exitUnitEuro !== price || e.exitGrossEuro !== gross || e.realizedPnLEuro !== pnl
      || e.id !== "v8-shadow-exit-" + e.closedAt.slice(0, 10) + "-" + e.entryEventId)
      return { valid: false, reason: "EXIT_ACCOUNTING_INVALID" };
    tip = e.hash; last = at; closed.add(e.entryEventId);
    dates.add(e.closedAt.slice(0, 10)); realizedEuro = r4(realizedEuro + pnl);
  }
  if (tip !== ledger.tip) return { valid: false, reason: "CHAIN_TIP_INVALID" };
  return { valid: true, closedTechnicalRoundtrips: ledger.events.length,
    realizedEuro, distinctExitDays: dates.size, scope: "NOT_PHASE9_CERTIFIED" };
}
export function recordV8ShadowExit({ ledger, samples, days, approval, proof, nowIso }) {
  const replay = replayShadowExits({ledger,samples,days,approval});
  if (!replay.valid) return { status: "BLOCKED", reason: replay.reason, ledger, eventsAdded: 0 };
  const now = ms(nowIso);
  if (!Number.isFinite(now)) return {status:"BLOCKED",reason:"INVALID_CLOCK",ledger,eventsAdded:0};
  if (ledger.activatedAt === null) return {status:"ACTIVATED_NO_BACKFILL",
    reason:"FIRST_PROSPECTIVE_RUN", eventsAdded:0,
    ledger:{...ledger,activatedAt:nowIso}};
  if (now < ms(ledger.activatedAt) || now >= Date.parse(approval.expiresAt)
    || now < Date.parse(approval.effectiveFrom))
    return {status:"BLOCKED",reason:"OUTSIDE_V8_WINDOW",ledger,eventsAdded:0};
  if (ledger.events.length >= 10) return {status:"COMPLETE_TECHNICAL",reason:"MAX_10",ledger,eventsAdded:0};
  if (ledger.events.some(e=>e.closedAt.slice(0,10)===nowIso.slice(0,10)))
    return {status:"NO_OP",reason:"EXIT_ALREADY_RECORDED_TODAY",ledger,eventsAdded:0};
  const existing = new Set(ledger.events.map(e=>e.entryEventId));
  const eligible = samples.events.filter(s=>!existing.has(s.id)
    && s.occurredAt.slice(0,10) < nowIso.slice(0,10)
    && ms(s.occurredAt) < now - DAY_MS
    && validProof(proof,now,s.symbol))
    .sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt));
  if (!eligible.length) return {status:"NO_OP",reason:"NO_ELIGIBLE_SAMPLE_WITH_FRESH_2_PROVIDER_EXIT",ledger,eventsAdded:0};
  const sample = eligible[0], item=proof.instruments.find(x=>x.symbol===sample.symbol);
  const exitUnitEuro = r4(item.medianPrice * proof.fx.rate * (1 - 0.0005));
  const exitGrossEuro = r4(sample.quantity * exitUnitEuro);
  const entryNotionalEuro = sample.notionalEuro, entryFeeEuro = sample.feeEuro, exitFeeEuro=1;
  const realizedPnLEuro = r4(exitGrossEuro - exitFeeEuro - entryNotionalEuro - entryFeeEuro);
  const body = {
    id:"v8-shadow-exit-"+nowIso.slice(0,10)+"-"+sample.id,
    prevHash:ledger.tip,closedAt:nowIso,entryEventId:sample.id,entryEventHash:sample.hash,
    entryAt:sample.occurredAt,symbol:sample.symbol,market:"US_EQUITIES",side:"SELL",
    quantity:sample.quantity,entryNotionalEuro,entryFeeEuro,exitUnitEuro,
    exitGrossEuro,exitFeeEuro,realizedPnLEuro,exitProof:proof,exitProofSha256:sha(proof),
    scope:"V8_TECHNICAL_EXPERIMENT_NOT_STRATEGY",simulated:true,
    certificationCredit:0,strategySignalCertified:false,
    liveTradingAllowed:false,brokerConnectivityAllowed:false,
  };
  const event={...body,hash:sha(body)};
  const next={...ledger,events:[...ledger.events,event],tip:event.hash};
  const after=replayShadowExits({ledger:next,samples,days,approval});
  if (!after.valid) throw Error("SHADOW_EXIT_POST_WRITE_REPLAY_"+after.reason);
  return {status:"TECHNICAL_EXIT_RECORDED",reason:null,eventsAdded:1,
    realizedPnLEuro,totalRealizedEuro:after.realizedEuro,ledger:next};
}
async function main() {
  const read = name => JSON.parse(readFileSync(resolve(ROOT,"data",name),"utf8"));
  const approval=read("paper-v8-technical-approval.json");
  // Existing V8 core remains exactly pinned. We do not edit or repin it.
  for (const file of PINNED_V8_FILES) {
    const blob=execFileSync("git",["hash-object",file],{cwd:ROOT,encoding:"utf8"}).trim();
    if (blob !== approval.coreFileBlobs[file]) throw Error("V8_PINNED_BASELINE_DRIFT");
  }
  const samples=read("paper-v8-technical-samples.json");
  const days=read("paper-v8-technical-days.json");
  const ledger=read("paper-v8-shadow-exits.json");
  const nowIso=new Date().toISOString();
  let proof=null, proofReason="NO_FRESH_PROOF";
  if (ledger.activatedAt !== null && !ledger.events.some(e=>e.closedAt.slice(0,10)===nowIso.slice(0,10))) {
    const p=buildV8Proof({
      session:read("paper-market-session.json"),
      coverage:read("execution-market-coverage.json"),
      executionEvidence:read("execution-market-evidence.json"),
      fx:read("paper-fx-evidence.json"),nowIso,
    });
    proof=p.valid?p.proof:null;
    proofReason=p.reason||null;
  }
  const result=recordV8ShadowExit({ledger,samples,days,approval,proof,nowIso});
  if (result.ledger!==ledger) {
    const file=resolve(ROOT,"data","paper-v8-shadow-exits.json");
    const temp=file+".tmp";
    writeFileSync(temp,JSON.stringify(result.ledger,null,2)+"\n",{mode:0o600});
    renameSync(temp,file);
  }
  console.log("V8 technical shadow exits: "+JSON.stringify({
    status:result.status,reason:result.reason||proofReason,
    added:result.eventsAdded,closures:result.ledger.events.length,
    totalRealizedEuro:replayShadowExits({ledger:result.ledger,samples,days,approval}).realizedEuro,
    scope:"EXPERIMENTAL_TECHNICAL_ONLY",phase9CertificationCredit:0,
    liveTradingAllowed:false,brokerConnectivityAllowed:false,
  }));
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
