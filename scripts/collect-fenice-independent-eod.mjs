/** Trusted main-branch-only, secret-isolated, read-only EOD provider probe.
 * Never print keys or URLs; output sanitized results to /tmp for later research checkout.
 */
import {writeFile} from "node:fs/promises";
import {gatherPhase9IndependentEod} from "../lib/global/phase9-independent-eod.mjs";
const nowIso=new Date().toISOString();
const url="https://query1.finance.yahoo.com/v8/finance/chart/MSFT?range=1mo&interval=1d";
let histories=[];
try{
 const response=await fetch(url,{method:"GET",headers:{accept:"application/json"},
  signal:AbortSignal.timeout(8000),redirect:"error"});
 if(response.ok){
  const result=(await response.json())?.chart?.result?.[0];
  const stamps=result?.timestamp,closes=result?.indicators?.quote?.[0]?.close;
  if(result?.meta?.symbol==="MSFT"&&result?.meta?.currency==="USD"&&
    Array.isArray(stamps)&&Array.isArray(closes)&&stamps.length===closes.length){
   const bars=stamps.map((t,i)=>({observedAt:new Date(t*1000).toISOString(),close:closes[i]}))
    .filter(p=>Number.isFinite(p.close)&&p.close>0);
   if(bars.length>=5)histories=[{mic:"XNAS",instrumentId:"XNAS:MSFT",currency:"USD",
     synthetic:false,provenanceVerified:false,sourceUrl:url,closes:bars}];
  }
 }
}catch{ /* Broken public chart must NOT be replaced by synthetic closes. */ }
const report=await gatherPhase9IndependentEod({histories,
 keys:{twelveData:process.env.TWELVE_DATA_API_KEY??"",
  alphaVantage:process.env.ALPHA_VANTAGE_API_KEY??""},nowIso});
if(report.ordersGenerated!==0||report.confirmedExecutablePriceProviders!==0||
   report.liveTradingAllowed!==false||report.certifiedPaper!==false)
 throw Error("PHASE9_SOURCE_SAFETY");
await writeFile("/tmp/fenice-phase9-independent-eod.json",JSON.stringify(report,null,2)+"\n",
 {mode:0o600});
console.log(JSON.stringify({phase9IndependentResearch:"NON_EXECUTABLE_EOD",
  yahooReference:report.publicYahooReferenceAvailable,
  providers:report.providerResults.map(x=>({provider:x.provider,status:x.status,matchedDays:x.matchedDays??0})),
  crosschecked:report.independentlyComparedEodProviders,
  verifiedExecutableQuotes:0,ordersGenerated:0}));
