import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  HISTORICAL_AUDITED_CASH_INVESTMENTS, reconcileFiledCashInvestment,
} from "../lib/research/sec-filed-cash-investment.mjs";

const asOf = new Date("2026-10-14T20:00:00.000Z");
assert.equal(HISTORICAL_AUDITED_CASH_INVESTMENTS.length, 2);
const byTicker = Object.fromEntries(HISTORICAL_AUDITED_CASH_INVESTMENTS.map(x => [x.ticker,x]));
const make = (ticker, rawCapex) => {
  const x = byTicker[ticker];
  return {
    ticker:x.ticker, cik:x.cik, fiscalEnd:x.fiscalEnd,
    currency:x.currency, operatingCashFlow:x.operatingCashFlow,
    extractedCashInvestment:rawCapex,
    filing:{
      form:"10-K", periodEnd:x.fiscalEnd, url:x.filingUrl,
      filedAt:ticker==="AMZN"?"2026-02-06":"2026-02-25",
    },
    asOf,
  };
};
const amazon = reconcileFiledCashInvestment(make("AMZN",6_737_000_000));
assert.equal(amazon.status,"FILED_CASH_INVESTMENT_RECONCILED");
assert.equal(amazon.applied,true);
assert.equal(amazon.cashInvestment,128_320_000_000);
assert.equal(amazon.freeCashFlow,11_194_000_000);
assert.equal(amazon.previouslyExtractedCashInvestment,6_737_000_000);
assert.equal(amazon.researchOnly,true);
assert.equal(amazon.brokerOrderAllowed,false);
assert.equal(amazon.liveTradingAllowed,false);
const nvda = reconcileFiledCashInvestment(make("NVDA",138_735_000));
assert.equal(nvda.applied,true);
assert.equal(nvda.cashInvestment,6_143_000_000);
assert.equal(nvda.freeCashFlow,96_575_000_000);
assert.equal(nvda.fiscalEnd,"2026-01-25");
assert.equal(nvda.reportingCurrency,"USD");
assert.equal(reconcileFiledCashInvestment(make("AMZN",128_320_000_000)).status,"FILING_ALREADY_ALIGNED");

const negative = [
  {ticker:"AMZN",fiscalEnd:"2026-12-31"},
  {ticker:"AMZN",currency:"EUR"},
  {ticker:"GOOGL"},
  {ticker:"AMZN",cik:320193},
  {ticker:"NVDA",operatingCashFlow:89_000_000_000},
  {ticker:"AMZN",filing:{...make("AMZN",1).filing,url:"https://example.com/forged"}},
  {ticker:"NVDA",filing:{...make("NVDA",1).filing,form:"8-K"}},
  {ticker:"AMZN",filing:{...make("AMZN",1).filing,periodEnd:"2024-12-31"}},
  {ticker:"NVDA",filing:{...make("NVDA",1).filing,filedAt:"2026-12-01"}},
  {ticker:"AMZN",asOf:new Date("2026-01-01T00:00:00Z")},
  {ticker:"AMZN",asOf:new Date("invalid")},
  {ticker:"NVDA",operatingCashFlow:null},
  {ticker:"NVDA",operatingCashFlow:NaN},
];
for(const row of negative){
  const base=make(row.ticker==="NVDA"?"NVDA":"AMZN",1_000_000);
  const result=reconcileFiledCashInvestment({...base,...row});
  assert.equal(result.applied,false,JSON.stringify(row));
  assert.equal(result.cashInvestment,undefined);
}
const existing = JSON.parse(await readFile(new URL("../data/fundamental-research.json",import.meta.url),"utf8"));
for(const ticker of ["AMZN","NVDA"]){
  const row=existing.companies.find(x=>x.ticker===ticker);
  assert.ok(row,"Previous raw report contains company "+ticker);
  const audited=reconcileFiledCashInvestment(make(ticker,row.financials.capitalExpenditure));
  assert.equal(audited.applied,true);
  assert.equal(audited.operatingCashFlow,undefined,"No invented operating cash flow output");
  assert.equal(row.financials.operatingCashFlow,byTicker[ticker].operatingCashFlow);
  assert.ok(audited.cashInvestment>row.financials.capitalExpenditure,
    "Correction must not opportunistically increase historical FCF");
  assert.equal(byTicker[ticker].operatingCashFlow-audited.cashInvestment,audited.freeCashFlow);
}
const runner=await readFile(new URL("./run-fundamental-engine.mjs",import.meta.url),"utf8");
assert.match(runner,/reconcileFiledCashInvestment\(\{/);
assert.match(runner,/fiscalEnd: targetEnd/);
assert.match(runner,/filing,\s*asOf: now/);
assert.match(runner,/auditedCashInvestment\.applied/);
assert.match(runner,/cashInvestmentAudit: auditedCashInvestment/);
assert.match(runner,/const freeCashFlow = Number\.isFinite\(operatingCashFlow\)/);
assert.doesNotMatch(runner,/data\/paper-validation-campaign\.json/);
const campaign=JSON.parse(await readFile(new URL("../data/paper-validation-campaign.json",import.meta.url),"utf8"));
assert.equal(campaign.liveTradingAllowed,false);
for(const p of ["scripts/run-fundamental-engine.mjs","lib/research/sec-filed-cash-investment.mjs","scripts/test-sec-filed-cash-investment.mjs"]){
  assert.equal(campaign.baselineFingerprint.files.includes(p),false,"V6 frozen file: "+p);
}
console.log("Fenice SEC cash-flow filing reconciliation: PASS");
