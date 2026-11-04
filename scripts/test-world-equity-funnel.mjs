import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {screenWorldEquityReferences as screen} from "../lib/research/world-equity-funnel.mjs";
import {readActiveMarketIdentifiers} from "../lib/research/iso-market-identifiers.mjs";
const read=async name=>JSON.parse(await readFile(new URL("../data/"+name,import.meta.url),"utf8"));
const world=await read("global-market-universe.json");
const activeMics=readActiveMarketIdentifiers([
 '"MIC","OPERATING MIC","ACRONYM","ISO COUNTRY CODE (ISO 3166)","STATUS","MARKET NAME"',
 ...[["XNAS","XNAS","US"],["XHKG","XHKG","HK"],["XTKS","XJPX","JP"],
  ["XMIL","XMIL","IT"],["BVMF","BVMF","BR"],["XSAU","XSAU","SA"],
  ["XJSE","XJSE","ZA"],["XNZE","XNZE","NZ"],["XNYS","XNYS","US"]]
  .map(([mic,operatingMic,country])=>`"${mic}","${operatingMic}",,"${country}","ACTIVE","Market, the ""venue"""`),
 '"ZOLD","ZOLD",,"GB","EXPIRED","Closed venue"',
].join("\r\n"));
assert.equal(activeMics.get("XTKS").operatingMic,"XJPX");
assert.equal(activeMics.has("ZOLD"),false);
const exchanges=[
 {code:"NASDAQ",mic_code:"XNAS",country:"United States"},
 {code:"HKEX",mic_code:"XHKG",country:"Hong Kong"},
 {code:"JPX",mic_code:"XTKS",country:"Japan"},
 {code:"MTA",mic_code:"XMIL",country:"Italy"},
 {code:"B3",mic_code:"BVMF",country:"Brazil"},
 {code:"FAKE",mic_code:"XNAS",country:"China"},
];
const stock=(symbol,country,exchange,name="Listed company",currency="USD")=>({symbol,country,exchange,name,currency,type:"Common Stock"});
const stocks=[
 stock("AAPL","United States","NASDAQ"),
 stock("AAPL","United States","NASDAQ"),
 stock("7203","Japan","JPX","Toyota Motor","JPY"),
 stock("0700","Hong Kong","HKEX","Tencent Holdings","HKD"),
 stock("ENEL","Italy","MTA","Enel S.p.A.","EUR"),
 stock("PETR4","Brazil","B3","Petrobras","BRL"),
 {...stock("WARRANT","Hong Kong","HKEX"),type:"Warrant"},
 stock("BAD$","US","NASDAQ"),
 stock("BAD","US","UNLISTED"),
 stock("MISMATCH","CN","FAKE"),
 stock("CONFLICT","US","NASDAQ","Different firm A"),
 stock("CONFLICT","US","NASDAQ","Different firm B"),
 stock("EXCLUDED","RU","NASDAQ")
];
const at="2026-10-19T06:00:00.000Z";
const run=(stockRows=stocks,limit=20)=>screen({stocks:stockRows,exchanges,world,activeMics,at,limit});
const result=run();
assert.equal(result.summary.read,stocks.length);
assert.equal(result.summary.accepted,5);
assert.equal(result.summary.selected,5);
assert.equal(result.summary.excluded.nonCommonStock,1);
assert.equal(result.summary.excluded.duplicateOrConflict,2);
assert.equal(result.summary.regions,4);
assert.deepEqual(result.selected.map(x=>x.ticker).sort(),["0700","7203","AAPL","ENEL","PETR4"]);
const again=run([...stocks].reverse());
assert.deepEqual(result.selected,again.selected,"Provider order must not affect chosen references");
const tiny=run(stocks,2);
assert.equal(tiny.summary.selected,2);
assert.equal(new Set(tiny.selected.map(x=>x.mic)).size,2);
for(const r of result.selected){
 assert.equal(r.price,null);
 assert.equal(r.investmentScore,null);
 assert.equal(r.paperAllowed,false);
 assert.equal(r.liveAllowed,false);
 assert.equal(r.brokerOrderAllowed,false);
}
for(const limit of [0,2001,-1,1.1])assert.throws(()=>run(stocks,limit),/BAD_WORLD_LIMIT/);
assert.throws(()=>screen({stocks,exchanges,world,activeMics,at:"yesterday",limit:5}),/BAD_WORLD_TIMESTAMP/);
const tenThousand=Array.from({length:10_000},(_,i)=>stock("T"+String(i).padStart(6,"0"),"US","NASDAQ"));
const big=run(tenThousand,500);
assert.equal(big.summary.read,10_000);
assert.equal(big.summary.accepted,10_000);
assert.equal(big.summary.selected,500);
assert.equal(new Set(big.selected.map(x=>x.ticker)).size,500);
const noMIC=exchanges.filter(x=>x.code!=="NASDAQ");
const safer=screen({stocks:tenThousand,exchanges:noMIC,world,activeMics,at,limit:500});
assert.equal(safer.summary.selected,500,"Known exchange aliases may provide a curated MIC");
const regionalExchanges=[{code:"XSAU",name:"Tadawul",country:"Saudi Arabia"},{code:"XJSE",country:"South Africa"},{code:"XNZE",country:"New Zealand"}];
const worldwide=screen({
 stocks:[...tenThousand,...stocks,stock("2222","SA","Tadawul","Aramco","SAR"),
  stock("NPN","ZA","XJSE","Naspers","ZAR"),stock("AIR","NZ","XNZE","Air New Zealand","NZD"),
  stock("IBM","US","XNYS","IBM","USD")],
 exchanges:[...exchanges,...regionalExchanges],world,activeMics,at,limit:9,
});
assert.equal(worldwide.summary.regions,5);
assert.equal(new Set(worldwide.selected.map(x=>x.mic)).size,9,"Each venue gets one place before any gets a second");
assert.equal(worldwide.summary.byVenue.XNAS.total,10_001);
assert.equal(worldwide.summary.byVenue.XNAS.selected,1);
assert.equal(worldwide.summary.byVenue.XSAU.selected,1);
console.log("FENICE WORLD 10K synthetic stocks, strict common equity, MIC, fairness, de-dup and LIVE lock: PASS");
