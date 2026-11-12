/**
 * Read-only preflight for the first ASX + Milan prospective EOD signals.
 * Without --ledger, checks only the published CBA witness.
 * With --ledger=/ABSOLUTE/PRIVATE/ledger.json, audits authentic private
 * pending SIGNAL metadata; never prints receipts, prices or ledger contents.
 */
import {readFileSync,realpathSync,statSync} from "node:fs";
import {dirname,resolve,isAbsolute,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {auditOneGlobalEodPilotSignalWindow} from "../lib/trading/one-global-eod-pilot-time-audit.mjs";
import {replayOneGlobalEodPaperLedger} from "../lib/trading/one-global-eod-paper.mjs";
const root=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),".."));
const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith("--")&&x.includes("="))
  .map(x=>{const i=x.indexOf("=");return [x.slice(2,i),x.slice(i+1)];}));
if(process.argv.includes("--help")){
 console.log("Usage: node scripts/audit-one-global-eod-pilot-time.mjs [--ledger=/absolute/private/eod-ledger.json]. Read-only, no prices/orders.");
 process.exit(0);
}
const witness=JSON.parse(readFileSync("data/one-global-first-paper-cba-signal-witness.json","utf8"));
const first=auditOneGlobalEodPilotSignalWindow({
 mic:witness.exchangeMic,referenceSessionDate:witness.researchBarSession,
 referenceCloseAt:witness.researchCloseAt,
 referencePublishedAt:witness.researchPublishedAt,recordedAt:witness.decisionRecordedAt,
});
let privateSignals=[],privateLedgerAudited=false;
if(args.ledger){
 if(!isAbsolute(args.ledger))throw Error("PRIVATE_EOD_AUDIT_ABSOLUTE_PATH_REQUIRED");
 const path=realpathSync(args.ledger);
 if(path===root||path.startsWith(root+sep))throw Error("PRIVATE_EOD_AUDIT_NEVER_READ_GITHUB");
 if(!statSync(path).isFile()||statSync(path).size>1_500_000)
   throw Error("PRIVATE_EOD_AUDIT_FILE_INVALID_OR_OVERSIZE");
 const ledger=JSON.parse(readFileSync(path,"utf8"));
 const state=replayOneGlobalEodPaperLedger(ledger);
 privateLedgerAudited=true;
 for(const e of ledger.events.filter(e=>e.kind==="SIGNAL"
   &&["XMIL:BAMI","XASX:CBA"].includes(e.key)
   &&state.pendingSignals.includes(e.key))){
   const result=auditOneGlobalEodPilotSignalWindow({
    mic:e.mic,referenceSessionDate:e.referenceSessionDate,
    referenceCloseAt:e.referenceCloseAt,
    referencePublishedAt:e.referencePublishedAt,recordedAt:e.recordedAt,
   });
   privateSignals.push({mic:e.mic,status:result.status,
      independentlyVerifiedSession:false,eligibleBySchedule:result.eligibleBySchedule,
      paperFillEligible:false});
 }
}
console.log(JSON.stringify({
 mode:"ONE_GLOBAL_PILOT_TIME_DIAGNOSTIC_ONLY",CBA:{status:first.status,
   eligibleBySchedule:first.eligibleBySchedule,independentSessionProof:false},
 privateLedgerAudited,
 privateSignals,
 BAMIWithoutPrivateLedger:!privateLedgerAudited?"PRIVATE_SIGNAL_METADATA_UNAVAILABLE":null,
 paperFillEligible:false,sourceRightsCertified:false,independentPriceReceipts:0,
 strategyCertified:false,phase9Credit:0,
 brokerConnectivityAllowed:false,liveTradingAllowed:false,
 noPricesOrPrivateHashPublished:true,
}));
