import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { checkDcfCashFlowBasis, AUDITED_SINGLE_YEAR_FCF_TO_OCF_MIN }
 from "../lib/intelligence/dcf-cashflow-basis.mjs";

const fundamental = JSON.parse(await readFile(new URL("../data/fundamental-research.json",import.meta.url),"utf8"));
const terminal = JSON.parse(await readFile(new URL("../data/terminal-intelligence.json",import.meta.url),"utf8"));
const company = ticker => fundamental.companies.find(x=>x.ticker===ticker);
const asset = ticker => terminal.assets.find(x=>x.symbol===ticker);
const amzn=checkDcfCashFlowBasis({financials:company("AMZN").financials,asset:asset("AMZN")});
const nvda=checkDcfCashFlowBasis({financials:company("NVDA").financials,asset:asset("NVDA")});
assert.equal(AUDITED_SINGLE_YEAR_FCF_TO_OCF_MIN,0.10);
assert.equal(amzn.state,"SINGLE_YEAR_FCF_NOT_NORMALIZED");
assert.equal(amzn.eligible,false);
assert.equal(amzn.requiresMultiYearValidation,true);
assert.ok(amzn.singleYearFcfToOperatingCashFlowPercent>8 && amzn.singleYearFcfToOperatingCashFlowPercent<9);
assert.equal(nvda.state,"BASIC_INPUTS_VERIFIED");
assert.equal(nvda.eligible,true);
assert.ok(nvda.singleYearFcfToOperatingCashFlowPercent>90);
assert.equal(checkDcfCashFlowBasis({financials:{...company("NVDA").financials,cash:undefined},asset:asset("NVDA")}).state,
  "MISSING_VERIFIED_CASH_OR_DEBT");
assert.equal(checkDcfCashFlowBasis({financials:{...company("NVDA").financials,debt:null},asset:asset("NVDA")}).state,
  "MISSING_VERIFIED_CASH_OR_DEBT");
assert.equal(checkDcfCashFlowBasis({financials:{...company("NVDA").financials,cash:0,debt:0},asset:asset("NVDA")}).state,
  "BASIC_INPUTS_VERIFIED","Real documented zero balances must remain valid");
assert.equal(checkDcfCashFlowBasis({financials:{...company("NVDA").financials,currency:undefined},asset:asset("NVDA")}).state,
  "CURRENCY_NOT_COMPARABLE");
assert.equal(checkDcfCashFlowBasis({financials:company("NVDA").financials,asset:{...asset("NVDA"),currency:null}}).state,
  "CURRENCY_NOT_COMPARABLE");
assert.equal(checkDcfCashFlowBasis({financials:company("NVDA").financials,asset:{...asset("NVDA"),currency:"EUR"}}).state,
  "CURRENCY_NOT_COMPARABLE");
const notAudited=checkDcfCashFlowBasis({financials:{...company("AMZN").financials,cashInvestmentAudit:undefined},asset:asset("AMZN")});
assert.equal(notAudited.state,"BASIC_INPUTS_VERIFIED","Do not silently invent a different accounting proof for unaudited companies");

const paper=JSON.parse(await readFile(new URL("../data/paper-validation-campaign.json",import.meta.url),"utf8"));
assert.equal(paper.liveTradingAllowed,false);
for(const path of ["scripts/run-dcf-engine.mjs","lib/intelligence/dcf-cashflow-basis.mjs","scripts/test-dcf-cashflow-basis.mjs"]){
 assert.equal(paper.baselineFingerprint.files.includes(path),false,"PAPER fingerprint must remain frozen: "+path);
}
// End-to-end deterministic dry-run: no network, no broker, only local research JSON.
const root = new URL("../",import.meta.url);
const originalFundamentals=await readFile(new URL("../data/fundamental-research.json",import.meta.url),"utf8");
const result=spawnSync(process.execPath,["scripts/run-dcf-engine.mjs"],{
  cwd:root,encoding:"utf8",timeout:30000,
});
assert.equal(result.status,0,result.stderr+"\n"+result.stdout);
const dcf=JSON.parse(await readFile(new URL("../data/dcf-analysis.json",import.meta.url),"utf8"));
const amazonDcf=dcf.companies.find(x=>x.symbol==="AMZN");
const nvdaDcf=dcf.companies.find(x=>x.symbol==="NVDA");
assert.equal(amazonDcf.status,"dati insufficienti");
assert.equal(amazonDcf.cashFlowBasis.state,"SINGLE_YEAR_FCF_NOT_NORMALIZED");
assert.deepEqual(amazonDcf.scenarios,[]);
assert.equal(amazonDcf.fairValueBase,undefined);
assert.equal(amazonDcf.upsideBasePercent,undefined);
assert.equal(nvdaDcf.status,"disponibile");
assert.equal(nvdaDcf.cashFlowBasis.state,"BASIC_INPUTS_VERIFIED");
assert.equal(dcf.companies.some(x=>x.cashFlowBasis?.state==="CURRENCY_NOT_COMPARABLE"),true,
  "Unconverted listings must remain incomparable");
const sameFundamentals=await readFile(new URL("../data/fundamental-research.json",import.meta.url),"utf8");
assert.equal(sameFundamentals,originalFundamentals,"Do not rewrite SEC filed fundamentals or frozen state");
console.log("Fenice DCF cash/debt, currency and audited single-year FCF normalization: PASS");
