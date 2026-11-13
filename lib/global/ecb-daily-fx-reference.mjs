/** Official ECB euro reference rates: research-only daily data, never a PAPER execution FX feed.
 * Source: https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
 * The ECB discourages using these indicative reference rates for transactions.
 */
export const ECB_DAILY_FX_URL="https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const fail=reason=>({ok:false,reason,countsTowardRealPaper:false});
const parseAttrs=source=>{
 const attrs=new Map();
 for(const m of source.matchAll(/\b([a-zA-Z]+)\s*=\s*(['"])(.*?)\2/g)){
  if(attrs.has(m[1]))return null;
  attrs.set(m[1],m[3]);
 }
 return attrs;
};
/** Extract ONLY the dated currency/rate values, not XML-derived intraday timestamps. */
export function parseEcbDailyReferenceXml(xml){
 if(typeof xml!=="string"||xml.length<100||xml.length>100000||/<!DOCTYPE|<!ENTITY/i.test(xml)||
    !/<gesmes:name>\s*European Central Bank\s*<\/gesmes:name>/i.test(xml))
  return {ok:false,reason:"ECB_INVALID_REFERENCE_XML"};
 const cubes=[...xml.matchAll(/<Cube\b([^<>]*?)\s*\/?>/g)];
 const dates=[],rates=new Map();
 for(const match of cubes){
  const attrs=parseAttrs(match[1]);
  if(!attrs)return {ok:false,reason:"ECB_INVALID_REFERENCE_XML"};
  const day=attrs.get("time"),currency=attrs.get("currency"),rateString=attrs.get("rate");
  if(day!==undefined){
   if(currency!==undefined||rateString!==undefined||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day)||
     (!Number.isFinite(Date.parse(day+"T00:00:00.000Z"))||new Date(day+"T00:00:00.000Z").toISOString().slice(0,10)!==day))
    return {ok:false,reason:"ECB_INVALID_REFERENCE_XML"};
   dates.push(day);
  }
  if(currency!==undefined||rateString!==undefined){
   if(!/^[A-Z]{3}$/.test(currency??"")||!/^\d+(?:\.\d+)?$/.test(rateString??"")||rates.has(currency))
    return {ok:false,reason:"ECB_INVALID_REFERENCE_XML"};
   const rate=Number(rateString);
   if(!Number.isFinite(rate)||rate<=0)return {ok:false,reason:"ECB_INVALID_REFERENCE_XML"};
   rates.set(currency,rate);
  }
 }
 if(dates.length!==1||rates.size<1)return {ok:false,reason:"ECB_INVALID_REFERENCE_XML"};
 return {ok:true,referenceDate:dates[0],rates};
}
export async function fetchEcbDailyFxReference({baseCurrency,nowIso=new Date().toISOString(),
 fetchImpl=globalThis.fetch,timeoutMs=8000,maxReferenceAgeDays=4}={}){
 if(typeof baseCurrency!=="string"||!/^[A-Z]{3}$/.test(baseCurrency)||
    !Number.isFinite(Date.parse(nowIso))||typeof fetchImpl!=="function"||
    !Number.isFinite(timeoutMs)||timeoutMs<100||timeoutMs>30000||
    !Number.isSafeInteger(maxReferenceAgeDays)||maxReferenceAgeDays<0||maxReferenceAgeDays>31)
  return fail("ECB_REFERENCE_POLICY_INVALID");
 if(baseCurrency==="EUR")return fail("ECB_EUR_IDENTITY_NOT_A_SOURCE");
 let response;
 try{response=await fetchImpl(ECB_DAILY_FX_URL,{method:"GET",
   headers:{accept:"application/xml,text/xml"},signal:AbortSignal.timeout(timeoutMs),redirect:"error"});}
 catch{return fail("ECB_NETWORK_FAILURE");}
 if(response?.status===429)return fail("ECB_RATE_LIMITED");
 if(!response?.ok)return fail("ECB_HTTP_ERROR");
 const type=response.headers?.get?.("content-type");
 if(type&&!/^(?:application|text)\/xml\b/i.test(type))return fail("ECB_UNEXPECTED_CONTENT_TYPE");
 let xml;
 try{xml=await response.text();}catch{return fail("ECB_INVALID_REFERENCE_XML");}
 const parsed=parseEcbDailyReferenceXml(xml);
 if(!parsed.ok)return fail(parsed.reason);
 const euroBaseRate=parsed.rates.get(baseCurrency);
 if(euroBaseRate===undefined)return fail("ECB_CURRENCY_NOT_PUBLISHED");
 const nowMs=Date.parse(nowIso);
 const rateDateMs=Date.parse(parsed.referenceDate+"T00:00:00.000Z");
 if(!Number.isFinite(rateDateMs)||rateDateMs>nowMs)return fail("ECB_FUTURE_REFERENCE_DATE");
 const ageDays=Math.floor((nowMs-rateDateMs)/86400000);
 const reference={baseCurrency,quoteCurrency:"EUR",referenceRateToEur:1/euroBaseRate,
   euroBaseRate,referenceDate:parsed.referenceDate,ageCalendarDays:ageDays,
   source:"ECB_EURO_REFERENCE_RATES",sourceUrl:ECB_DAILY_FX_URL,
   semantics:"OFFICIAL_DAILY_INDICATIVE_NOT_EXECUTABLE",
   // Deliberately NO "rate", "base", "quote", "observedAt" or "family" keys:
   // the executable FX consensus gate must not ingest this as an intraday quote.
   countsTowardRealPaper:false,eligibleForExecution:false,
   verificationStatus:"RESEARCH_ONLY_OFFICIAL_DAILY_REFERENCE"};
 if(ageDays>maxReferenceAgeDays)return {ok:false,reason:"ECB_STALE_DAILY_REFERENCE",reference,
   countsTowardRealPaper:false};
 return {ok:true,reason:null,reference,countsTowardRealPaper:false};
}


/** Historical ECB reference series: daily, indicative, never an executable FX quote. */
export const ECB_90_DAY_FX_URL="https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
export function parseEcb90DayReferenceXml(xml){
 if(typeof xml!=="string"||xml.length<100||xml.length>500000||/<!DOCTYPE|<!ENTITY/i.test(xml)||
  !/<gesmes:name>\s*European Central Bank\s*<\/gesmes:name>/i.test(xml))return fail("ECB_HISTORICAL_XML_INVALID");
 const days=[],seenDates=new Set();
 const dayPattern=/<Cube\b([^<>]*\btime\s*=\s*(['"])[^<>]*?\2[^<>]*)>([\s\S]*?)<\/Cube>/g;
 const groups=[...xml.matchAll(dayPattern)];
 if(groups.length===0||groups.length>100)return fail("ECB_HISTORICAL_XML_INVALID");
 for(const group of groups){
  const attrs=parseAttrs(group[1]),date=attrs?.get("time");
  if(!attrs||attrs.size!==1||typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
   !Number.isFinite(Date.parse(date+"T00:00:00Z"))||new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date||seenDates.has(date))
   return fail("ECB_HISTORICAL_XML_INVALID");
  seenDates.add(date);
  const rows=[...group[3].matchAll(/<Cube\b([^<>]*?)\s*\/>/g)];
  const remainder=group[3].replace(/<Cube\b([^<>]*?)\s*\/>/g,"").trim();
  if(remainder||rows.length<1||rows.length>50)return fail("ECB_HISTORICAL_XML_INVALID");
  const rates={};
  for(const row of rows){
   const a=parseAttrs(row[1]),currency=a?.get("currency"),r=a?.get("rate");
   if(!a||a.size!==2||!/^[A-Z]{3}$/.test(currency??"")||!/^(\d+)(\.\d+)?$/.test(r??"")||
     Object.hasOwn(rates,currency))return fail("ECB_HISTORICAL_XML_INVALID");
   const value=Number(r);if(!Number.isFinite(value)||value<=0)return fail("ECB_HISTORICAL_XML_INVALID");
   rates[currency]=value;
  }
  days.push({date,rates});
 }
 days.sort((a,b)=>a.date.localeCompare(b.date));
 return {ok:true,days,sourceUrl:ECB_90_DAY_FX_URL,semantics:"OFFICIAL_DAILY_INDICATIVE_NOT_EXECUTABLE",
  countsTowardRealPaper:false,eligibleForExecution:false};
}
export async function fetchEcb90DayFxReference({nowIso=new Date().toISOString(),fetchImpl=globalThis.fetch,timeoutMs=8000}={}){
 if(!Number.isFinite(Date.parse(nowIso))||typeof fetchImpl!=="function"||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>30000)
  return fail("ECB_HISTORICAL_POLICY_INVALID");
 let response;
 try{response=await fetchImpl(ECB_90_DAY_FX_URL,{method:"GET",headers:{accept:"application/xml,text/xml"},redirect:"error",signal:AbortSignal.timeout(timeoutMs)});}
 catch{return fail("ECB_HISTORICAL_NETWORK_FAILURE");}
 if(response?.status===429)return fail("ECB_HISTORICAL_RATE_LIMITED");
 if(!response?.ok)return fail("ECB_HISTORICAL_HTTP_ERROR");
 const type=response.headers?.get?.("content-type");
 if(type&&!/^(?:application|text)\/xml\b/i.test(type))return fail("ECB_HISTORICAL_CONTENT_TYPE");
 let xml;try{xml=await response.text();}catch{return fail("ECB_HISTORICAL_XML_INVALID");}
 const parsed=parseEcb90DayReferenceXml(xml);
 if(!parsed.ok)return parsed;
 if(parsed.days.some(d=>Date.parse(d.date+"T00:00:00Z")>Date.parse(nowIso)))return fail("ECB_HISTORICAL_FUTURE_DATE");
 const newest=parsed.days.at(-1).date;
 const ageDays=Math.floor((Date.parse(nowIso.slice(0,10)+"T00:00:00Z")-Date.parse(newest+"T00:00:00Z"))/86400000);
 if(ageDays>7)return fail("ECB_HISTORICAL_SOURCE_STALE");
 return parsed;
}
/** A daily candle is timestamped at market OPEN; same-day ECB rates would be look-ahead. */
export function lookupEcbHistoricalFx({series,currency,at,maxAgeDays=7}={}){
 if(typeof currency!=="string"||!/^[A-Z]{3}$/.test(currency)||!Number.isFinite(Date.parse(at))||
  !Number.isInteger(maxAgeDays)||maxAgeDays<1||maxAgeDays>14)return fail("ECB_HISTORICAL_LOOKUP_INVALID");
 if(currency==="EUR")return {ok:true,rateToEur:1,currency:"EUR",referenceDate:null,
  sourceUrl:null,semantics:"EUR_IDENTITY",countsTowardRealPaper:false,eligibleForExecution:false};
 if(series?.ok!==true||!Array.isArray(series.days)||series.countsTowardRealPaper!==false)
  return fail("ECB_HISTORICAL_NOT_AVAILABLE");
 const day=at.slice(0,10);
 const candidate=series.days.filter(d=>d?.date<day&&Number.isFinite(d.rates?.[currency])&&d.rates[currency]>0).at(-1);
 if(!candidate)return fail("ECB_HISTORICAL_CURRENCY_OR_DATE_MISSING");
 const ageDays=(Date.parse(day+"T00:00:00Z")-Date.parse(candidate.date+"T00:00:00Z"))/86400000;
 if(!Number.isInteger(ageDays)||ageDays<1||ageDays>maxAgeDays)return fail("ECB_HISTORICAL_STALE_FOR_TRADE");
 return {ok:true,currency,rateToEur:1/candidate.rates[currency],euroBaseRate:candidate.rates[currency],
  referenceDate:candidate.date,ageCalendarDays:ageDays,sourceUrl:series.sourceUrl,
  semantics:"OFFICIAL_DAILY_INDICATIVE_NOT_EXECUTABLE",countsTowardRealPaper:false,eligibleForExecution:false};
}
