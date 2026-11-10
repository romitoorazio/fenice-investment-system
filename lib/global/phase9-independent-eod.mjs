/** Independent END-OF-DAY price comparison for FENICE Phase 9.
 * Vendor historical daily closes are NEVER executable bid/ask quotes or proof of broker fills.
 * Keys stay in environment/memory. Never store request URLs containing keys.
 */
export const PHASE9_SOURCE_MODE="PHASE9_INDEPENDENT_EOD_RESEARCH_ONLY";
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const closeOk=x=>Number.isFinite(x)&&x>0&&x<1e10;
const iso=s=>typeof s==="string"&&Number.isFinite(Date.parse(s));
const round=n=>Number(n.toFixed(5));
const date=s=>s.slice(0,10);
const mk=(provider,status,details={})=>({provider,status,countsTowardRealPaper:false,
 executableQuoteVerified:false,sourceProvenanceAttested:false,...details});
function avRecords(data,today){
 const rows=data?.["Time Series (Daily)"];
 if(!rows||typeof rows!=="object"||Array.isArray(rows))return null;
 const out=new Map();
 for(const [d,row] of Object.entries(rows)){
  const p=Number(row?.["4. close"]);
  if(!DAY.test(d)||!closeOk(p))return null;
  if(d<today)out.set(d,p);
 }
 return out;
}
function twelveRecords(data,today){
 if(data?.status==="error"||!Array.isArray(data?.values))return null;
 const out=new Map();
 for(const row of data.values){
  const d=row?.datetime,price=Number(row?.close);
  if(!DAY.test(d??"")||!closeOk(price)||out.has(d))return null;
  if(d<today)out.set(d,price);
 }
 return out;
}
function safeYahoo(history,nowIso){
 if(!history||history.mic!=="XNAS"||history.instrumentId!=="XNAS:MSFT"||
  history.currency!=="USD"||history.synthetic!==false||history.provenanceVerified!==false||
  !/^https:\/\/query1\.finance\.yahoo\.com\/v8\/finance\/chart\//.test(history.sourceUrl??"")||
  !Array.isArray(history.closes))return null;
 const today=date(nowIso),out=new Map();
 let last=-Infinity;
 for(const row of history.closes){
  const ms=Date.parse(row?.observedAt);
  if(!Number.isFinite(ms)||ms<=last||ms>Date.parse(nowIso)||!closeOk(row?.close))return null;
  last=ms;
  const d=date(row.observedAt);
  if(d<today){if(out.has(d))return null;out.set(d,row.close);}
 }
 return out;
}
function compare(vendor,rows,yahoo,today){
 if(!rows||!yahoo)return mk(vendor,"INVALID_HISTORY");
 const overlap=[...rows.keys()].filter(d=>yahoo.has(d)).sort().slice(-5);
 const checks=overlap.map(d=>{
  const p=rows.get(d),ref=yahoo.get(d),differencePct=round(Math.abs(p-ref)/ref*100);
  return {date:d,yahooClose:round(ref),independentClose:round(p),differencePct};
 });
 const latest=overlap.at(-1)||null;
 const age=latest?(Date.parse(today+"T00:00:00Z")-Date.parse(latest+"T00:00:00Z"))/86400000:null;
 // 2+ observations, dated settled closes, recent within 5 days and <=2% deviation.
 const ok=checks.length>=2&&age!==null&&age<=5&&checks.every(x=>x.differencePct<=2);
 return mk(vendor,ok?"CONSISTENT_EOD":"INSUFFICIENT_OR_DIVERGENT_EOD",{
  matchedDays:checks.length,latestComparedDate:latest,ageDays:age,
  comparisons:checks,independentDailyResearchValidated:ok});
}
async function call(provider,key,fetchImpl,timeoutMs){
 if(typeof key!=="string"||key.length===0)return{provider,status:"NOT_CONFIGURED"};
 if(!/^[A-Za-z0-9_-]{5,160}$/.test(key))return{provider,status:"INVALID_KEY_SHAPE"};
 const url=provider==="TWELVE_DATA"?
  "https://api.twelvedata.com/time_series?symbol=MSFT&interval=1day&outputsize=10&apikey="+encodeURIComponent(key):
  "https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=MSFT&outputsize=compact&apikey="+encodeURIComponent(key);
 try{
  const response=await fetchImpl(url,{method:"GET",headers:{accept:"application/json"},
   signal:AbortSignal.timeout(timeoutMs),redirect:"error"});
  if(response?.status===429)return{provider,status:"RATE_LIMIT"};
  if(!response?.ok)return{provider,status:"HTTP_FAILURE"};
  const json=await response.json();
  if(!json||typeof json!=="object")return{provider,status:"INVALID_JSON"};
  if(json["Note"]||json["Information"]||json["Error Message"]||json.status==="error")
   return{provider,status:"PROVIDER_REJECTED"};
  return{provider,status:"RECEIVED",data:json};
 }catch{return{provider,status:"FETCH_FAILED"};}
}
export async function gatherPhase9IndependentEod({histories=[],keys={},nowIso=new Date().toISOString(),
 fetchImpl=globalThis.fetch,timeoutMs=8000}={}){
 if(!iso(nowIso)||!Array.isArray(histories)||typeof fetchImpl!=="function"||
  !Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>20000)throw Error("PHASE9_SOURCE_INVALID_POLICY");
 const matches=histories.filter(h=>h?.instrumentId==="XNAS:MSFT");
 const yahoo=matches.length===1?safeYahoo(matches[0],nowIso):null;
 const today=date(nowIso);
 const raw=yahoo===null?
  [{provider:"TWELVE_DATA",status:"REFERENCE_UNAVAILABLE"},
   {provider:"ALPHA_VANTAGE",status:"REFERENCE_UNAVAILABLE"}]:
  await Promise.all([
   call("TWELVE_DATA",keys.twelveData,fetchImpl,timeoutMs),
   call("ALPHA_VANTAGE",keys.alphaVantage,fetchImpl,timeoutMs)]);
 const results=raw.map(res=>{
  if(res.status!=="RECEIVED")return mk(res.provider,res.status);
  const data=res.provider==="TWELVE_DATA"?twelveRecords(res.data,today):avRecords(res.data,today);
  return compare(res.provider,data,yahoo,today);
 });
 const count=results.filter(x=>x.independentDailyResearchValidated).length;
 const cross=results.length===2&&results.every(x=>x.independentDailyResearchValidated);
 const commonDays=cross?results[0].comparisons.map(x=>x.date).filter(d=>
  results[1].comparisons.some(y=>y.date===d)):[];
 let between=null;
 if(commonDays.length>=2){
  const d=commonDays.at(-1),a=results[0].comparisons.find(x=>x.date===d)?.independentClose,
   b=results[1].comparisons.find(x=>x.date===d)?.independentClose;
  if(closeOk(a)&&closeOk(b))between=round(Math.abs(a-b)/((a+b)/2)*100);
 }
 const eligibleResearchAgreement=cross&&commonDays.length>=2&&between!==null&&between<=2;
 return {schemaVersion:1,mode:PHASE9_SOURCE_MODE,generatedAt:nowIso,subject:"XNAS:MSFT",
  classification:"NON_EXECUTABLE_HISTORICAL_DAILY_CLOSE_RESEARCH",
  publicYahooReferenceAvailable:yahoo!==null,
  providerResults:results,
  independentlyComparedEodProviders:count,
  researchCrossVendorAgreement:eligibleResearchAgreement,
  latestCrossVendorDifferencePct:between,
  confirmedExecutablePriceProviders:0,certifiedPaper:false,liveTradingAllowed:false,
  brokerContacted:false,ordersGenerated:0,
  provenanceNote:"Independent HTTPS vendor daily data is unlicensed for execution here; no source establishes actual bid/ask or Directa fill."};
}
