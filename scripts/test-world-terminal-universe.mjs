import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 WORLD_YAHOO_RESEARCH_SYMBOLS,worldResearchTerminalDefinitions,verifiesWorldYahooResearchMeta,
} from "../lib/intelligence/world-terminal-universe.mjs";
const load=name=>JSON.parse(readFileSync(new URL("../data/"+name,import.meta.url),"utf8"));
const master=load("instrument-master.json");
const seeds=load("world-paper-v7-research-seeds.json");
const list=worldResearchTerminalDefinitions(master,seeds);
assert.equal(list.length,11,"11 primary-venue non-US equities must join terminal research intake");
assert.equal(new Set(list.map(x=>x[0])).size,list.length);
assert.equal(new Set(list.map(x=>x[5].exchangeMic+":"+x[0])).size,list.length);
assert.equal(list.find(x=>x[0]==="ENEL")[1],"ENEL.MI");
assert.equal(list.find(x=>x[0]==="SIE")[1],"SIE.DE");
assert.equal(list.find(x=>x[0]==="7203")[1],"7203.T");
assert.equal(list.find(x=>x[0]==="0700")[1],"0700.HK");
assert.equal(list.find(x=>x[0]==="CBA")[1],"CBA.AX");
assert(list.every(x=>x[5].paperExecutionAllowed===false
  &&x[5].brokerSubmissionAllowed===false&&x[5].researchOnly===true
  &&x[5].exactMicExecutionVerified===false));
for(const item of list){
  const def=item[5];
  const meta={symbol:def.providerTicker,currency:def.currency,regularMarketPrice:100};
  assert.equal(verifiesWorldYahooResearchMeta(meta,item),true);
  assert.equal(verifiesWorldYahooResearchMeta({...meta,symbol:"WRONG.TICKER"},item),false);
  assert.equal(verifiesWorldYahooResearchMeta({...meta,currency:"USD"===def.currency?"EUR":"USD"},item),false);
  assert.equal(verifiesWorldYahooResearchMeta({...meta,regularMarketPrice:0},item),false);
}
const wrong=structuredClone(master);
wrong.instruments.find(x=>x.ticker==="ENEL").currency="USD";
assert.equal(worldResearchTerminalDefinitions(wrong,seeds).some(x=>x[0]==="ENEL"),false,
  "Mismatch must omit research instead of silently converting currency");
const extra=structuredClone(seeds);
extra.instruments.push({...extra.instruments[0]});
assert.throws(()=>worldResearchTerminalDefinitions(master,extra),
  /WORLD_TERMINAL_DUPLICATE_EXACT_LISTING/);
const altered=structuredClone(master);
altered.instruments.find(x=>x.ticker==="SIE").exchangeMic="XMIL";
assert.equal(worldResearchTerminalDefinitions(altered,seeds).some(x=>x[0]==="SIE"),false);
assert.equal(Object.keys(WORLD_YAHOO_RESEARCH_SYMBOLS).length,11);
const terminal=readFileSync(new URL("./run-terminal-engine.mjs",import.meta.url),"utf8");
assert.match(terminal,/worldResearchTerminalDefinitions/);
assert.match(terminal,/verifiesWorldYahooResearchMeta/);
assert.match(terminal,/globalVenueResearchOnly/);
assert.doesNotMatch(terminal,/submitDirectaOrder|executeBrokerOrder/);
console.log("PASS exact-venue worldwide terminal research intake: 11 symbols, research currency identity, no LIVE/PAPER or forged symbol");
