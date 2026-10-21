import { writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import path from "node:path";
import { EOD_PILOTS, identifyAlphaListing, evaluateEodResearch, parseAlphaDailyBars, tentativeAlphaDailyCandidate } from "../lib/market/world-v7-eod-research.mjs";
import { runWorldV7DailyHistoricalReplay, summarizeWorldV7DailyHistoricalReplay } from "../lib/market/world-v7-daily-historical-replay.mjs";
import { fetchEcbJpyEurDailyHistory } from "../lib/market/world-v7-ecb-daily-fx.mjs";

const options = Object.fromEntries(process.argv.slice(2).filter(s=>s.startsWith("--")&&s.includes("=")).map(s=>s.slice(2).split(/=(.*)/s).slice(0,2)));
const venues=options.venue && options.venue!=="ALL" ? [options.venue] : ["XTKS","XMIL","XETR"];
if(venues.some(mic=>!Object.hasOwn(EOD_PILOTS,mic)))throw Error("WORLD_EOD_INVALID_VENUE");
const outfile=options.output || "/tmp/fenice-world-v7-eod-research.json";
const key=String(process.env.ALPHA_VANTAGE_API_KEY||"").trim();
const network=process.argv.includes("--network") && key.length>=8;
const maxCalls=6;
let calls=0;
let lastRequestAt=0;
async function alphaRequest(params){
  const wait=Math.max(0, lastRequestAt+13000-Date.now());
  if(calls>0 && wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
  lastRequestAt=Date.now();
  if(++calls>maxCalls)throw Error("WORLD_EOD_REQUEST_BUDGET_EXCEEDED");
  const search=new URLSearchParams({...params,apikey:key});
  // Alpha Vantage expects an API key in the URL. Never print this URL or
  // disclose network exceptions, secrets, raw price data, raw provider JSON.
  const url="https://www.alphavantage.co/query?"+search;
  try {
    const r=await fetch(url,{signal:AbortSignal.timeout(11000),redirect:"error",
      headers:{Accept:"application/json"}});
    if(!r.ok)return {"Error Message":"HTTP error"};
    if(!String(r.headers.get("content-type")||"").includes("json"))return {"Error Message":"Non-JSON"};
    const text=await r.text();
    if(text.length>250000)return {"Error Message":"Payload too large"};
    return JSON.parse(text);
  }catch{return {"Error Message":"Provider not reachable"};}
}
const startedAt=new Date().toISOString();
const observations=[];
const historicalInputs=[];
for(const venue of venues){
  if(!network){
    observations.push({venue,ticker:EOD_PILOTS[venue].ticker,region:EOD_PILOTS[venue].region,
      status:key?"NETWORK_NOT_AUTHORIZED":"ALPHA_VANTAGE_KEY_UNAVAILABLE",
      researchSignal:"NO_SIGNAL",paperFillCount:0,licensedPaperSource:false,
      liveTradingAllowed:false,rawPricePublished:false});
    continue;
  }
  const target=EOD_PILOTS[venue];
  const search=await alphaRequest({function:"SYMBOL_SEARCH",keywords:target.ticker});
  const searched=identifyAlphaListing(venue,search);
  // Some global Alpha Vantage names have search labels that are not country
  // names. A single *fixed* direct probe can discover real daily history
  // without claiming that mapping, exchange, or usage rights are certified.
  const listing=searched.status==="MATCHED_FOR_DAILY_RESEARCH"
    ? searched : (tentativeAlphaDailyCandidate(venue,searched) ?? searched);
  let result;
  if(!listing.alphaSymbol){
    result=evaluateEodResearch(venue,listing,null,new Date().toISOString());
  }else{
    const daily=await alphaRequest({function:"TIME_SERIES_DAILY",symbol:listing.alphaSymbol,outputsize:"compact"});
    result=evaluateEodResearch(venue,listing,daily,new Date().toISOString());
    const parsed=parseAlphaDailyBars(daily,listing.alphaSymbol);
    if(parsed.status==="PARSED" &&
       ["COMPLETE_EOD_RESEARCH","TENTATIVE_COMPLETED_DAILY_RESEARCH"].includes(result.status)){
      // Quoted-currency and exact MIC rights are unverified; keep this RESEARCH
      // ONLY and use synthetic cash, never count these as forward PAPER fills.
      historicalInputs.push({venue,ticker:target.ticker,currency:target.currency,
        region:target.region,provider:"alpha-vantage",bars:parsed.bars});
    }
  }
  observations.push(result);
}
// ECB daily JPY-per-EUR reference: use only historical fixing dates strictly
// before each signal session. This is not a realtime or executable FX quote.
let fxHistory={source:"ECB",status:"NOT_NEEDED_OR_NO_VALID_TOKYO_HISTORY",observations:0,
  dailyReferenceOnly:true,pricingExecutionEligible:false};
if(historicalInputs.some(h=>h.venue==="XTKS")){
  const from=new Date(Date.parse(startedAt.slice(0,10)+"T00:00:00Z")-300*86400000).toISOString().slice(0,10);
  const ecb=await fetchEcbJpyEurDailyHistory({startDate:from,endDate:startedAt.slice(0,10)});
  if(ecb.status==="ECB_DAILY_REFERENCE_HISTORY_PARSED"){
    for(const h of historicalInputs)if(h.venue==="XTKS")h.fxRates=ecb.fxRates;
  }
  fxHistory={...fxHistory,status:ecb.status,observations:ecb.fxRates.length};
}
const historicalReplay=summarizeWorldV7DailyHistoricalReplay(
  runWorldV7DailyHistoricalReplay({histories:historicalInputs,asOfDate:startedAt.slice(0,10)})
);
const report={
  version:1,generatedAt:new Date().toISOString(),mode:"WORLD_V7_EOD_RESEARCH_ONLY",
  note:"EOD research, never broker orders or PAPER fills. Does not redistribute raw provider quotes.",
  realProviderQueried:network,provider:"alpha-vantage",budgetMaxCalls:maxCalls,
  requestsUsed:calls,quotaSharedWithOtherAlphaVantageWorkflows:true,
  dataRights:"PERSONAL_NONCOMMERCIAL_RESEARCH_SCOPE_ONLY_NOT_INDEPENDENTLY_CERTIFIED",
  realtimePaperEligible:false,backtestFillCertified:false,
  simulatedOrders:0,liveTradingAllowed:false,brokerConnectivityAllowed:false,modifiesV6:false,
  regions:{asiaPacific:observations.filter(x=>x.region==="asia-pacific").length,
    europe:observations.filter(x=>x.region==="europe").length},
  observations,historicalReplay,fxHistory,
};
mkdirSync(path.dirname(outfile),{recursive:true});
writeFileSync(outfile,JSON.stringify(report,null,2)+"\n",{mode:0o600});
const consoleReport={generatedAt:report.generatedAt,mode:report.mode,requestsUsed:calls,network,
  data:observations.map(x=>({venue:x.venue,status:x.status,date:x.lastCompleteBarDate??null,
    signal:x.researchSignal??"NO_SIGNAL",fill:x.paperFillCount})),
  historicalResearchTransactions:historicalReplay.historicalResearchTransactions,
  historicalReplayStatus:historicalReplay.performanceStatus,fxStatus:fxHistory.status,
  noRealOrders:true,noPrivatePricePublished:true};
console.log(JSON.stringify(consoleReport));
if(process.env.GITHUB_STEP_SUMMARY){
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    "# FENICE worldwide end-of-day research (no orders)\n\n"+
    "Alpha Vantage requests: **"+calls+"** of max **"+maxCalls+"**. Other Alpha requests share free quota.\n\n"+
    "| Exchange | Last completed bar | Research status | EOD trend (not an order) |\n|---|---|---|---|\n"+
    observations.map(o=>"| "+o.venue+" | "+(o.lastCompleteBarDate??"-")+" | "+o.status+" | "+(o.researchSignal??"NO_SIGNAL")+" |").join("\n")+
    "\n\nEvery signal must await new *future* price evidence before hypothetical execution. **Zero certified PAPER fills, LIVE locked.**\n");
}
