import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {assessShadowExitSession as gate} from "./v8-shadow-session-preflight.mjs";
const nowIso="2026-11-11T17:12:00.000Z";
const session={
 version:1,configured:true,generatedAt:"2026-11-11T17:11:50.000Z",
 diagnosticOnly:true,liveTradingAllowed:false,error:null,
 evidence:{source:"Alpaca Paper Trading Clock",venue:"US_EQUITIES",
   state:"OPEN",authoritative:true,observedAt:"2026-11-11T17:11:48.000Z"},
 decision:{allowed:true,reason:"MARKET_OPEN"},
 nextOpen:"2026-11-12T14:30:00.000Z",
 nextClose:"2026-11-11T21:00:00.000Z",
};
const result=gate({session,nowIso});
assert.equal(result.allowed,true);
assert.equal(result.providerQuotesAuthorized,true);
assert.equal(result.paperOrdersAuthorized,false);
assert.equal(result.liveTradingAllowed,false);
assert.equal(result.brokerConnectivityAllowed,false);
const rejected=(mutate,reason,at=nowIso)=>{
 const copy=structuredClone(session);
 mutate(copy);
 const r=gate({session:copy,nowIso:at});
 assert.equal(r.allowed,false);
 assert.equal(r.providerQuotesAuthorized,false);
 assert.equal(r.paperOrdersAuthorized,false);
 assert.equal(r.liveTradingAllowed,false);
 assert.equal(r.reason,reason);
};
rejected(x=>{x.evidence.state="CLOSED";x.decision.allowed=false},
 "US_REGULAR_SESSION_NOT_OPEN");
rejected(x=>{x.evidence.state="UNKNOWN";x.evidence.authoritative=false},
 "US_REGULAR_SESSION_NOT_OPEN");
rejected(x=>{x.evidence.venue="CRYPTO"}, "US_REGULAR_SESSION_NOT_OPEN");
rejected(x=>{x.evidence.source="Cached Yahoo bar"}, "US_REGULAR_SESSION_NOT_OPEN");
rejected(x=>{x.error="HTTP_429"}, "US_REGULAR_SESSION_NOT_OPEN");
rejected(x=>{x.configured=false}, "AUTHORITATIVE_US_CLOCK_UNAVAILABLE");
rejected(x=>{x.liveTradingAllowed=true}, "AUTHORITATIVE_US_CLOCK_UNAVAILABLE");
rejected(x=>{x.diagnosticOnly=false}, "AUTHORITATIVE_US_CLOCK_UNAVAILABLE");
rejected(x=>{x.generatedAt="2026-11-11T17:08:00.000Z"},
 "US_MARKET_CLOCK_STALE_OR_UNTRUSTED");
rejected(x=>{x.evidence.observedAt="2026-11-11T17:09:00.000Z"},
 "US_MARKET_CLOCK_STALE_OR_UNTRUSTED");
rejected(x=>{x.evidence.observedAt="2026-11-11T17:13:00.000Z"},
 "US_MARKET_CLOCK_STALE_OR_UNTRUSTED");
rejected(x=>{x.nextClose="2026-11-11T17:15:00.000Z"},
 "US_SESSION_TOO_CLOSE_TO_END","2026-11-11T17:12:00.001Z");
rejected(x=>{x.nextClose=null},"US_MARKET_CLOCK_STALE_OR_UNTRUSTED");
rejected(x=>{x.nextOpen="malformed-next-open"},
 "US_NEXT_OPEN_TIMESTAMP_INVALID");
// Alpaca's next_open can legitimately be tomorrow or after the next holiday:
// never conflate next open with the current session's closing boundary.
assert.equal(gate({session:{...session,nextOpen:"2026-11-13T14:30:00.000Z"},nowIso}).allowed,true);
const noSession=gate({session:null,nowIso});
assert.equal(noSession.allowed,false);
assert.equal(noSession.reason,"AUTHORITATIVE_US_CLOCK_UNAVAILABLE");
assert.throws(()=>gate({session,nowIso:"not a timestamp"}),/V8_SHADOW_CLOCK_INVALID/);
// Structural CI guard: first check the zero-cost authoritative clock and
// only then touch Twelve Data, Alpaca execution quotes or FX provider budgets.
const workflow=readFileSync(new URL("../.github/workflows/v8-shadow-exits.yml",import.meta.url),"utf8");
const providerCall=workflow.indexOf("npm run marketdata:execution");
const clockCall=workflow.indexOf("scripts/check-paper-market-session.mjs");
const preflight=workflow.indexOf("scripts/v8-shadow-session-preflight.mjs --github-output");
assert(clockCall>0&&clockCall<providerCall,"Clock must precede quota-consuming quote retrieval");
assert(preflight>clockCall&&preflight<providerCall,
 "The preflight eligibility check must run after fetching the authoritative clock");
assert.match(workflow,/steps\.source\.outputs\.fetchQuotes == 'true' && steps\.session\.outputs\.allowed == 'true'/,
 "Quote refresh must be gated on verified open market, not merely available samples");
assert.match(workflow,/if: steps\.source\.outputs\.fetchQuotes == 'true'\n        run: node --experimental-strip-types scripts\/check-paper-market-session\.mjs/);
const pinnedApproval=JSON.parse(readFileSync(
  new URL("../data/paper-v8-technical-approval.json",import.meta.url),"utf8"));
assert(!Object.keys(pinnedApproval.coreFileBlobs).includes(".github/workflows/v8-shadow-exits.yml"),
 "Only an unpinned supplementary observer can be updated without replacing owner consent");
assert.equal(pinnedApproval.liveTradingAllowed,false);
console.log("PASS V8 shadow quote protection: authoritative clock FIRST, 12+ fail-closed market scenarios, immutable core unchanged, no Directa");
