/**
 * Fetches ONLY official, freely published ECB AUD/EUR DAILY reference CSV.
 * No broker or licensed equities data; no keys; no FX rate exposed to public
 * logs. Use --output=/absolute/private/file.json ONLY for local private use.
 */
import {readFileSync,realpathSync,existsSync,writeFileSync} from "node:fs";
import {dirname,resolve,isAbsolute,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {
  selectEcbAudReference,summarizeEcbAudReference,
} from "../lib/market/one-global-ecb-aud.mjs";

const BASE="https://data-api.ecb.europa.eu/service/data/EXR/D.AUD.EUR.SP00.A";
const ROOT=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),".."));
const regex=/^\d{4}-\d\d-\d\d$/;
const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith("--")&&x.includes("="))
  .map(a=>{const j=a.indexOf("=");return [a.slice(2,j),a.slice(j+1)];}));
const nowIso=new Date().toISOString();
function SydneyDate(now){
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{
    timeZone:"Australia/Sydney",year:"numeric",month:"2-digit",day:"2-digit",
  }).formatToParts(new Date(now)).map(x=>[x.type,x.value]));
  return p.year+"-"+p.month+"-"+p.day;
}
const sessionDate=args.session||SydneyDate(nowIso);
if(!regex.test(sessionDate)||
  new Date(sessionDate+"T00:00:00.000Z").toISOString().slice(0,10)!==sessionDate)
  throw Error("EOD_AUD_SESSION_DATE_INVALID");
const previous=new Date(Date.parse(sessionDate+"T00:00:00.000Z")-86400000)
  .toISOString().slice(0,10);
const from=new Date(Date.parse(sessionDate+"T00:00:00.000Z")-9*86400000)
  .toISOString().slice(0,10);
const url=new URL(BASE);
url.searchParams.set("format","csvdata");
url.searchParams.set("startPeriod",from);
url.searchParams.set("endPeriod",previous);
let status="ECB_AUD_REFERENCE_UNAVAILABLE";
try{
  const r=await fetch(url,{method:"GET",redirect:"error",
    headers:{Accept:"text/csv"},signal:AbortSignal.timeout(12000)});
  if(!r.ok||!(/csv|text\/plain/i).test(r.headers.get("content-type")||""))
    throw Error("ECB_HTTP_OR_CONTENT_TYPE_UNUSABLE");
  const raw=await r.text();
  const evidence=selectEcbAudReference({csv:raw,sessionDate,observedAt:new Date().toISOString()});
  status=summarizeEcbAudReference(evidence).status;
  if(args.output){
    if(!isAbsolute(args.output))throw Error("EOD_AUD_ABSOLUTE_PRIVATE_OUTPUT_REQUIRED");
    const parent=realpathSync(dirname(args.output));
    const resolved=existsSync(args.output)?realpathSync(args.output):resolve(args.output);
    if(resolved===ROOT||resolved.startsWith(ROOT+sep)
      ||parent===ROOT||parent.startsWith(ROOT+sep))
      throw Error("EOD_AUD_PRIVATE_OUTPUT_MUST_STAY_OUTSIDE_REPOSITORY");
    // Never overwrite a previous fetched proof, even if the reference changes.
    writeFileSync(resolved,JSON.stringify(evidence,null,2)+"\n",{
      encoding:"utf8",mode:0o600,flag:"wx",
    });
  }
}catch{
  // Network/source failure or unsafe target is a BLOCKER, never a substitute
  // with a constant ECB rate, an invented previous day or a broker quote.
  status="ECB_AUD_REFERENCE_NOT_VALIDATED";
}
console.log(JSON.stringify({
  source:"ECB",series:"EXR.D.AUD.EUR.SP00.A",
  targetASXSessionDate:sessionDate,status,
  referenceOnly:true,noExecutableFxPrice:true,
  equityCloseReceiptsVerified:0,phase9Credit:0,
  brokerConnectivityAllowed:false,liveTradingAllowed:false,
  noRateOrRawSourceDisclosed:true,
}));
