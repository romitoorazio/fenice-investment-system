import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  parseIexShadowSymbols, makeIexShadowProof, observeIexShadowProof, finishIexShadowProof,
} from "../lib/monitor/iex-shadow-proof.mjs";

assert.deepEqual(parseIexShadowSymbols("aapl,msft,AAPL"), ["AAPL", "MSFT"]);
for (const invalid of ["", "../secret", "AAPL;rm", "AAPL,$"+"{BAD}", Array.from({length:31}, (_,i)=>"S"+i).join(",")]) {
  assert.throws(() => parseIexShadowSymbols(invalid));
}
const at = Date.parse("2026-10-30T16:20:00.000Z");
const proof = makeIexShadowProof(["AAPL", "MSFT"], new Date(at - 3000).toISOString());
assert.equal(proof.paperQuorumCredit, 0);
proof.authenticated = true;
proof.subscriptionConfirmed = true;
observeIexShadowProof(proof, [
  { T: "t", S: "AAPL", p: 180.2, t: new Date(at - 500).toISOString() },
  { T: "q", S: "MSFT", bp: 405.1, ap: 405.15, t: new Date(at - 119999).toISOString() },
  { T: "q", S: "AAPL", bp: 1.0, ap: 2.0, t: new Date(at - 121000).toISOString() },
  { T: "t", S: "AAPL", p: 100, t: new Date(at + 6000).toISOString() },
  { T: "t", S: "AAPL", p: -3, t: new Date(at).toISOString() },
  { T: "t", S: "GME", p: 100, t: new Date(at).toISOString() },
], at);
const final = finishIexShadowProof(proof, new Date(at + 1).toISOString());
assert.equal(final.status, "FRESH_IEX_SHADOW_OBSERVED");
assert.equal(final.freshEvents, 2);
assert.equal(final.staleEvents, 1);
assert.equal(final.futureEvents, 1);
assert.equal(final.malformedEvents, 1);
assert.equal(final.ignoredEvents, 1);
assert.equal(final.sampledSymbols, 2);
assert.equal(final.providerToReceiptP95UpperBoundMs,null,
  "p95 over all valid observations including stale must not fake a fresh percentile");
assert.deepEqual(final.quoteDeliveryAgeHistogram,
  {le100:0,le500:1,le2000:0,le10000:0,le120000:1,gt120000:1});
const fast = makeIexShadowProof("AAPL", new Date(at).toISOString());
fast.authenticated = true; fast.subscriptionConfirmed = true;
for(let i=0;i<20;i++){
  observeIexShadowProof(fast,{T:"t",S:"AAPL",p:100,
    t:new Date(at-50).toISOString()},at);
}
observeIexShadowProof(fast,{T:"t",S:"AAPL",p:100,
  t:new Date(at-1000).toISOString()},at);
const fastEnd=finishIexShadowProof(fast,new Date(at+2000).toISOString());
assert.equal(fastEnd.providerToReceiptP95UpperBoundMs,100,
  "histogram upper bound is conservative, never asserted as exact P95");
assert.equal(fastEnd.quoteDeliveryAgeHistogram.le100,20);
assert.equal(fastEnd.quoteDeliveryAgeHistogram.le2000,1);
assert.equal(final.realOrders, 0);
assert.equal(final.brokerConnectivityAllowed, false);
assert.equal(final.liveTradingAllowed, false);
assert.equal(final.paperQuorumCredit, 0);
assert.equal(JSON.stringify(final).includes("180.2"), false, "Never persist raw trade prices");
assert.equal(JSON.stringify(final).includes("405.15"), false, "Never persist raw quote prices");
assert.equal(finishIexShadowProof(makeIexShadowProof("SPY", new Date(at).toISOString()), new Date(at+1).toISOString()).status, "NOT_AUTHENTICATED");
const noTicks = makeIexShadowProof("SPY", new Date(at).toISOString());
noTicks.authenticated = true; noTicks.subscriptionConfirmed = true;
assert.equal(finishIexShadowProof(noTicks, new Date(at+1).toISOString()).status, "NO_FRESH_IEX_TICKS");

const workflow = readFileSync(".github/workflows/iex-shadow-realtime.yml", "utf8");
const runner = readFileSync("scripts/run-iex-shadow-monitor.mjs", "utf8");
assert(workflow.includes("node scripts/test-iex-shadow-proof.mjs"));
assert(workflow.includes("node scripts/run-iex-shadow-monitor.mjs"));
assert(workflow.includes("if: github.event_name != 'pull_request'"));
assert(workflow.includes("permissions:\n  contents: read"));
assert(workflow.includes("APCA_API_KEY_ID:"));
assert(workflow.includes("APCA_API_SECRET_KEY:"));
assert(!runner.includes('"wss://paper-api.alpaca.markets/stream"'));
assert(runner.includes("wss://stream.data.alpaca.markets/v2/iex"));
assert(!workflow.includes("contents: write"));
console.log("Fenice IEX shadow telemetry test: PASS (no raw prices, no PAPER credit, no broker, strict freshness)");
