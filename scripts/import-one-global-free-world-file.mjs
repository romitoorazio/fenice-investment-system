/**
 * Private-only import of user-retrieved free delayed market files.
 * Accepts local CSV and a bounded single-CSV ZIP; no network, Directa or trades.
 * Usage:
 * node scripts/import-one-global-free-world-file.mjs --input=/private/file.csv
 *   --kind=eod --mic=XNSE --symbol=SBIN --currency=INR --session=2026-11-12
 *   --provider=nse-public-report --source-url=https://www.nseindia.com/all-reports
 *   [--delimiter=semicolon] [--output=/private/fenice-eod.json --commit]
 * For Euronext: --kind=euronext --isin=IT0005218380 --mic=XMIL --symbol=BAMI
 */
import {readFileSync,realpathSync,existsSync,writeFileSync,statSync} from "node:fs";
import {resolve,dirname,isAbsolute,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {
  FREE_WORLD_FILE_MAX_BYTES,unzipSingleFreeWorldCsv,readFreeWorldEodCsv,readEuronextTradeCsv,
} from "../lib/market/one-global-free-world-file.mjs";
const ROOT=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),".."));
const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith("--")&&x.includes("="))
  .map(x=>{const j=x.indexOf("=");return [x.slice(2,j),x.slice(j+1)];}));
const commit=process.argv.includes("--commit");
const privatePath=(str,existing)=>{
  if(!str||!isAbsolute(str))throw Error("FREE_WORLD_PRIVATE_ABSOLUTE_PATH_REQUIRED");
  const base=realpathSync(dirname(str));
  const final=existing?realpathSync(str):resolve(base,str.split(/[\\/]/).at(-1));
  if(base===ROOT||base.startsWith(ROOT+sep)||final===ROOT||final.startsWith(ROOT+sep))
    throw Error("FREE_WORLD_FILE_MUST_REMAIN_OUTSIDE_REPOSITORY");
  return final;
};
if(process.argv.includes("--help")){
  console.log("Global EOD research only: --input --kind=eod|euronext --mic --symbol --currency --session --provider --source-url [--isin] [--delimiter=semicolon|tab] [--output=ABSOLUTE --commit]. ZIP must contain exactly one CSV. No online fetch, no PAPER fills or Directa.");
  process.exit(0);
}
const input=privatePath(args.input,true);
if(!statSync(input).isFile()||statSync(input).size>FREE_WORLD_FILE_MAX_BYTES)
  throw Error("FREE_WORLD_INPUT_TOO_LARGE_OR_NOT_FILE");
const raw=readFileSync(input);
let bytes=raw,csv=raw.toString("utf8");
if(input.toLowerCase().endsWith(".zip")){
  const decoded=unzipSingleFreeWorldCsv(raw);
  bytes=decoded.bytes;csv=decoded.csv;
}else if(!input.toLowerCase().endsWith(".csv"))
  throw Error("FREE_WORLD_ONLY_CSV_OR_ZIP");
const metadata={
 mic:args.mic,symbol:args.symbol,currency:args.currency,sessionDate:args.session,
 providerId:args.provider,sourceUrl:args["source-url"],isin:args.isin,
};
const report=args.kind==="eod"
 ?readFreeWorldEodCsv({csv,rawBytes:bytes,metadata,
   delimiter:args.delimiter==="semicolon"?";":args.delimiter==="tab"?"\t":","})
 :args.kind==="euronext"
 ?readEuronextTradeCsv({csv,rawBytes:bytes,metadata})
 :(()=>{throw Error("FREE_WORLD_UNKNOWN_FILE_KIND");})();
if(commit){
  const output=privatePath(args.output,false);
  if(existsSync(output))throw Error("FREE_WORLD_PRIVATE_OUTPUT_ALREADY_EXISTS");
  writeFileSync(output,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
}
console.log(JSON.stringify({
 mode:report.mode,source:report.providerId,mic:report.mic,sessionDate:report.sessionDate,
 kind:report.fileKind,committedToPrivateDisk:commit,referenceParsed:true,
 paperEligible:false,independentProviderReceipts:0,phase9Credit:0,
 brokerConnectivityAllowed:false,liveTradingAllowed:false,
 noPrivatePricesOrLicencePublished:true,
}));
