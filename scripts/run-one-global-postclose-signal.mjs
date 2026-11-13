/**
 * PRIVATE after-close SIGNAL writer for FENICE strict forward EOD ledger.
 * Reads already-collected two-vendor RESEARCH report; NEVER connects to
 * providers or Directa, never writes source prices to public GitHub.
 *
 * node scripts/run-one-global-postclose-signal.mjs \
 *   --report=/private/dual-eod.json --ledger=/private/strict-ledger.json [--commit]
 * The default is a dry run. The actual wall clock is used for decisionAt.
 */
import {readFileSync,realpathSync,statSync} from 'node:fs';
import {dirname,resolve,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildOneGlobalProspectiveSignalFromDualEod} from '../lib/trading/one-global-prospective-dual-eod-bridge.mjs';
import {commitOneGlobalPrivateEodLedger} from '../lib/trading/one-global-eod-private-store.mjs';
import {replayOneGlobalEodPaperLedger} from '../lib/trading/one-global-eod-paper.mjs';
const ROOT=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')&&x.includes('=')).map(x=>{
 const i=x.indexOf('=');return [x.slice(2,i),x.slice(i+1)];
}));
function privateFile(p){
 if(typeof p!=='string'||!isAbsolute(p))throw Error('EOD_SIGNAL_ABSOLUTE_PRIVATE_PATH_REQUIRED');
 const full=realpathSync(p),parent=realpathSync(dirname(full));
 if(full===ROOT||full.startsWith(ROOT+sep)||parent===ROOT||parent.startsWith(ROOT+sep)
   ||!statSync(full).isFile())throw Error('EOD_SIGNAL_PRIVATE_INPUT_OR_LEDGER_INVALID');
 return full;
}
function parse(path){
 const bytes=readFileSync(path);
 if(bytes.length<10||bytes.length>1500000)throw Error('EOD_SIGNAL_PRIVATE_INPUT_SIZE');
 return JSON.parse(bytes.toString('utf8'));
}
const reportPath=privateFile(args.report),ledgerPath=privateFile(args.ledger);
if(reportPath===ledgerPath)throw Error('EOD_SIGNAL_SOURCE_AND_LEDGER_MUST_DIFFER');
const previous=parse(ledgerPath),report=parse(reportPath);
replayOneGlobalEodPaperLedger(previous);
const nowIso=new Date().toISOString();
const built=buildOneGlobalProspectiveSignalFromDualEod({report,previousLedger:previous,nowIso});
replayOneGlobalEodPaperLedger(built.ledger);
const commit=process.argv.includes('--commit');
if(commit)commitOneGlobalPrivateEodLedger({
 ledgerPath,expectedLedger:previous,nextLedger:built.ledger,
});
console.log(JSON.stringify({
 mode:'FENICE_ONE_GLOBAL_ORIGINAL_PRIVATE_EOD',
 action:'PROSPECTIVE_RESEARCH_SIGNAL',key:built.key,
 decisionAt:built.decisionAt,referenceSessionDate:built.referenceSessionDate,
 newJournalEvents:1,signalHash:built.signalHash,committedToPrivateLedger:commit,
 paperFillsCreated:0,phase9Credit:0,
 sourceLicensingAndIndependenceStillUnverified:true,
 liveTradingAllowed:false,brokerConnectivityAllowed:false,
 note:'No official FILL, no original provider raw quotes in GitHub, no Directa.'
}));
