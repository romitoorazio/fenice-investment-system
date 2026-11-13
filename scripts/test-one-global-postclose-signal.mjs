import assert from 'node:assert/strict';
import {newOneGlobalEodPaperLedger,replayOneGlobalEodPaperLedger} from '../lib/trading/one-global-eod-paper.mjs';
import {buildOneGlobalProspectiveSignalFromDualEod as bridge} from '../lib/trading/one-global-prospective-dual-eod-bridge.mjs';

const sha=x=>x.repeat(64);
const a=180,b=180.10;
const diff=Math.round(Math.abs(a-b)/((a+b)/2)*100*10000)/10000;
const base={
 mode:'ONE_GLOBAL_FIRST_PAPER_DUAL_EOD_RESEARCH_ONLY',
 observedAt:'2026-11-13T22:20:00.000Z',sessionDate:'2026-11-13',
 key:'XNAS:AAPL',mic:'XNAS',currency:'USD',symbol:'AAPL',
 upstreamFamilyIdentitiesIndependentlyAudited:false,
 sources:[{providerId:'alpha-vantage',sourceFamily:'alpha-vantage',payloadSha256:sha('a'),close:a},
          {providerId:'eodhd',sourceFamily:'eodhd',payloadSha256:sha('b'),close:b}],
 closeDifferencePct:diff,researchIndicator:'UPTREND_RESEARCH_ONLY',
 sma5:174,sma20:169,priorSma5:173,
 paperSettlementEligible:false,certifiedVirtualFills:0,phase9Credit:0,
 brokerConnectivityAllowed:false,liveTradingAllowed:false,
};
const t='2026-11-13T22:30:00.000Z';
const initial=newOneGlobalEodPaperLedger();
const r=bridge({report:base,previousLedger:initial,nowIso:t});
assert.equal(r.kind,'SIGNAL');
assert.equal(r.paperFillCreated,false);
assert.equal(r.ledger.events.length,1);
assert.equal(r.ledger.events[0].key,'XNAS:AAPL');
assert.equal(r.ledger.events[0].referenceCloseAt,'2026-11-13T21:00:00.000Z');
assert.equal(r.ledger.events[0].referencePublishedAt,base.observedAt);
assert.equal(r.ledger.events[0].decisionAt,t);
assert.equal(r.ledger.events[0].kind,'SIGNAL');
assert.equal(r.ledger.events[0].sourceRightsIndependentlyCertified,false);
assert.equal(r.ledger.cashEuro,1000);
assert.deepEqual(r.ledger.positions,{});
assert.deepEqual(replayOneGlobalEodPaperLedger(r.ledger).pendingSignals,['XNAS:AAPL']);
assert.equal(replayOneGlobalEodPaperLedger(r.ledger).virtualBuys,0);
assert.equal(r.ledger.phase9Credit,0);
assert.equal(r.ledger.liveTradingAllowed,false);
assert.equal(r.ledger.brokerConnectivityAllowed,false);
assert.equal(initial.events.length,0,'original input must remain immutable');

const bad=(delta,regex)=>assert.throws(()=>bridge({
 report:delta.report??base,previousLedger:delta.previousLedger??initial,nowIso:delta.nowIso??t,
}),regex);
bad({nowIso:'2026-11-13T20:30:00.000Z'},/NOT_SAME_DAY_POSTCLOSE_PROSPECTIVE/);
bad({nowIso:'2026-11-14T02:00:00.000Z'},/NOT_SAME_DAY_POSTCLOSE_PROSPECTIVE/);
bad({nowIso:'2026-11-16T22:30:00.000Z'},/NOT_SAME_DAY_POSTCLOSE_PROSPECTIVE/);
bad({report:{...base,observedAt:'2026-11-13T20:50:00.000Z'}},/CLOSE_NOT_PROVEN_COMPLETE/);
bad({report:{...base,observedAt:'2026-11-13T21:05:00.000Z'}},/CLOSE_NOT_PROVEN_COMPLETE/);
bad({report:{...base,symbol:'CBA'}},/RESEARCH_GATE_NOT_MET/);
bad({report:{...base,researchIndicator:'NO_UPTREND'}},/RESEARCH_GATE_NOT_MET/);
bad({report:{...base,sma5:165}},/RESEARCH_GATE_NOT_MET/);
bad({report:{...base,paperSettlementEligible:true}},/RESEARCH_GATE_NOT_MET/);
bad({report:{...base,liveTradingAllowed:true}},/RESEARCH_GATE_NOT_MET/);
bad({report:{...base,upstreamFamilyIdentitiesIndependentlyAudited:true}},/RESEARCH_GATE_NOT_MET/);
bad({report:{...base,closeDifferencePct:0.4}},/SOURCE_DISAGREEMENT/);
bad({report:{...base,sources:[base.sources[0],{...base.sources[0]}]}},/TWO_SOURCE_METADATA_INVALID/);
bad({report:{...base,sources:[base.sources[0],{...base.sources[1],close:220}]}},/SOURCE_DISAGREEMENT/);
bad({previousLedger:r.ledger},/PENDING_SIGNAL_ALREADY_EXISTS/);

// US daylight savings: 16:00 New York = 20:00 UTC in March.
const spring=bridge({
 report:{...base,sessionDate:'2026-03-13',observedAt:'2026-03-13T21:20:00.000Z'},
 previousLedger:initial,nowIso:'2026-03-13T21:30:00.000Z',
});
assert.equal(spring.ledger.events[0].referenceCloseAt,'2026-03-13T20:00:00.000Z');
assert.equal(spring.ledger.events[0].referenceSessionDate,'2026-03-13');
assert.equal(spring.ledger.events[0].sourceRightsIndependentlyCertified,false);
console.log('PASS FENICE: dual EOD research -> ORIGINAL private postclose SIGNAL; strict replay, duplicate blocking, DST, stale/future/price divergence, zero fills/Directa.');
