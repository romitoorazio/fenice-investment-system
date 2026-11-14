/**
 * GitHub Actions main-branch research diagnostic using REAL dual-provider EOD.
 * No broker, LIVE, private ledger initialization, canonical SIGNAL or FILL.
 * Raw prices, vendor responses and their SHA hashes are confined to a private
 * ephemeral runner temp directory and deleted before any artifact upload.
 */
import {mkdtempSync,readFileSync,writeFileSync,rmSync,realpathSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {cloudResearchPlan,classifyCloudResearchReport} from '../lib/trading/one-global-cloud-eod-research.mjs';

const ROOT=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const args=process.argv.slice(2);
if(args.includes('--help')){
  console.log('node scripts/run-one-global-cloud-eod-research.mjs [--output=/absolute/sanitized.json]');
  console.log('Research-only; no original private ledger, SIGNAL, FILL or Directa access.');
  process.exit(0);
}
const parsed={};
for(const arg of args){
  if(!arg.startsWith('--output=')||Object.hasOwn(parsed,'output'))throw Error('CLOUD_EOD_ARGUMENT_INVALID');
  parsed.output=arg.slice('--output='.length);
}
if(parsed.output&&(!isAbsolute(parsed.output)||parsed.output===ROOT||parsed.output.startsWith(ROOT+sep)))
  throw Error('CLOUD_EOD_SAFE_REPORT_ONLY_OUTSIDE_REPOSITORY');
function writeSafe(report){
  // Prevent accidentally publishing original source snapshots, hashes, terms,
  // credentials, pricing or provider responses as a GitHub artifact.
  const json=JSON.stringify(report,null,2)+'\n';
  if(json.length>8000||/(?:payloadSha256|sourceSnapshotHash|providerReceipts|api[_-]?key|token|rawClose|grossEuro|unitPrice)/i.test(json))
    throw Error('CLOUD_EOD_UNSAFE_ARTIFACT');
  if(parsed.output){
    const parent=realpathSync(dirname(parsed.output));
    if(parent===ROOT||parent.startsWith(ROOT+sep)||!statSync(parent).isDirectory())
      throw Error('CLOUD_EOD_PUBLIC_OUTPUT_PARENT_FORBIDDEN');
    writeFileSync(parsed.output,json,{flag:'wx',mode:0o600});
  }
  console.log(json.trim());
}
const nowIso=new Date().toISOString();
const plan=cloudResearchPlan(nowIso);
const status={...plan,dualProviderCollectorAttempts:0,providerResponsesParsed:0,
  outcomes:[],result:'RESEARCH_ONLY_NO_PAPER_EVENT'};
if(!plan.withinNewYorkPostcloseWindow){
  status.outcomes=[{status:'NOT_IN_NEW_YORK_AFTER_CLOSE_WINDOW'}];
  writeSafe(status);process.exit(0);
}
if(!process.env.ALPHA_VANTAGE_API_KEY){
  status.outcomes=[{status:'EXISTING_ALPHA_VANTAGE_GITHUB_SECRET_MISSING'}];
  writeSafe(status);process.exit(0);
}
const scratch=mkdtempSync(join(tmpdir(),'fenice-eod-cloud-'));
try{
  for(const symbol of plan.symbols){
    const output=join(scratch,'private-'+symbol+'.json');
    let report;
    status.dualProviderCollectorAttempts++;
    try{
      // Source body never reaches git, public artifact, or stdout.
      execFileSync(process.execPath,[
        join(ROOT,'scripts/collect-one-global-first-paper-dual-eod.mjs'),
        '--symbol='+symbol,'--session='+plan.sessionDate,
        '--output='+output,'--commit',
      ],{cwd:ROOT,encoding:'utf8',stdio:'pipe',timeout:40000,maxBuffer:150000});
      const bytes=readFileSync(output);
      if(bytes.length<10||bytes.length>1_500_000)
        throw Error('CLOUD_EOD_PRIVATE_REPORT_SIZE');
      report=JSON.parse(bytes.toString('utf8'));
      status.providerResponsesParsed+=2;
    }catch{
      status.outcomes.push({symbol,status:'REAL_PROVIDER_PAIR_FETCH_OR_CLOSE_REJECTED'});
      continue;
    }
    const classified=classifyCloudResearchReport({nowIso:new Date().toISOString(),report});
    status.outcomes.push(classified);
    if(classified.status==='PROSPECTIVE_RESEARCH_GATE_PASSED_NOT_RECORDED'){
      status.result='REAL_DUAL_EOD_SIGNAL_GATES_PASSED_PRIVATE_STORE_NOT_CONNECTED';
      break;
    }
  }
}finally{
  rmSync(scratch,{force:true,recursive:true});
}
writeSafe(status);
