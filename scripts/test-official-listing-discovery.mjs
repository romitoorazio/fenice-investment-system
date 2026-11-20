import assert from "node:assert/strict";
import {
  parseNasdaqTradingAdds,parseNasdaqTradingAddsWithDiagnostics,parseSecEdgarMaster,makeOfficialListingResearch
} from "../lib/research/official-listing-discovery.mjs";

const nasdaq=[
"Symbol|Company Name|NASDAQ Action|BX Action|PSX Action|Effective Date|Primary Listing Market",
"ANT|Anthropic, PBC|Add|Add|Add|11/19/2026|Q",
"ANT|Anthropic, PBC|Add|Add|Add|11/19/2026|Q",
"CGBI|Capital Group Multi-Asset Income Builder ETF|Add|Add|Add|11/19/2026|P",
"DEL|Removed issuer|Delete|Delete|Delete|11/19/2026|Q",
"File Creation Time: 1119202609:32|||||"
].join("\n");
const added=parseNasdaqTradingAdds(nasdaq);
assert.deepEqual(added.map(x=>x.symbol).sort(),["ANT","CGBI"]);
assert.equal(added[0].ipoOfferPrice,null);
assert.equal(added[0].firstTradeAt,null);
assert.equal(added[0].classification,"LISTING_ADD_NOT_IPO_OR_FIRST_TRADE_PROOF");
assert.deepEqual(parseNasdaqTradingAdds(nasdaq),parseNasdaqTradingAdds(nasdaq));
const unsupported=nasdaq.replace("DEL|Removed issuer|Delete",
  "X$Y|Unsupported exchange symbol|Add|Add|Add|11/19/2026|Q\nDEL|Removed issuer|Delete");
const diagnostics=parseNasdaqTradingAddsWithDiagnostics(unsupported);
assert.equal(diagnostics.unsupportedAddRows,1);
assert.deepEqual(diagnostics.events.map(x=>x.symbol).sort(),["ANT","CGBI"]);
assert.ok(!diagnostics.events.some(x=>x.symbol.includes("$")));
assert.deepEqual(parseNasdaqTradingAdds(unsupported),diagnostics.events);
assert.throws(()=>parseNasdaqTradingAdds(nasdaq.replace("NASDAQ Action","Wrong Action")),/HEADER/);
assert.throws(()=>parseNasdaqTradingAdds(nasdaq.replace("File Creation Time: 1119202609:32|||||","")),/CREATION_TIME/);
assert.throws(()=>parseNasdaqTradingAdds(nasdaq.replace("11\/19\/2026","02\/30\/2026")),/DATE/);

const edgar=[
"Description: Master Index of EDGAR Dissemination Feed",
"Last Data Received: November 18, 2026",
"CIK|Company Name|Form Type|Date Filed|Filename",
"--------------------------------------------------------------------------------",
"123456|Prospective Issuer Inc.|S-1|2026-11-18|edgar/data/123456/0000123456-26-000001.txt",
"123456|Prospective Issuer Inc.|S-1/A|2026-11-18|edgar/data/123456/0000123456-26-000002.txt",
"999999|Public Issuer|10-K|2026-11-18|edgar/data/999999/0000999999-26-000001.txt"
].join("\n");
const filings=parseSecEdgarMaster(edgar);
assert.equal(filings.length,2);
assert.equal(filings[0].symbol,null);
assert.ok(filings.every(e=>e.sourceUrl.startsWith("https://www.sec.gov/Archives/")));
assert.ok(filings.every(e=>e.classification==="REGISTRATION_NOT_IPO_APPROVAL_OR_LISTING_PROOF"));
assert.throws(()=>parseSecEdgarMaster(edgar.replace("CIK|Company Name","X|Company Name")),/HEADER/);
assert.throws(()=>parseSecEdgarMaster(edgar.replace("2026-11-18|edgar","2026-13-18|edgar")),/DATE/);

const instrumentMaster={instruments:[{ticker:"CGBI"},{ticker:"AAPL"}]};
const globalUniverse={instruments:[{symbol:"NVDA"}]};
const report=makeOfficialListingResearch({
  nasdaqEvents:added,secEvents:filings,instrumentMaster,globalUniverse,
  generatedAt:"2026-11-19T15:30:00.000Z",
  sourceStatus:{nasdaq:{status:"OK"},sec:{status:"OK"}}
});
assert.equal(report.status,"OFFICIAL_LISTING_RESEARCH_ONLY");
assert.equal(parseNasdaqTradingAddsWithDiagnostics(nasdaq).unsupportedAddRows,0);
assert.equal(report.summary.newSymbolsOutsideSeed,1);
assert.equal(report.summary.registrationFilingsWithoutVerifiedSymbol,2);
assert.equal(report.events.find(x=>x.symbol==="ANT").inCurrentSeedUniverse,false);
assert.equal(report.events.find(x=>x.symbol==="CGBI").inCurrentSeedUniverse,true);
assert.ok(report.events.every(x=>x.discoveryOnly&&!x.paperAllowed&&!x.liveAllowed&&!x.brokerOrderAllowed));
assert.ok(report.events.every(x=>x.ipoOfferPrice===null&&x.firstTradeAt===null));
assert.throws(()=>makeOfficialListingResearch({nasdaqEvents:added,secEvents:[],instrumentMaster,
  globalUniverse,generatedAt:"garbage",sourceStatus:{}}),/TIME/);
console.log("FENICE official listing discovery: Nasdaq ANT fixture, SEC S-1, dedupe, source failures, universe and LIVE lock: PASS");
