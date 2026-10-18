import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {buildInternationalResearchQueue as build} from "../lib/ui/international-research-queue.ts";
const read=async file=>JSON.parse(await readFile(new URL("../data/"+file,import.meta.url),"utf8"));
const [master,fundamentals,terminal,committee,reference]=await Promise.all(
 ["instrument-master.json","fundamental-research.json","terminal-intelligence.json","investment-committee.json","global-reference-coverage.json"].map(read));
const now=Date.parse("2026-10-19T00:00:00.000Z");
const report=build(master,fundamentals,terminal,committee,reference,now);
assert.equal(report.summary.internationalSeedEquities,9);
assert.equal(report.summary.locallyListed,7);
assert.equal(report.summary.foreignListedOrAdr,2);
assert.equal(report.summary.withIssuerDocuments,2);
assert.equal(report.summary.withCommitteeResearch,2);
assert.equal(report.summary.executionGradeInternationalQuotes,0);
assert.equal(report.catalogueRecent,false);
assert.equal(report.rows.find(r=>r.symbol==="ASML").tradingRegion,"north-america");
assert.equal(report.rows.find(r=>r.symbol==="ASML").issuerRegion,"europe");
assert.equal(report.rows.find(r=>r.symbol==="TSM").listingType,"FOREIGN_LISTING_OR_ADR");
assert.equal(report.rows.find(r=>r.symbol==="SIE").committeeResearchAvailable,false);
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
changed.companies.find(x=>x.ticker==="ASML").observedAt="2026-10-25T00:00:00.000Z";
assert.equal(build(master,changed,terminal,committee,reference,now).rows.find(r=>r.symbol==="ASML").issuerDocumentObserved,false);
for(const path of ["../app/api/research/global-opportunities/route.ts","../app/opportunita-mondo/page.tsx"]){
 const src=await readFile(new URL(path,import.meta.url),"utf8");
 assert.match(src,/buildInternationalResearchQueue/);
 assert.doesNotMatch(src,/submitOrder|sendOrder|executeTrade/);
}
console.log("International issuer queue: 9 issuers, source provenance, ADR mapping, stale catalogue, PAPER/LIVE locks PASS");
