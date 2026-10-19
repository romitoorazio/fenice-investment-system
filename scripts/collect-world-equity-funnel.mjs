import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {screenWorldEquityReferences} from "../lib/research/world-equity-funnel.mjs";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const load=async name=>JSON.parse(await readFile(path.join(root,"data",name),"utf8"));
const limit=Number(process.argv.find(x=>x.startsWith("--limit="))?.split("=")[1]||2000);
if(!Number.isSafeInteger(limit)||limit<1||limit>2000)throw Error("BAD_WORLD_LIMIT");
const [world,europe]=await Promise.all([load("global-market-universe.json"),load("europe-market-registry.json")]);
if(process.argv.includes("--validate-only")){
 console.log("World equity reference inputs valid; provider not called");
 process.exit(0);
}
const token=String(process.env.TWELVE_DATA_API_KEY||"").trim();
if(!token)throw Error("TWELVE_DATA_CREDENTIAL_NOT_CONFIGURED");
async function get(route){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90_000);
 try{
  let response;
  try{
   response=await fetch("https://api.twelvedata.com/"+route+(route.includes("?")?"&":"?")+"apikey="+encodeURIComponent(token),{
    signal:controller.signal,headers:{accept:"application/json","user-agent":"FeniceWorldResearchFunnel/1.0"}});
  }catch {throw Error("PROVIDER_NETWORK_ERROR_REDACTED")}
  if(!response.ok)throw Error("PROVIDER_HTTP_"+response.status);
  const raw=await response.json();
  if(raw?.status==="error"||raw?.code)throw Error("PROVIDER_RETURNED_ERROR");
  const records=Array.isArray(raw)?raw:Array.isArray(raw?.data)?raw.data:null;
  if(!records)throw Error("PROVIDER_SCHEMA_MISMATCH");
  return records;
 }finally{clearTimeout(timer)}
}
const [stocks,exchanges]=await Promise.all([get("stocks?format=JSON"),get("exchanges")]);
if(stocks.length<1000||exchanges.length<5)throw Error("PROVIDER_CATALOGUE_INCOMPLETE");
const screened=screenWorldEquityReferences({stocks,exchanges,world,europe,limit,at:new Date().toISOString()});
if(screened.summary.accepted<100||screened.summary.selected<100)throw Error("PROVIDER_COMMON_EQUITY_IDENTITY_COVERAGE_TOO_LOW");
const temporary=process.env.RUNNER_TEMP||path.join(root,".world-private-temp");
await mkdir(temporary,{recursive:true});
await writeFile(path.join(temporary,"fenice-world-equity-references.json"),
 JSON.stringify({generatedAt:screened.summary.generatedAt,status:"PRIVATE_RESEARCH_REFERENCES_ONLY",
   safety:screened.summary.safety,references:screened.selected},null,2)+"\n",{mode:0o600});
await writeFile(path.join(root,"data","world-equity-funnel-status.json"),JSON.stringify(screened.summary,null,2)+"\n");
console.log("World equity reference scan: read="+screened.summary.read+" common="+screened.summary.common
 +" accepted="+screened.summary.accepted+" sampled="+screened.summary.selected
 +" countries="+screened.summary.countries+" regions="+screened.summary.regions+" PAPER/LIVE=OFF");
