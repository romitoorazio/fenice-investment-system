import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {assessOneGlobalAsxCbaDualEod as assess} from '../lib/market/one-global-asx-cba-dual-eod-research.mjs';

const alpha=JSON.stringify({
 'Meta Data':{'2. Symbol':'CBA.AX'},
 'Time Series (Daily)':{
  '2026-11-13':{'1. open':'170.1','4. close':'171.00'},
  '2026-11-12':{'4. close':'171.80'},
 }});
const eodhd=JSON.stringify([{date:'2026-11-13',open:170.1,close:171.2}]);
const result=assess({alphaRaw:alpha,eodhdRaw:eodhd});
assert.equal(result.symbol,'XASX:CBA');
assert.equal(result.comparedSessionDate,'2026-11-13');
assert.equal(result.twoPublisherRowsParsed,true);
assert.equal(result.dualCloseWithinHalfPercent,true);
assert.equal(result.independentFeedProven,false);
assert.equal(result.publisherPublicationTimesProven,false);
assert.equal(result.dataRightsIndependentlyReviewed,false);
assert.equal(result.originalPrivateJournalRead,false);
assert.equal(result.canonicalEventCommitted,false);
assert.equal(result.virtualPaperFillsCreated,0);
assert.equal(result.liveTradingAllowed,false);
assert.equal(result.brokerConnectivityAllowed,false);
assert.doesNotMatch(JSON.stringify(result),/171\.00|171\.2|payloadSha256|api_key/);

assert.throws(()=>assess({alphaRaw:alpha.replace('CBA.AX','MSFT'),
 eodhdRaw:eodhd}),/ASX_CBA_RESEARCH_ALPHA_SYMBOL_IDENTITY_UNVERIFIED/);
assert.throws(()=>assess({alphaRaw:JSON.stringify({'Note':'premium required'}),
 eodhdRaw:eodhd}),/ASX_CBA_RESEARCH_ALPHA_SYMBOL_IDENTITY_UNVERIFIED/);
assert.throws(()=>assess({alphaRaw:alpha.replace('2026-11-13','2026-11-16'),
 eodhdRaw:eodhd}),/ASX_CBA_RESEARCH_ALPHA_EXACT_NEXT_SESSION_CLOSE_UNAVAILABLE/);
assert.throws(()=>assess({alphaRaw:alpha,
 eodhdRaw:JSON.stringify([{date:'2026-11-16',close:171.2}])}),
 /ASX_CBA_RESEARCH_EODHD_EXACT_NEXT_SESSION_CLOSE_UNAVAILABLE/);
assert.throws(()=>assess({alphaRaw:alpha,
 eodhdRaw:JSON.stringify([{date:'2026-11-13',close:171.2},
  {date:'2026-11-13',close:171.3}])}),
 /ASX_CBA_RESEARCH_EODHD_EXACT_NEXT_SESSION_CLOSE_UNAVAILABLE/);
assert.throws(()=>assess({alphaRaw:alpha,
 eodhdRaw:JSON.stringify([{date:'2026-11-13',close:174}])}),
 /ASX_CBA_RESEARCH_DUAL_CLOSE_DIVERGENCE/);
assert.throws(()=>assess({alphaRaw:alpha,
 eodhdRaw:JSON.stringify([{date:'2026-11-13',close:171.2,
   symbol:'WRONG.AU'}])}),/ASX_CBA_RESEARCH_EODHD_SYMBOL_RESPONSE_MISMATCH/);
assert.throws(()=>assess({alphaRaw:'bad json',eodhdRaw:eodhd}),
 /ASX_CBA_RESEARCH_VENDOR_JSON_UNUSABLE/);

const runner=resolve('scripts/probe-one-global-asx-cba-eod.mjs');
assert.match(execFileSync(process.execPath,[runner,'--help'],{encoding:'utf8'}),
 /No prices/);
const dir=mkdtempSync(join(tmpdir(),'fenice-asx-research-test-'));
try{
 const path=join(dir,'sanitized.json');
 const env={...process.env,ALPHA_VANTAGE_API_KEY:'',EODHD_API_TOKEN:''};
 const run=spawnSync(process.execPath,[runner,'--output='+path],{
   encoding:'utf8',env,timeout:10000});
 assert.equal(run.status,0,run.stderr);
 assert.equal(existsSync(path),true);
 const p=JSON.parse(readFileSync(path,'utf8'));
 assert.ok(['ALPHA_VANTAGE_PRIVATE_KEY_NOT_CONFIGURED',
  'CBA_NOV13_NEXT_SESSION_EVIDENCE_WINDOW_EXPIRED',
  'FIRST_NEXT_ASX_CLOSE_NOT_YET_AVAILABLE'].includes(p.status),p.status);
 assert.equal(p.providerCalls,0,'no vendor request during CI tests');
 assert.equal(p.virtualPaperFillsCreated,0);
 assert.equal(p.originalPrivateJournalRead,false);
 assert.equal(p.canonicalEventCommitted,false);
 assert.equal(p.liveTradingAllowed,false);
 assert.equal(p.brokerConnectivityAllowed,false);
 assert.equal(p.phase9Credit,0);
 assert.doesNotMatch(run.stdout,/171\.00|171\.2|apikey=|api_token=|rawClose/);
 const duplicate=spawnSync(process.execPath,[runner,'--output='+path],{
   encoding:'utf8',env,timeout:10000});
 assert.notEqual(duplicate.status,0,'status artifact cannot overwrite');
 const invalidPath=spawnSync(process.execPath,[runner,'--output=data/secret.json'],{
   encoding:'utf8',env,timeout:10000});
 assert.notEqual(invalidPath.status,0);
}finally{rmSync(dir,{recursive:true,force:true});}
console.log('PASS CBA ASX dual EOD source probe: exact Fri13, publisher symbol, divergence, no API in tests, no receipts/leaks, no FILL/Directa.');
