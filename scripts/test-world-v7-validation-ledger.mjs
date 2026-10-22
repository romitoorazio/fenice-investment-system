import assert from "node:assert/strict";
import {updateWorldV7ValidationLedger as run} from "../lib/intelligence/world-v7-validation-ledger.mjs";
const now=new Date("2026-10-22T16:20:00.000Z"),at="2026-10-22T15:41:53.432Z";
const us={version:1,diagnosticOnly:true,liveTradingAllowed:false,
 brokerSubmissionAllowed:false,forwardPaperFills:0,
 independentEntitlementCertified:false,providerQuoteRightsCertified:false,
 changesV6:false,generatedAt:at,observations:[
 {mic:"ARCX",symbol:"SPY",lastSampleAt:at,sampleTimes:[at],latestCompatible:true},
 {mic:"XNAS",symbol:"NVDA",lastSampleAt:at,sampleTimes:[at],latestCompatible:false},
]};
const eod={version:1,mode:"WORLD_V7_EOD_RESEARCH_ONLY",
 generatedAt:"2026-10-22T16:15:00.000Z",liveTradingAllowed:false,
 realtimePaperEligible:false,brokerConnectivityAllowed:false,
 historicalReplay:{forwardVerifiedPaperFills:0,marketDataRightsCertified:false},records:{}};
for(const [mic,ticker,status] of [
 ["XETR","DTE","TENTATIVE_COMPLETED_DAILY_RESEARCH"],
 ["XMIL","ENEL","RETURNED_SYMBOL_MISMATCH"],
 ["XTKS","7203","INVALID_SYMBOL_OR_ACCESS"]]){
 eod.records[mic]={venue:mic,mode:"WORLD_V7_EOD_RESEARCH_ONLY",
   analyzedAt:"2026-10-22T16:14:00.000Z",liveTradingAllowed:false,
   paperFillCount:0,licensedPaperSource:false,exactMicCertified:false,
   ticker,currency:mic==="XTKS"?"JPY":"EUR",status,
   ...(mic==="XETR"?{completeSessions:100,lastCompleteBarDate:"2026-10-21"}:{})};
}
const access={schemaVersion:1,mode:"PROVIDER_ACCESS_DIAGNOSTIC_ONLY",
 paperReady:false,liveTradingAllowed:false,brokerConnectivityAllowed:false,
 records:{XTKS:{venue:"XTKS",recordedAt:"2026-10-22T15:32:00.000Z",
 provider:"twelve-data",quoteFamiliesApproved:0,paperReady:false,
 liveTradingAllowed:false,privatePricePublished:false,target:{mic:"XTKS",symbol:"7203"},
 quote:{paperEligible:false,status:"NOT_FOUND_OR_INVALID_IDENTIFIER"},
 catalogue:{requiredPlan:"Basic"}}}};
const a=run(null,{us,eod,access},{now});
assert.equal(a.added,6);
assert.equal(a.ledger.summary.regions.length,5);
assert.equal(a.ledger.summary.venuesTracked,8);
assert.equal(a.ledger.venues.ARCX.researchDays,1);
assert.equal(a.ledger.venues.XNAS.researchDays,0);
assert.equal(a.ledger.venues.XETR.researchDays,1);
assert.equal(a.ledger.venues.XMIL.researchDays,0);
assert.equal(a.ledger.venues.XTKS.researchDays,0);
assert.equal(a.ledger.venues.BVMF.researchDays,0);
assert.equal(a.ledger.venues.XASX.researchDays,0);
assert.equal(a.ledger.certifiedPaperFills,0);
assert.equal(a.ledger.paperEligible,false);
const again=run(a.ledger,{us,eod,access},{now});
assert.equal(again.added,0);
assert.equal(again.ledger.summary.totalEvents,6);
assert.equal(run(null,{us,eod,access},{now:new Date("2026-10-23T16:20:00.000Z")}).added,0);
const bad={...eod,realtimePaperEligible:true};
assert.equal(run(null,{eod:bad},{now}).added,0);
const fail=structuredClone(access);fail.records.XTKS.quote.paperEligible=true;
assert.equal(run(null,{access:fail},{now}).added,0);
const repeat=structuredClone(eod);
repeat.generatedAt="2026-10-23T16:15:00.000Z";
for(const r of Object.values(repeat.records))r.analyzedAt="2026-10-23T16:14:00.000Z";
const b=run(a.ledger,{eod:repeat},{now:new Date("2026-10-23T16:20:00.000Z")});
assert.equal(b.ledger.venues.XETR.researchDays,1,"same bar must never count as new market day");
assert.throws(()=>run({...a.ledger,paperEligible:true},{},{now}),/INVALID_WORLD_V7_LEDGER/);
console.log("V7 5-region forward validation, no backfills, no false rights or PAPER, idempotence PASS");
