/** One public, no-key ECB read-only request for multi-region FX RESEARCH coverage.
 * This must never create PAPER executions, broker calls or certification credit.
 */
import {fetchEcbDailyFxReference,ECB_DAILY_FX_URL} from "../lib/global/ecb-daily-fx-reference.mjs";
const regionCurrency={
 ASIA:["JPY","HKD","CNY","INR"],
 EUROPE:["GBP"],
 AMERICAS:["USD"]
};
const nowIso=new Date().toISOString();
let responsePromise;
const fetchOnce=async (url,options)=>{
 if(url!==ECB_DAILY_FX_URL)throw Error("UNEXPECTED_ECB_ENDPOINT");
 if(!responsePromise)responsePromise=globalThis.fetch(url,options).then(async response=>{
  const xml=await response.text();
  return {ok:response.ok,status:response.status,headers:response.headers,text:async()=>xml};
 });
 return responsePromise;
};
const rows=[];
for(const [region,currencies] of Object.entries(regionCurrency)){
 for(const baseCurrency of currencies){
  const result=await fetchEcbDailyFxReference({baseCurrency,nowIso,fetchImpl:fetchOnce});
  rows.push({region,baseCurrency,ok:result.ok,reason:result.reason??null,
   referenceDate:result.reference?.referenceDate??null,
   ageCalendarDays:result.reference?.ageCalendarDays??null,
   referenceRateToEur:result.reference?.referenceRateToEur??null,
   sourceUrl:ECB_DAILY_FX_URL,eligibleForExecution:false,countsTowardRealPaper:false});
 }
}
const regions=Object.fromEntries(Object.keys(regionCurrency).map(region=>[
 region,{requested:rows.filter(x=>x.region===region).length,
 availableDailyReferences:rows.filter(x=>x.region===region&&x.ok).length,
 rejected:rows.filter(x=>x.region===region&&!x.ok).length,
 verifiedExecutionFxQuotes:0}
]));
const successful=rows.filter(x=>x.ok).length;
const report={mode:"ECB_DAILY_FX_RESEARCH_DIAGNOSTIC",generatedAt:nowIso,
 status:successful===rows.length?"DAILY_RESEARCH_REFERENCES_AVAILABLE":successful?"PARTIAL_DAILY_RESEARCH_COVERAGE":"DAILY_RESEARCH_UNAVAILABLE",
 sourceUrl:ECB_DAILY_FX_URL,sourcePublicationSemantics:"DAILY_ECB_INDICATIVE_NOT_TRANSACTION_RATE",
 requestsToEcb:responsePromise?1:0,regions,totals:{requested:rows.length,availableDailyReferences:successful,
 verifiedExecutionFxQuotes:0,certifiedPaperFills:0},rows,
 countsTowardRealPaper:false,liveTradingAllowed:false,brokerConnectivityAllowed:false};
console.log(JSON.stringify(report,null,2));
if(successful!==rows.length)process.exitCode=2;
