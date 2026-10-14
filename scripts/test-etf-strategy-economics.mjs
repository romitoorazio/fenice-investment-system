import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildEtfStrategyLab } from "../lib/ui/etf-strategy-economics.ts";

const strategy = (id,annual,drawdown,other={})=>({
  id,label:id,annualizedReturnPercent:annual,totalReturnPercent:annual*2,
  maxDrawdownPercent:drawdown,observations:500,trades:id==="buy-hold"?1:5,
  transactionCostPercent:0.1,exposurePercent:id==="buy-hold"?100:65,...other,
});
const source = [
 {symbol:"SPY",name:"S&P 500",assetClass:"ETF",technical:{observedAt:"2026-10-13T13:30:00Z",
   strategies:[strategy("buy-hold",16.8,-18.8),strategy("trend-50-200",10.2,-6.6),strategy("tactical-20-50",-4.4,-16.1)]}},
 {symbol:"QQQ",name:"Nasdaq 100",assetClass:"ETF",technical:{strategies:[
   strategy("buy-hold",23,-22.8),strategy("trend-50-200",13.8,-11.2),strategy("tactical-20-50",-7,-20.2)]}},
 {symbol:"IWM",name:"Russell 2000",assetClass:"ETF",technical:{strategies:[
   strategy("buy-hold",12.6,-27.5),strategy("trend-50-200",10.9,-11.1),strategy("tactical-20-50",5.5,-9.2)]}},
];
const lab=buildEtfStrategyLab(source);
assert.deepEqual(lab.map(x=>x.symbol),["SPY","QQQ","IWM"]);
assert.equal(lab[0].finding,"BUY_AND_HOLD_OUTPERFORMED");
assert.equal(lab[0].bestAlternative.annualizedGapVersusHoldPoints,-6.6);
assert.equal(lab[0].bestAlternative.drawdownReductionPoints,12.2);
assert.equal(lab[0].alternatives[1].annualizedGapVersusHoldPoints,-21.2);
assert.equal(lab[1].bestAlternative.annualizedGapVersusHoldPoints,-9.2);
assert.equal(lab[2].bestAlternative.annualizedGapVersusHoldPoints,-1.7);
for(const row of lab){
  assert.equal(row.independentForwardValidation,false);
  assert.equal(row.sourceContainsActualDirectaFees,false);
  assert.equal(row.returnForecastPercent,null);
  assert.equal(row.tradingAllowed,false);
  assert.equal(row.changesCommitteeScore,false);
  assert.equal(row.observationCount,500);
}
assert.deepEqual(buildEtfStrategyLab(null),[]);
assert.deepEqual(buildEtfStrategyLab(source,0),[]);
assert.equal(buildEtfStrategyLab([...source,source[0]],5).length,3,"exclude duplicate ETF symbols");
assert.equal(buildEtfStrategyLab([{...source[0],assetClass:"Equity"}]).length,0);
assert.equal(buildEtfStrategyLab([{...source[0],technical:{strategies:[
  strategy("buy-hold",10,-10),strategy("trend",11,-5,{observations:400})]}}]).length,0,
  "different observation windows cannot be compared");
assert.equal(buildEtfStrategyLab([{...source[0],technical:{strategies:[
  strategy("buy-hold",10,-10),strategy("trend",11,-5,{transactionCostPercent:0.3})]}}]).length,0,
  "different friction assumptions cannot be compared");
assert.equal(buildEtfStrategyLab([{...source[0],technical:{strategies:[
  strategy("buy-hold",10,-10),strategy("trend",11,-5,{trades:-1})]}}]).length,0);
assert.equal(buildEtfStrategyLab([{...source[0],technical:{strategies:[
  strategy("buy-hold",10,-10),strategy("trend",11,-5,{annualizedReturnPercent:NaN})]}}]).length,0);
assert.equal(buildEtfStrategyLab([{...source[0],technical:{strategies:[
  strategy("buy-hold",10,-10),strategy("trend",11,-5,{maxDrawdownPercent:99})]}}]).length,0);
const winning = buildEtfStrategyLab([{...source[0],technical:{strategies:[
  strategy("buy-hold",5,-20),strategy("trend",7,-8)]}}]);
assert.equal(winning[0].finding,"TACTICAL_OUTPERFORMED_IN_BACKTEST");
assert.equal(winning[0].bestAlternative.annualizedGapVersusHoldPoints,2);
assert.equal(winning[0].tradingAllowed,false,"hypothetical alpha never releases capital");

const real=JSON.parse(await readFile(new URL("../data/terminal-intelligence.json",import.meta.url),"utf8"));
for(const row of buildEtfStrategyLab(real.assets)){
  assert.equal(row.tradingAllowed,false);
  assert(row.alternatives.length>=1);
  assert(row.reference.annualizedReturnPercent>-100);
}
const page=await readFile(new URL("../app/decisioni/page.tsx",import.meta.url),"utf8");
assert.match(page,/Laboratorio strategie ETF - confronto economico/);
assert.match(page,/buildEtfStrategyLab/);
assert.match(page,/Risultati forward-only/);
assert.match(page,/non campioni forward indipendenti/);
assert.match(page,/commissioni Directa/);
console.log("FENICE100K ETF economic comparison PASS: matched windows, modeled friction, no live orders");
