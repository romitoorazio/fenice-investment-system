import assert from "node:assert/strict";
import {accumulateV7ProviderContinuity} from "../lib/intelligence/v7-provider-continuity.mjs";
const now=new Date("2026-10-22T15:02:00.000Z");
const start="2026-10-22T15:00:30.000Z",end="2026-10-22T15:01:00.000Z";
const report={
 generatedAt:end,state:"OPEN_SESSION_SAMPLED",quoteProvidersQueried:true,
 sessionFreshAtReport:true,diagnosticOnly:true,liveTradingAllowed:false,
 brokerConnectivityAllowed:false,paperStateModified:false,campaignEvidenceModified:false,
 maxAgeSeconds:120,maxSpreadPercent:0.75,
 marketSession:{evidence:{venue:"US_EQUITIES",state:"OPEN",authoritative:true,observedAt:start},
 decision:{allowed:true,state:"OPEN"}},
 targets:[{symbol:"SPY",exchangeMic:"ARCX",alpacaCandidate:true,twelveDataCandidate:true,
 alpaca:{ok:true,freshVerifiedQuote:true,observedAt:"2026-10-22T15:00:55.000Z",provenance:"authenticated-alpaca-iex-latest-quote",priceBasis:"IEX_QUOTE_MIDPOINT",midpoint:100},
 twelveData:{ok:true,freshVerifiedQuote:true,observedAt:"2026-10-22T15:00:45.000Z",provenance:"authenticated-twelve-data-batch-quote",timestampVerified:true,venueVerified:true,price:100.1},
 crossSourceSpreadPercent:0.09,withinCurrentQuorumSpreadLimit:true,dualSourceFeasible:true,quorumCompatible:true}],
};
const empty={version:1,observations:[]};
const first=accumulateV7ProviderContinuity(empty,report,{now});
assert.equal(first.changed,true);
assert.equal(first.ledger.summary.observedDays,1);
assert.equal(first.ledger.summary.daysWithAnyDualProviderConfirmation,1);
assert.equal(first.ledger.summary.totalCompatibleSamples,1);
assert.equal(first.ledger.forwardPaperFills,0);
assert.equal(first.ledger.independentEntitlementCertified,false);
assert.equal(first.ledger.liveTradingAllowed,false);
assert.equal(first.ledger.observations[0].sampleTimes.length,1);
assert(!JSON.stringify(first.ledger).includes("100.1"),"no raw quote leakage");
const again=accumulateV7ProviderContinuity(first.ledger,report,{now});
assert.equal(again.changed,false);
assert.equal(again.ledger.summary.totalRecordedSamples,1);
const later=structuredClone(report);
later.generatedAt="2026-10-22T15:01:45.000Z";
later.marketSession.evidence.observedAt="2026-10-22T15:01:35.000Z";
later.targets[0].alpaca.observedAt="2026-10-22T15:01:30.000Z";
later.targets[0].twelveData.observedAt="2026-10-22T15:01:25.000Z";
later.targets[0].crossSourceSpreadPercent=1.5;
later.targets[0].withinCurrentQuorumSpreadLimit=false;
later.targets[0].quorumCompatible=false;
const second=accumulateV7ProviderContinuity(first.ledger,later,{now});
assert.equal(second.ledger.summary.observedDays,1);
assert.equal(second.ledger.summary.totalRecordedSamples,2);
assert.equal(second.ledger.summary.totalCompatibleSamples,1);
assert.equal(second.ledger.observations[0].latestCompatible,false);
assert.equal(second.ledger.observations[0].compatibleSamples,1);
const noClock=structuredClone(report);
noClock.state="SKIPPED_NO_OPEN_SESSION";
noClock.marketSession.decision.allowed=false;
const skipped=accumulateV7ProviderContinuity(first.ledger,noClock,{now});
assert.equal(skipped.admitted,false);assert.equal(skipped.changed,false);
assert.equal(skipped.ledger.summary.totalRecordedSamples,1);
const wrong=structuredClone(report);
wrong.targets[0].alpaca.provenance="fabricated";
assert.equal(accumulateV7ProviderContinuity(empty,wrong,{now}).ledger.summary.totalCompatibleSamples,0);
const stale=structuredClone(report);
stale.targets[0].twelveData.observedAt="2026-10-22T14:58:00.000Z";
assert.equal(accumulateV7ProviderContinuity(empty,stale,{now}).ledger.summary.totalCompatibleSamples,0);
const duplicate=structuredClone(report);
duplicate.targets.push(structuredClone(duplicate.targets[0]));
assert.throws(()=>accumulateV7ProviderContinuity(empty,duplicate,{now}),/INVALID_INSTRUMENT/);
const old=structuredClone(report);old.generatedAt="2026-10-20T15:01:00.000Z";
assert.throws(()=>accumulateV7ProviderContinuity(empty,old,{now}),/STALE_OR_FUTURE/);
assert.throws(()=>accumulateV7ProviderContinuity({version:1,observations:[{}]},report,{now}),/INVALID_PREVIOUS/);
console.log("V7 forward provider continuity: authenticated multi-provider daily evidence, no backfill, no price publication, idempotent, V6/LIVE isolation PASS");
