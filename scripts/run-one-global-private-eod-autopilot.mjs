/**
 * FENICE ONE GLOBAL — local-only, bounded research-SIGNAL autopilot.
 * Uses the ORIGINAL private EOD ledger and existing collectors/strict writer.
 * Never settles a FILL, accesses Directa, publishes prices, or auto-certifies.
 *
 * node scripts/run-one-global-private-eod-autopilot.mjs
 *    --ledger=/absolute/private/eod-ledger.json [--symbols=AAPL,MSFT,TSLA] [--commit]
 * Default dry run: temporary private report deleted, ledger unchanged.
 * --commit: preserve report alongside PRIVATE ledger, then append at most ONE
 * validated forward SIGNAL with the existing CAS/lock writer.
 */
import {mkdtempSync,readFileSync,realpathSync,lstatSync,statSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {replayOneGlobalEodPaperLedger} from '../lib/trading/one-global-eod-paper.mjs';
import {PRIVATE_EOD_SYMBOLS,planPrivateEodSignalCycle} from '../lib/trading/one-global-private-eod-autopilot.mjs';

const ROOT=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const argv=process.argv.slice(2);
if(argv.includes('--help')){
  console.log('Usage: node scripts/run-one-global-private-eod-autopilot.mjs --ledger=/absolute/private/eod-ledger.json [--symbols=AAPL,MSFT,TSLA] [--commit]');
  console.log('Local, private, NO BROKER. Default dry-run; --commit writes at most one prospective research SIGNAL, never a FILL.');
  process.exit(0);
}
const flags=new Set();
const args={};
for(const x of argv){
  if(x==='--commit'){if(flags.has(x))throw Error('EOD_AUTOPILOT_DUPLICATE_FLAG');flags.add(x);continue;}
  const idx=x.indexOf('='),k=x.slice(0,idx);
  if(idx<0||!['--ledger','--symbols'].includes(k)||Object.hasOwn(args,k))
    throw Error('EOD_AUTOPILOT_UNRECOGNIZED_ARGUMENT');
  args[k]=x.slice(idx+1);
}
const commit=flags.has('--commit');
function originalPrivateLedger(path){
  if(!path||!isAbsolute(path))throw Error('EOD_AUTOPILOT_ABSOLUTE_PRIVATE_LEDGER_REQUIRED');
  if(!existsSync(path))throw Error('EOD_AUTOPILOT_ORIGINAL_LEDGER_REQUIRED_NO_RESET');
  // The caller must point to the *existing* ORIGINAL journal. Never start a
  // replacement ledger or silently overwrite a previous private campaign.
  if(lstatSync(path).isSymbolicLink())throw Error('EOD_AUTOPILOT_LEDGER_SYMLINK_FORBIDDEN');
  const full=realpathSync(path);
  if(full===ROOT||full.startsWith(ROOT+sep)||!statSync(full).isFile())
    throw Error('EOD_AUTOPILOT_PRIVATE_LEDGER_OUTSIDE_PUBLIC_REPOSITORY_REQUIRED');
  const bytes=readFileSync(full);
  if(bytes.length<30||bytes.length>1_500_000)throw Error('EOD_AUTOPILOT_LEDGER_SIZE_INVALID');
  const ledger=JSON.parse(bytes.toString('utf8'));
  replayOneGlobalEodPaperLedger(ledger);
  return {path:full,ledger};
}
const {path:ledgerPath,ledger}=originalPrivateLedger(args['--ledger']);
const symbols=args['--symbols']?args['--symbols'].split(','):PRIVATE_EOD_SYMBOLS;
const nowIso=new Date().toISOString();
const plan=planPrivateEodSignalCycle({nowIso,originalLedger:ledger,symbols});
const available=plan.candidates.filter(x=>x.eligible);
const outcome={mode:plan.mode,sessionDate:plan.sessionDate,commitRequested:commit,
  candidatesEligible:available.length,probed:0,signalAppended:false,
  paperFillsCreated:0,certifiedTrades:0,phase9Credit:0,
  realBrokerOrders:0,brokerConnectivityAllowed:false,liveTradingAllowed:false,
  outcomes:[]};
if(available.length===0){
  outcome.outcomes=plan.candidates.map(x=>({symbol:x.symbol,status:x.reason}));
  console.log(JSON.stringify(outcome));process.exit(0);
}
if(!process.env.ALPHA_VANTAGE_API_KEY){
  outcome.outcomes=[{status:'ALPHA_VANTAGE_EXISTING_ENV_KEY_UNAVAILABLE'}];
  console.log(JSON.stringify(outcome));process.exit(0);
}
const scratch=commit?null:mkdtempSync(join(tmpdir(),'fenice-private-eod-'));
function reasonOf(error,fallback){
  // Never emit child stderr or URLs: provider errors can contain credentials.
  const stderr=Buffer.isBuffer(error?.stderr)?error.stderr.toString('utf8'):String(error?.stderr||'');
  const code=stderr.match(/\b(?:FIRST_PAPER|EOD_PROSPECTIVE_BRIDGE|EOD_PAPER|EOD_PRIVATE)_([A-Z0-9_]{3,100})\b/);
  return code?code[0]:fallback;
}
try{
  for(const candidate of available){
    const reportPath=join(scratch||dirname(ledgerPath),
      'fenice-private-eod-'+plan.sessionDate+'-'+candidate.symbol+'.json');
    if(!existsSync(reportPath)){
      // Existing collector authenticates exact symbols, compares actual EOD
      // provider responses and creates private 0600 files without overwriting.
      try{
        execFileSync(process.execPath,[
          join(ROOT,'scripts/collect-one-global-first-paper-dual-eod.mjs'),
          '--symbol='+candidate.symbol,'--session='+plan.sessionDate,
          '--output='+reportPath,'--commit',
        ],{cwd:ROOT,encoding:'utf8',stdio:'pipe',timeout:45000,maxBuffer:100000});
        outcome.probed++;
      }catch(error){
        outcome.outcomes.push({symbol:candidate.symbol,status:reasonOf(error,'REAL_TWO_PROVIDER_EOD_INTAKE_FAILED')});
        continue;
      }
    }
    // Dry-run first, including strict replay, close freshness and timing.
    const signalArgs=[
      join(ROOT,'scripts/run-one-global-postclose-signal.mjs'),
      '--report='+reportPath,'--ledger='+ledgerPath,
    ];
    try{
      execFileSync(process.execPath,signalArgs,
        {cwd:ROOT,encoding:'utf8',stdio:'pipe',timeout:15000,maxBuffer:100000});
    }catch(error){
      outcome.outcomes.push({symbol:candidate.symbol,status:reasonOf(error,'PROSPECTIVE_SIGNAL_GATE_REJECTED')});
      continue;
    }
    if(commit){
      try{
        // Actual private writer still CAS-locks and replays the original journal;
        // concurrent commits, stale snapshots and duplicates fail closed.
        execFileSync(process.execPath,[...signalArgs,'--commit'],
          {cwd:ROOT,encoding:'utf8',stdio:'pipe',timeout:15000,maxBuffer:100000});
        outcome.signalAppended=true;
        outcome.outcomes.push({symbol:candidate.symbol,status:'PRIVATE_RESEARCH_SIGNAL_COMMITTED_NOT_FILL'});
      }catch(error){
        outcome.outcomes.push({symbol:candidate.symbol,status:reasonOf(error,'PRIVATE_CAS_WRITER_REJECTED')});
      }
    }else{
      outcome.outcomes.push({symbol:candidate.symbol,status:'DRY_RUN_PROSPECTIVE_SIGNAL_VALID'});
    }
    // At most one new SIGNAL per invocation. A dry-run never writes to ledger.
    break;
  }
}finally{
  if(scratch)rmSync(scratch,{recursive:true,force:true});
}
console.log(JSON.stringify(outcome));
