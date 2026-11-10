import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {buildInternationalResearchQueue as build} from "../lib/ui/international-research-queue.ts";
const read=async file=>JSON.parse(await readFile(new URL("../data/"+file,import.meta.url),"utf8"));
const [master,fundamentals,terminal,committee,reference]=await Promise.all(
 ["instrument-master.json","fundamental-research.json","terminal-intelligence.json","investment-committee.json","global-reference-coverage.json"].map(read));
// Provider snapshots are refreshed by scheduled bots. Fix the test clock AFTER
// all source snapshots so fresh SEC evidence is not incorrectly called future.
const now=Math.max(
 Date.parse("2026-10-19T00:00:00.000Z"),
 Date.parse(fundamentals.generatedAt),
 Date.parse(terminal.generatedAt),
 Date.parse(committee.generatedAt)
)+60_000;
const report=build(master,fundamentals,terminal,committee,reference,now);
assert.equal(report.summary.internationalSeedEquities,9);
assert.equal(report.summary.locallyListed,7);
assert.equal(report.summary.foreignListedOrAdr,2);
assert.equal(report.rows.find(r=>r.symbol==="PETR4").issuerRegion,"latin-america-caribbean");
assert.equal(report.rows.find(r=>r.symbol==="PETR4").listingType,"LOCAL_LISTING");
assert.equal(report.summary.withIssuerDocuments,2);
assert.equal(report.summary.withCommitteeResearch,
  report.rows.filter(r=>r.committeeResearchAvailable).length,
  "Research coverage must advance when new venues join the actual committee");
assert.equal(report.summary.executionGradeInternationalQuotes,0);
// The catalogue is now refreshed automatically: old fixed "stale" assertions
// would fail precisely when source collection is working. Test temporal safety.
const referenceAt=Date.parse(reference.generatedAt);
const expectedCatalogueRecent=reference.safety?.researchOnly===true
  &&reference.safety?.paperExecutionAllowed===false
  &&reference.safety?.liveTradingAllowed===false
  &&reference.safety?.brokerConnectivityAllowed===false
  &&reference.safety?.isolatedFromPaperV6InstrumentMaster===true
  &&reference.safety?.changesPaperV6Fingerprint===false
  &&Number.isFinite(referenceAt)&&referenceAt<=now&&now-referenceAt<=72*3600000;
assert.equal(report.catalogueRecent,expectedCatalogueRecent);
assert.equal(build(master,fundamentals,terminal,committee,
  {...reference,generatedAt:new Date(now+60000).toISOString()},now).catalogueRecent,false);
assert.equal(report.rows.find(r=>r.symbol==="ASML").tradingRegion,"north-america");
assert.equal(report.rows.find(r=>r.symbol==="ASML").issuerRegion,"europe");
assert.equal(report.rows.find(r=>r.symbol==="TSM").listingType,"FOREIGN_LISTING_OR_ADR");
const withoutSiemens={...committee,allDecisions:(committee.allDecisions||[])
  .filter(r=>r.symbol!=="SIE")};
assert.equal(build(master,fundamentals,terminal,withoutSiemens,reference,now)
  .rows.find(r=>r.symbol==="SIE").committeeResearchAvailable,false);
const withSiemens={...withoutSiemens,allDecisions:[
  ...withoutSiemens.allDecisions,
  {symbol:"SIE",decision:"ATTENDI",committeeScore:45},
]};
assert.equal(build(master,fundamentals,terminal,withSiemens,reference,now)
  .rows.find(r=>r.symbol==="SIE").committeeResearchAvailable,true,
  "New exact-venue committee entries must become visible after verified research");
assert.equal(report.rows.find(r=>r.symbol==="7203").issuerDocumentObserved,false);
assert.equal(report.rows.find(r=>r.symbol==="SIE").identitySeedVerified,false);
assert.equal(report.rows.find(r=>r.symbol==="SIE").tickerMatchedToProviderCatalogue,false);
assert(report.rows.every(r=>r.currentBidAskVerified===false&&r.liveTradingAllowed===false&&r.paperExecutionAllowed===false&&r.brokerOrderAllowed===false&&r.returnForecastPercent===null&&r.investmentScore===null));
assert(report.rows.every(r=>r.nextDataActions.includes("VERIFY_BID_ASK_LIQUIDITY")&&r.nextDataActions.includes("SEPARATE_PAPER_APPROVAL_REQUIRED")));
assert.equal(build(master,fundamentals,terminal,committee,{...reference,safety:{...reference.safety,liveTradingAllowed:true}},now).rows.every(r=>r.countryCatalogueHasReferences===false),true);
assert.equal(build(master,fundamentals,terminal,committee,{...reference,generatedAt:"2026-10-25T00:00:00.000Z"},now).catalogueRecent,false);
const bad=structuredClone(master);bad.instruments.find(x=>x.ticker==="TSM").exchangeMic="UNKN";
assert.equal(build(bad,fundamentals,terminal,committee,reference,now).rows.find(r=>r.symbol==="TSM").identitySeedVerified,false);
const dup=structuredClone(master);dup.instruments.push({...dup.instruments.find(x=>x.ticker==="ASML")});
assert.equal(build(dup,fundamentals,terminal,committee,reference,now).summary.internationalSeedEquities,9);
const changed=structuredClone(fundamentals);
// Use a genuinely future-dated filing, not a historical constant that has
// become past evidence after the scheduled source refresh.
changed.companies.find(x=>x.ticker==="ASML").observedAt=new Date(now+60_000).toISOString();
assert.equal(build(master,changed,terminal,committee,reference,now).rows.find(r=>r.symbol==="ASML").issuerDocumentObserved,false);
for(const path of ["../app/api/research/global-opportunities/route.ts","../app/opportunita-mondo/page.tsx"]){
 const src=await readFile(new URL(path,import.meta.url),"utf8");
 assert.match(src,/buildInternationalResearchQueue/);
 assert.doesNotMatch(src,/submitOrder|sendOrder|executeTrade/);
}
console.log("International issuer queue: 9 issuers, source provenance, ADR mapping, stale catalogue, PAPER/LIVE locks PASS");
