import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {auditOneGlobalCommitteeWorldCoverage} from "../lib/intelligence/one-global-committee-world-coverage.mjs";
const read=name=>JSON.parse(readFileSync(new URL("../data/"+name,import.meta.url),"utf8"));
const inputs={
 master:read("instrument-master.json"),
 seeds:read("world-paper-v7-research-seeds.json"),
 committee:read("investment-committee.json"),
 terminal:read("terminal-intelligence.json"),
 fundamentals:read("fundamental-research.json"),
 eod:read("world-v7-eod-research.json"),
 world:read("world-v7-validation-ledger.json"),
};
const nowMs=Date.parse(inputs.committee.generatedAt)+60000;
const nowIso=new Date(nowMs).toISOString();
const run=x=>auditOneGlobalCommitteeWorldCoverage({...inputs,...x,nowIso:x?.nowIso||nowIso});
const r=run({});
assert.equal(r.mode,"ONE_GLOBAL_COMMITTEE_WORLD_COVERAGE_DIAGNOSTIC");
assert.equal(r.summary.foreignIssuerUSListings,2);
assert.equal(r.summary.nonUSVenueEquities,11);
assert.equal(r.summary.forwardStrategyPaperEligible,0);
assert.equal(r.summary.certifiedClosedStrategyTrades,0);
assert.equal(r.safety.liveTradingAllowed,false);
assert.equal(r.safety.paperAuthorizationGranted,false);
assert.equal(r.safety.v8TechnicalProofCredited,false);
assert.equal(r.summary.listedEquities,19,"Current master and research seeds: 15+4 equities");
const missed=r.rows.filter(x=>x.nonUSVenue&&!x.committeeResearchPresent);
assert.equal(r.summary.nonUSVenueExcludedFromCommittee,missed.length);
assert.equal(r.researchQueue.length,missed.length);
assert.equal(new Set(r.researchQueue.map(x=>x.key)).size,r.researchQueue.length);
assert(r.researchQueue.every(x=>!x.tradeSignal&&!x.executionAuthorized&&x.expectedProfit===null));
assert(r.rows.every(x=>!x.paperEligible&&!x.brokerSubmissionAllowed&&!x.liveTradingAllowed));
assert(r.rows.every(x=>!Object.hasOwn(x,"price")&&!Object.hasOwn(x,"expectedReturn")));
assert.equal(r.rows.find(x=>x.key==="XNAS:ASML").foreignIssuerUsListing,true);
assert.equal(r.rows.find(x=>x.key==="XNYS:TSM").foreignIssuerUsListing,true);
assert.equal(r.rows.find(x=>x.key==="XNAS:ASML").venueRegion,"north-america");
assert.equal(r.rows.find(x=>x.key==="XETR:SIE").venueRegion,"europe");
assert.equal(r.rows.find(x=>x.key==="XASX:CBA").venueRegion,"oceania");
assert.equal(r.rows.find(x=>x.key==="XTKS:7203").venueRegion,"asia-pacific");
assert.equal(r.rows.find(x=>x.key==="XMIL:ENEL").exactIdentityRecent,false);
const actualEnel=inputs.committee.allDecisions.filter(x=>x.symbol==="ENEL");
const enelResearchCurrent=actualEnel.length===1
  &&Number.isFinite(actualEnel[0].committeeScore)
  &&Date.parse(inputs.committee.generatedAt)<=Date.parse(nowIso)
  &&Date.parse(nowIso)-Date.parse(inputs.committee.generatedAt)<=36*3600000;
assert.equal(r.rows.find(x=>x.key==="XMIL:ENEL").committeeResearchPresent,enelResearchCurrent);
assert.equal(r.rows.find(x=>x.key==="XMIL:ENEL").missingTasks.includes(
  "BUILD_EXACT_LISTING_COMMITTEE_RESEARCH"),!enelResearchCurrent);
assert.equal(r.rows.find(x=>x.key==="XETR:SIE").eodResearchStatus,null,
  "German EOD DTE must never be presented as Siemens SIE");
assert.equal(r.rows.find(x=>x.key==="XMIL:ENEL").eodResearchStatus,"RETURNED_SYMBOL_MISMATCH");
// Test regional round-robin on a deliberately uncovered synthetic snapshot:
const noResearchCommittee={...inputs.committee,allDecisions:[]};
const uncovered=run({committee:noResearchCommittee});
assert.deepEqual(uncovered.researchQueue.slice(0,4).map(x=>x.region),[
  "europe","asia-pacific","latin-america-caribbean","middle-east-africa",
],"Fair regional queue must remain unbiased as real committee coverage evolves");
const withoutEnel={...inputs.committee,allDecisions:inputs.committee.allDecisions
  .filter(x=>x.symbol!=="ENEL")};
const missingEnel=run({committee:withoutEnel});
assert.equal(missingEnel.rows.find(x=>x.key==="XMIL:ENEL").committeeResearchPresent,false);
const withNewDecision={...withoutEnel,allDecisions:[...withoutEnel.allDecisions,
  {symbol:"ENEL",decision:"ATTENDI",committeeScore:58}]};
const updated=run({committee:withNewDecision});
assert.equal(updated.rows.find(x=>x.key==="XMIL:ENEL").committeeResearchPresent,true);
assert.equal(updated.summary.nonUSVenueExcludedFromCommittee,
  missingEnel.summary.nonUSVenueExcludedFromCommittee-1);
assert.equal(updated.rows.find(x=>x.key==="XMIL:ENEL").paperEligible,false,
  "Research coverage never grants execution, regardless of rating");
const fromFuture=run({committee:{...withNewDecision,generatedAt:new Date(nowMs+1000).toISOString()}});
assert.equal(fromFuture.rows.find(x=>x.key==="XMIL:ENEL").committeeResearchPresent,false);
const old=run({committee:{...withNewDecision,generatedAt:new Date(nowMs-40*3600000).toISOString()}});
assert.equal(old.rows.find(x=>x.key==="XMIL:ENEL").committeeResearchPresent,false);
const bad=(modify,reason)=>{
 const x=structuredClone(inputs);modify(x);
 assert.throws(()=>run(x),reason);
};
bad(x=>{x.world.paperEligible=true},/WORLD_COMMITTEE_GLOBAL_LEDGER_UNSAFE/);
bad(x=>{x.world.venues.XETR.paperEligible=true},/WORLD_COMMITTEE_GLOBAL_LEDGER_UNSAFE/);
bad(x=>{x.world.liveTradingAllowed=true},/WORLD_COMMITTEE_GLOBAL_LEDGER_UNSAFE/);
bad(x=>{x.eod.realtimePaperEligible=true},/WORLD_COMMITTEE_EOD_RIGHTS_UNSAFE/);
bad(x=>{x.eod.brokerConnectivityAllowed=true},/WORLD_COMMITTEE_EOD_RIGHTS_UNSAFE/);
bad(x=>{x.seeds.instruments.push({...x.seeds.instruments[0]})},/WORLD_COMMITTEE_DUPLICATE_LISTING/);
assert.throws(()=>run({nowIso:"bad"}),/WORLD_COMMITTEE_CLOCK_INVALID/);
console.log("PASS ONE GLOBAL global committee coverage: 11 non-US listed candidates vs committee, safe US ADR classification, region-balanced research, no PAPER/LIVE, fail-closed forged evidence");
