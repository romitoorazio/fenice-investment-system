import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {
  parseNasdaqTradingAddsWithDiagnostics,parseSecEdgarMaster,makeOfficialListingResearch,
  requireSecMasterTransport,recentUsWeekdaysBefore
} from "../lib/research/official-listing-discovery.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const dataFile=name=>path.join(root,"data",name);
const readJson=async name=>JSON.parse(await readFile(dataFile(name),"utf8"));

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
    return {body,contentType:String(response.headers.get('content-type')||'')};
  } finally {clearTimeout(timer);}
}

const now=new Date(),generatedAt=now.toISOString();
const [master,globalUniverse]=await Promise.all([
  readJson("instrument-master.json"),readJson("global-universe.json")
]);
const nasdaqUrl="https://www.nasdaqtrader.com/dynamic/SymDir/TradingSystemAddsDeletes.txt";
const {events:nasdaqEvents,unsupportedAddRows}=parseNasdaqTradingAddsWithDiagnostics(
  (await publicText(nasdaqUrl,1_500_000)).body
);
// A valid quiet session may contain zero Add rows; the Nasdaq header and trailer remain mandatory.

const secDates=recentUsWeekdaysBefore(now,5);
const secStatusRows=[],secEvents=[];
for(const secDate of secDates){
  const quarter=Math.floor((Number(secDate.slice(5,7))-1)/3)+1;
  const secUrl="https://www.sec.gov/Archives/edgar/daily-index/"+
    secDate.slice(0,4)+"/QTR"+quarter+"/master."+secDate.replace(/-/g,"")+".idx";
  try{
    // Distinguish authentic EDGAR master-index rows from a 200 HTML response
    // or an access-interstitial page. Never manufacture missing registrations.
    const response=await publicText(secUrl,12_000_000,{
      "user-agent":String(process.env.SEC_USER_AGENT||"").trim() ||
        "FeniceInvestmentSystem/2.3 (contact: romitoorazio@users.noreply.github.com)"
    });
    const rows=parseSecEdgarMaster(requireSecMasterTransport(response));
    if(rows.some(e=>e.filedDate!==secDate))throw Error('SEC_SOURCE_DATE_MISMATCH');
    secEvents.push(...rows);
    secStatusRows.push({date:secDate,status:"OK",filings:rows.length});
  }catch(error){
    const code=String(error?.message||"");
    secStatusRows.push({date:secDate,status:/^[A-Z0-9_]{3,100}$/.test(code)
      ?code:"SEC_SOURCE_UNAVAILABLE",filings:0});
  }
}
const secValidated=secStatusRows.filter(x=>x.status==="OK").length;
const secStatus=secValidated===secDates.length?"OK":
  secValidated?"SEC_PARTIAL_OFFICIAL_INDEX_VALIDATION":"SEC_INDICES_UNAVAILABLE";

const report=makeOfficialListingResearch({
  nasdaqEvents,secEvents,instrumentMaster:master,globalUniverse,generatedAt,
  sourceStatus:{
    nasdaq:{status:unsupportedAddRows?"PARTIAL_UNSUPPORTED_ADD_ROWS":"OK",
      unsupportedAddRows,sourceUrl:nasdaqUrl},
    sec:{status:secStatus,source:"SEC_EDGAR_DAILY_MASTER_INDICES",
      requestedDates:secDates,validatedDays:secValidated,diagnostics:secStatusRows}
  }
});
await writeFile(dataFile("official-listing-discovery.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({
  status:report.status,generatedAt,sourceStatus:report.sourceStatus,
  summary:report.summary,allRowsAreResearchOnly:report.events.every(x=>!x.brokerOrderAllowed)
}));
