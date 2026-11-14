import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {cloudResearchPlan,classifyCloudResearchReport} from '../lib/trading/one-global-cloud-eod-research.mjs';

const t='2026-11-13T22:30:00.000Z'; // New York Friday 17:30 EST
const plan=cloudResearchPlan(t);
assert.equal(plan.sessionDate,'2026-11-13');
assert.equal(plan.withinNewYorkPostcloseWindow,true);
assert.equal(plan.originalPrivateJournalConnected,false);
assert.equal(plan.originalPrivateJournalChanged,false);
assert.equal(plan.paperFillsCreated,0);
assert.equal(plan.liveTradingAllowed,false);
assert.deepEqual(plan.symbols,['AAPL','MSFT','TSLA']);
assert.equal(cloudResearchPlan('2026-11-14T22:30:00.000Z').withinNewYorkPostcloseWindow,false);
assert.equal(cloudResearchPlan('2026-07-10T21:30:00.000Z').withinNewYorkPostcloseWindow,true,
  'summer 17:30 EDT must remain eligible');
assert.throws(()=>cloudResearchPlan('bad'),/CLOCK_INVALID/);
const base={
 mode:'ONE_GLOBAL_FIRST_PAPER_DUAL_EOD_RESEARCH_ONLY',
 observedAt:'2026-11-13T22:20:00.000Z',sessionDate:'2026-11-13',
 key:'XNAS:AAPL',mic:'XNAS',currency:'USD',symbol:'AAPL',
 upstreamFamilyIdentitiesIndependentlyAudited:false,
 sources:[{providerId:'alpha-vantage',sourceFamily:'alpha-vantage',
   payloadSha256:'a'.repeat(64),close:180},
  {providerId:'eodhd',sourceFamily:'eodhd',
   payloadSha256:'b'.repeat(64),close:180.1}],
 closeDifferencePct:0.0555,researchIndicator:'UPTREND_RESEARCH_ONLY',
 sma5:174,sma20:169,priorSma5:173,
 paperSettlementEligible:false,certifiedVirtualFills:0,phase9Credit:0,
 brokerConnectivityAllowed:false,liveTradingAllowed:false,
};
const valid=classifyCloudResearchReport({nowIso:t,report:base});
assert.equal(valid.status,'PROSPECTIVE_RESEARCH_GATE_PASSED_NOT_RECORDED');
assert.equal(valid.canonicalSignalCommitted,false);
assert.equal(valid.paperFillCreated,false);
assert.equal(valid.sourceIndependenceCertified,false);
assert.equal(valid.sourceRightsApproved,false);
assert.equal(valid.liveTradingAllowed,false);
assert.equal(classifyCloudResearchReport({nowIso:t,report:{...base,
 researchIndicator:'NO_UPTREND'}}).status,'EOD_PROSPECTIVE_BRIDGE_RESEARCH_GATE_NOT_MET');
assert.equal(classifyCloudResearchReport({nowIso:t,report:{...base,
 sources:[base.sources[0],{...base.sources[1],close:220}]}}).status,
 'EOD_PROSPECTIVE_BRIDGE_SOURCE_DISAGREEMENT');
assert.equal(classifyCloudResearchReport({nowIso:'2026-11-14T22:30:00.000Z',
 report:base}).status,'OUTSIDE_EXCHANGE_LOCAL_WINDOW');
assert.throws(()=>classifyCloudResearchReport({nowIso:t,report:{symbol:'BOGUS'}}),
 /CLOUD_EOD_UNTRUSTED_PROVIDER_REPORT/);

const script=resolve('scripts/run-one-global-cloud-eod-research.mjs');
assert.match(execFileSync(process.execPath,[script,'--help'],{encoding:'utf8'}),/no original private ledger/i);
const home=mkdtempSync(join(tmpdir(),'fenice-cloud-eod-test-'));
try{
 const destination=join(home,'safe-only.json');
 const p=spawnSync(process.execPath,[script,'--output='+destination],{
  env:{...process.env,ALPHA_VANTAGE_API_KEY:''},encoding:'utf8',timeout:10000});
 assert.equal(p.status,0,p.stderr);
 const result=JSON.parse(readFileSync(destination,'utf8'));
 assert.equal(result.originalPrivateJournalConnected,false);
 assert.equal(result.paperFillsCreated,0);
 assert.equal(result.certifiedTrades,0);
 assert.equal(result.liveTradingAllowed,false);
 assert.equal(result.originalPrivateJournalChanged,false);
 assert.doesNotMatch(p.stdout,/payloadSha256|providerReceipts|unitPrice|rawClose/);
 const second=spawnSync(process.execPath,[script,'--output='+destination],{
   env:{...process.env,ALPHA_VANTAGE_API_KEY:''},encoding:'utf8',timeout:10000});
 assert.notEqual(second.status,0,'sanitized artifacts must be create-only');
}finally{rmSync(home,{force:true,recursive:true});}
console.log('PASS cloud EOD: real-source gate parity, NY DST/weekend, no private reset, no falsified fill, no-network CI, sanitized output.');
