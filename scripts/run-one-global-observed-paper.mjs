/**
 * Private one-shot FENICE observed PAPER import. Does not touch the certified EOD ledger.
 * Usage: node scripts/run-one-global-observed-paper.mjs \
 *  --original=/private/strict-ledger.json --practice=/private/exercise.json \
 *  --consent=/private/owner-consent.json --output=/private/observed-paper.json --commit
 * Missing --commit: dry run. No network, secrets or broker clients.
 */
import {readFileSync,existsSync,realpathSync,openSync,writeFileSync,fsyncSync,closeSync,unlinkSync} from 'node:fs';
import {dirname,resolve,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {recordOneGlobalObservedPaper} from '../lib/trading/one-global-observed-paper.mjs';
const ROOT=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.startsWith('--')&&x.includes('=')).map(x=>{const i=x.indexOf('=');return [x.slice(2,i),x.slice(i+1)];}));
function privatePath(p){if(typeof p!=='string'||!isAbsolute(p))throw Error('OBSERVED_PAPER_PRIVATE_ABSOLUTE_PATH_REQUIRED');const parent=realpathSync(dirname(p));const final=resolve(parent,p.split(/[\\/]/).at(-1));if(parent===ROOT||parent.startsWith(ROOT+sep)||final.startsWith(ROOT+sep))throw Error('OBSERVED_PAPER_PRIVATE_PATH_INSIDE_REPO');return final;}
function load(p){const b=readFileSync(privatePath(p));if(b.length===0||b.length>1500000)throw Error('OBSERVED_PAPER_PRIVATE_INPUT_SIZE_INVALID');return JSON.parse(b.toString('utf8'));}
const original=load(args.original),practice=load(args.practice),consent=load(args.consent);
const now=new Date().toISOString();
if(consent?.mode!=='ONE_GLOBAL_FORWARD_EOD_PRIVATE_PAPER'||consent.ownerConsent!==true||consent.approvedForVirtualSimulation!==true||consent.liveTradingAllowed!==false||consent.brokerConnectivityAllowed!==false||consent.realBrokerOrdersAllowed!==false||Date.parse(consent.approvedAt)>Date.parse(now)||Date.parse(consent.expiresAt)<=Date.parse(now))throw Error('OBSERVED_PAPER_OWNER_CONSENT_INVALID');
const out=privatePath(args.output);
if(existsSync(out))throw Error('OBSERVED_PAPER_OUTPUT_ALREADY_EXISTS');
const {ledger,status}=recordOneGlobalObservedPaper({originalLedger:original,practiceEntry:practice,nowIso:now});
const commit=process.argv.includes('--commit');
if(commit){let fd;try{fd=openSync(out,'wx',0o600);writeFileSync(fd,JSON.stringify(ledger,null,2)+'\n');fsyncSync(fd);closeSync(fd);fd=null;}finally{if(fd!==undefined&&fd!==null){closeSync(fd);try{unlinkSync(out)}catch{}}}}
console.log(JSON.stringify({mode:ledger.mode,committedToPrivateDisk:commit,virtualFills:status.virtualFills,cashEuro:status.cashEuro,strictPaperFills:0,certifiedTrades:0,phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false,note:'Observed-source non-certified virtual FILL; original strict journal remains unchanged.'}));