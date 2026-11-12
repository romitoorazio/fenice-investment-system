/**
 * Optional official Euronext delayed MiFID equities ZIP download.
 * Operator must explicitly opt in. Private disk only. Never a verified EOD close.
 * node scripts/fetch-one-global-euronext-free-zip.mjs --mic=XMIL
 * --output=/private/euronext-milan.zip --commit
 */
import {realpathSync,existsSync,writeFileSync} from "node:fs";
import {dirname,resolve,isAbsolute,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {euronextDelayedEquitiesZipUrl,unzipSingleFreeWorldCsv,
  FREE_WORLD_FILE_MAX_BYTES} from "../lib/market/one-global-free-world-file.mjs";
const ROOT=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),".."));
const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith("--")&&x.includes("="))
  .map(x=>{const k=x.indexOf("=");return [x.slice(2,k),x.slice(k+1)];}));
if(process.argv.includes("--help")){
  console.log("Free official Euronext previous trading day delayed trade CSV/ZIP; --mic=XMIL --output=/private/file.zip --commit. Never official close or PAPER.");
  process.exit(0);
}
if(!process.argv.includes("--commit")||!args.output||!isAbsolute(args.output)||!args.output.toLowerCase().endsWith(".zip"))
  throw Error("EURONEXT_PRIVATE_EXPLICIT_ZIP_OUTPUT_AND_COMMIT_REQUIRED");
const parent=realpathSync(dirname(args.output));
const output=resolve(parent,args.output.split(/[\\/]/).at(-1));
if(parent===ROOT||parent.startsWith(ROOT+sep)||output===ROOT||output.startsWith(ROOT+sep)
  ||existsSync(output))throw Error("EURONEXT_PRIVATE_SAFE_FRESH_OUTPUT_REQUIRED");
const url=euronextDelayedEquitiesZipUrl(args.mic);
const res=await fetch(url,{method:"GET",redirect:"error",
  headers:{Accept:"application/zip,application/octet-stream"},
  signal:AbortSignal.timeout(90000)});
if(!res.ok||!res.body)throw Error("EURONEXT_FREE_SOURCE_HTTP_UNAVAILABLE");
const ct=(res.headers.get("content-type")||"").toLowerCase();
if(ct&& !/zip|octet-stream|binary/.test(ct))throw Error("EURONEXT_EXPECTED_BINARY_ZIP");
const chunks=[];let length=0;
for await (const part of res.body){
  length+=part.length;
  if(length>FREE_WORLD_FILE_MAX_BYTES)throw Error("EURONEXT_ZIP_LIMIT_EXCEEDED");
  chunks.push(part);
}
const binary=Buffer.concat(chunks);
const csv=unzipSingleFreeWorldCsv(binary);
if(!csv.csv.includes("TradingDateTime")||!csv.csv.includes("MifidInstrumentID")
  ||!csv.csv.includes("MifidPrice"))throw Error("EURONEXT_ZIP_SCHEMA_NOT_RECOGNIZED");
writeFileSync(output,binary,{flag:"wx",mode:0o600});
console.log(JSON.stringify({source:"EURONEXT_OFFICIAL_FREE_DELAYED_TRADES",
  venue:args.mic,scope:"EQUITIES_PREVIOUS_TRADING_DAY",
  privateZipSaved:true,fileType:"ZIP_CONTAINING_CSV",
  officialCloseCertified:false,providerRightsIndependentlyCertified:false,
  paperEligible:false,phase9Credit:0,liveTradingAllowed:false,
  brokerConnectivityAllowed:false,noPriceOrSourcePayloadPublished:true}));
