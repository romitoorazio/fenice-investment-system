/**
 * Local PRIVATE EOD runner — no network, secrets, broker clients, or public
 * ledger writes. --commit is explicit and only changes a private file outside
 * the Git repository. The wall clock is taken here (not from event JSON).
 */
import {existsSync,realpathSync,readFileSync} from "node:fs";
import {resolve,dirname,isAbsolute,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {commitOneGlobalPrivateEodLedger} from "../lib/trading/one-global-eod-private-store.mjs";
import {
  newOneGlobalEodPaperLedger,replayOneGlobalEodPaperLedger,
  recordOneGlobalEodSignal,settleOneGlobalEodSignal,summarizeOneGlobalEodPaper,
} from "../lib/trading/one-global-eod-paper.mjs";

const ROOT=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),".."));
function privateFile(arg,required=true){
  if(!arg){if(required)throw Error("EOD_PRIVATE_FILE_REQUIRED");return null;}
  if(typeof arg!=="string"||!isAbsolute(arg))throw Error("EOD_ABSOLUTE_PRIVATE_PATH_REQUIRED");
  const parent=realpathSync(dirname(arg));
  const path=existsSync(arg)?realpathSync(arg):resolve(parent,arg.split(/[\\/]/).at(-1));
  if(path===ROOT||path.startsWith(ROOT+sep))
    throw Error("EOD_NEVER_WRITE_OR_READ_PRIVATE_DATA_INSIDE_REPOSITORY");
  return path;
}
const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith("--")&&x.includes("="))
  .map(x=>{const j=x.indexOf("=");return [x.slice(2,j),x.slice(j+1)];}));
const commit=process.argv.includes("--commit");
if(process.argv.includes("--help")){
  console.log("Usage: node scripts/run-one-global-eod-private.mjs --event=/private/event.json --ledger=/private/eod-ledger.json [--authority=/private/consent.json] [--commit]");
  console.log("Default is DRY-RUN. --commit modifies ONLY the named private ledger, never GitHub or Directa.");
  process.exit(0);
}
const eventPath=privateFile(args.event);
const ledgerPath=privateFile(args.ledger);
const authorityPath=privateFile(args.authority,false);
const parse=path=>{
  const bytes=readFileSync(path);
  if(!bytes.length||bytes.length>1500000)throw Error("EOD_PRIVATE_INPUT_TOO_LARGE_OR_EMPTY");
  return JSON.parse(bytes.toString("utf8"));
};
const previous=existsSync(ledgerPath)?parse(ledgerPath):newOneGlobalEodPaperLedger();
replayOneGlobalEodPaperLedger(previous);
const event=parse(eventPath),nowIso=new Date().toISOString();
let evaluated;
if(event?.kind==="SIGNAL"){
  evaluated=recordOneGlobalEodSignal({
    previousLedger:previous,nowIso,
    signal:{...event.signal,decisionAt:nowIso},
  });
}else if(event?.kind==="SETTLE"){
  if(!authorityPath)throw Error("EOD_PRIVATE_OWNER_APPROVAL_FILE_REQUIRED");
  evaluated=settleOneGlobalEodSignal({
    previousLedger:previous,nowIso,
    signalHash:event.signalHash,
    marketEvidence:event.marketEvidence,
    ownerReviewedRights:event.ownerReviewedRights,
    fxEvidence:event.fxEvidence||null,
    authority:parse(authorityPath),
  });
}else throw Error("EOD_UNSUPPORTED_PRIVATE_EVENT_KIND");
const ledger=evaluated.ledger;
replayOneGlobalEodPaperLedger(ledger);
const report=summarizeOneGlobalEodPaper(ledger);
if(commit){
  // CBA and BAMI may settle in separate processes. Never overwrite a
  // concurrent PAPER fill simply because an older snapshot was read first.
  commitOneGlobalPrivateEodLedger({
    ledgerPath,expectedLedger:previous,nextLedger:ledger,
  });
}
console.log(JSON.stringify({
  mode:"ONE_GLOBAL_EOD_PRIVATE_PAPER",
  action:event.kind,committedToPrivateDisk:commit,
  newJournalEvents:ledger.events.length-previous.events.length,
  virtualBuys:report.virtualBuys,virtualSells:report.virtualSells,
  closedVirtualRoundTrips:report.closedVirtualRoundTrips,
  pendingSignals:report.pendingSignals,
  phase9CertificationCredit:0,marketDataRightsIndependentlyCertified:false,
  strategyCertified:false,liveTradingAllowed:false,brokerConnectivityAllowed:false,
  note:"No price, provider payload, secret, or raw receipt published to stdout.",
}));
