import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  parseNasdaqTradingAdds,parseSecEdgarMaster,makeOfficialListingResearch
} from "../lib/research/official-listing-discovery.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const dataFile=name=>path.join(root,"data",name);
const readJson=async name=>JSON.parse(await readFile(dataFile(name),"utf8"));

function priorWeekdayNewYork(now) {
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
    timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(now).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  const current=new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)));
  do {current.setUTCDate(current.getUTCDate()-1);}
  while ([0,6].includes(current.getUTCDay()));
  return current.toISOString().slice(0,10);
}

async function publicText(url,maxLength,headers={}) {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),25000);
  try {
    let response;
    try {response=await fetch(url,{
      redirect:"error",signal:controller.signal,
      headers:{accept:"text/plain",...headers}
    });}
    catch {throw Error("PUBLIC_SOURCE_NETWORK_UNAVAILABLE");}
    if (!response.ok) throw Error("PUBLIC_SOURCE_HTTP_"+response.status);
    const length=Number(response.headers.get("content-length")||0);
    if (length>maxLength) throw Error("PUBLIC_SOURCE_OVERSIZED");
    const body=await response.text();
    if (body.length>maxLength) throw Error("PUBLIC_SOURCE_OVERSIZED");
    return body;
  } finally {clearTimeout(timer);}
}

const now=new Date(),generatedAt=now.toISOString();
const [master,globalUniverse]=await Promise.all([
  readJson("instrument-master.json"),readJson("global-universe.json")
]);
const nasdaqUrl="https://www.nasdaqtrader.com/dynamic/SymDir/TradingSystemAddsDeletes.txt";
const nasdaqEvents=parseNasdaqTradingAdds(await publicText(nasdaqUrl,1_500_000));
// A valid quiet session may contain zero Add rows; the Nasdaq header and trailer remain mandatory.

const secDate=priorWeekdayNewYork(now),quarter=Math.floor((Number(secDate.slice(5,7))-1)/3)+1;
const secUrl="https://www.sec.gov/Archives/edgar/daily-index/"+
  secDate.slice(0,4)+"/QTR"+quarter+"/master."+secDate.replace(/-/g,"")+".idx";
let secEvents=[],secStatus="UNAVAILABLE";
try {
  const secRaw=await publicText(secUrl,12_000_000,{
    "user-agent":"FeniceOneGlobal-Research/1.0 (+https://github.com/romitoorazio/fenice-investment-system/issues)"
  });
  secEvents=parseSecEdgarMaster(secRaw);secStatus="OK";
} catch(error) {
  // Report source failure, never synthesize missing registrations from other data.
  const safe=String(error?.message||"UNKNOWN");
  secStatus=/^[A-Z0-9_]+$/.test(safe)?safe:"SOURCE_UNAVAILABLE";
}
const report=makeOfficialListingResearch({
  nasdaqEvents,secEvents,instrumentMaster:master,globalUniverse,generatedAt,
  sourceStatus:{
    nasdaq:{status:"OK",sourceUrl:nasdaqUrl},
    sec:{status:secStatus,sourceUrl:secUrl,requestedDate:secDate}
  }
});
await writeFile(dataFile("official-listing-discovery.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({
  status:report.status,generatedAt,sourceStatus:report.sourceStatus,
  summary:report.summary,allRowsAreResearchOnly:report.events.every(x=>!x.brokerOrderAllowed)
}));
