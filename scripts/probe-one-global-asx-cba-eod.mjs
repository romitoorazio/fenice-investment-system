/**
 * FENICE cloud CBA ASX research — two REAL keyed vendor responses, sanitized.
 * GitHub Actions default-branch only; no journal, Blob, broker or publisher
 * payload can be written by this script. Never print vendor URLs with keys.
 */
import {writeFileSync,realpathSync,statSync} from 'node:fs';
import {dirname,resolve,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  classifyOneGlobalCbaVendorFailure,assessOneGlobalAsxCbaAlphaEod,assessOneGlobalAsxCbaDualEod,CBA_NEXT_REGULAR_SESSION,
  CBA_ALPHA_SYMBOL,CBA_EODHD_SYMBOL,
} from '../lib/market/one-global-asx-cba-dual-eod-research.mjs';
const ROOT=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const argv=process.argv.slice(2);
if(argv.includes('--help')){
  console.log('node scripts/probe-one-global-asx-cba-eod.mjs [--output=/absolute/private/status.json]');
  console.log('No prices, private ledger writes, FILLs or Directa calls.');
  process.exit(0);
}
if(argv.length>1||(argv.length===1&&!argv[0].startsWith('--output=')))
  throw Error('ASX_CBA_PROBE_ARGUMENTS_INVALID');
const output=argv.length===1?argv[0].slice('--output='.length):null;
if(output){
  if(!isAbsolute(output))throw Error('ASX_CBA_PROBE_OUTPUT_ABSOLUTE_REQUIRED');
  const parent=realpathSync(dirname(output));
  if(parent===ROOT||parent.startsWith(ROOT+sep)||!statSync(parent).isDirectory())
    throw Error('ASX_CBA_PROBE_PUBLIC_REPO_OUTPUT_FORBIDDEN');
}
const nowIso=new Date().toISOString();
const report={
  mode:'ONE_GLOBAL_ASX_CBA_NEXT_SESSION_DUAL_EOD_RESEARCH',
  checkedAt:nowIso,symbol:'XASX:CBA',
  referenceSessionDate:'2026-11-12',comparedSessionDate:CBA_NEXT_REGULAR_SESSION,
  providerCalls:0,status:'NOT_ATTEMPTED',
  independentFeedProven:false,publisherPublicationTimesProven:false,
  dataRightsIndependentlyReviewed:false,officialEcbFxAttached:false,
  ownerPaperAuthorityAttached:false,originalPrivateJournalRead:false,
  canonicalEventCommitted:false,virtualPaperFillsCreated:0,certifiedTrades:0,
  phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false,
};
function outputSanitized(){
  const encoded=JSON.stringify(report,null,2)+'\n';
  if(encoded.length>6000||/(?:payloadSha256|rawClose|providerReceipts|closePrice|lastHash|api[_-]?key|token|receipt|cashEuro)/i.test(encoded))
    throw Error('ASX_CBA_UNSAFE_STATUS');
  if(output)writeFileSync(output,encoded,{encoding:'utf8',mode:0o600,flag:'wx'});
  console.log(encoded.trim());
}
if(nowIso<'2026-11-13T05:25:00.000Z'){
  report.status='FIRST_NEXT_ASX_CLOSE_NOT_YET_AVAILABLE';
  outputSanitized();process.exit(0);
}
if(nowIso>'2026-11-15T05:10:00.000Z'){
  // The engine only permits actual dated receipts no later than 48h after
  // the NEXT session closes. No weekend/Mon backfill from a stale pilot.
  report.status='CBA_NOV13_NEXT_SESSION_EVIDENCE_WINDOW_EXPIRED';
  outputSanitized();process.exit(0);
}
const alpha=process.env.ALPHA_VANTAGE_API_KEY;
const eod=process.env.EODHD_API_TOKEN;
if(typeof alpha!=='string'||!/^[-_A-Za-z0-9]{8,120}$/.test(alpha)){
  report.status='ALPHA_VANTAGE_PRIVATE_KEY_NOT_CONFIGURED';
  outputSanitized();process.exit(0);
}
const eodConfigured=typeof eod==='string'
  &&/^[-_A-Za-z0-9]{8,150}$/.test(eod)&&eod!=='demo';
const url1=new URL('https://www.alphavantage.co/query');
url1.search=new URLSearchParams({
  function:'TIME_SERIES_DAILY',symbol:CBA_ALPHA_SYMBOL,
  outputsize:'compact',apikey:alpha,
});
const url2=eodConfigured?new URL('https://eodhd.com/api/eod/'+CBA_EODHD_SYMBOL):null;
if(url2)url2.search=new URLSearchParams({
  api_token:eod,fmt:'json',from:CBA_NEXT_REGULAR_SESSION,
  to:CBA_NEXT_REGULAR_SESSION,
});
async function readVendor(url){
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(12000),
    headers:{Accept:'application/json'}});
  if(!response.ok){
    const status=response.status;
    if(status===401||status===403)
      throw Error('ASX_CBA_VENDOR_AUTH_OR_PLAN_DENIED');
    if(status===429)throw Error('ASX_CBA_VENDOR_RATE_LIMIT');
    if(status===404)throw Error('ASX_CBA_VENDOR_SYMBOL_OR_PATH_NOT_FOUND');
    if(status>=500)throw Error('ASX_CBA_VENDOR_REMOTE_5XX');
    throw Error('ASX_CBA_VENDOR_HTTP_OTHER');
  }
  if(response.url!==url.href)throw Error('ASX_CBA_VENDOR_REDIRECTED');
  const contentType=response.headers.get('content-type')||'';
  if(!/json|text\/plain/i.test(contentType))throw Error('ASX_CBA_VENDOR_UNEXPECTED_CONTENT_TYPE');
  const buf=Buffer.from(await response.arrayBuffer());
  if(buf.length<10)throw Error('ASX_CBA_VENDOR_EMPTY_OR_TOO_SHORT');
  if(buf.length>2_000_000)throw Error('ASX_CBA_VENDOR_RESPONSE_TOO_LARGE');
  return buf;
}
try{
  if(!eodConfigured){
    // Single-source verification is genuinely useful but never a PAPER
    // receipt pair. Do not skip testing Alpha just because EODHD is absent.
    report.providerCalls=1;
    const a=await readVendor(url1);
    const checked=assessOneGlobalAsxCbaAlphaEod({alphaRaw:a});
    report.status=checked.result;
    report.alphaIdentityMatched=checked.alphaExactNextSessionClose;
    report.secondIndependentPublisherReceived=false;
  }else{
    report.providerCalls=2;
    const [a,b]=await Promise.all([readVendor(url1),readVendor(url2)]);
    const checked=assessOneGlobalAsxCbaDualEod({
      alphaRaw:a,eodhdRaw:b,
    });
    report.status=checked.result;
    report.alphaIdentityMatched=checked.alphaIdentityMatched;
    report.eodhdExactDateMatched=checked.eodhdExactDateMatched;
    report.dualCloseWithinHalfPercent=checked.dualCloseWithinHalfPercent;
  }
}catch(error){
  // Never print provider URLs, response bodies or auth tokens.
  // Exact parser refusal codes have a fixed safe prefix and are useful
  // to distinguish an identity mismatch from a provider outage.
  report.status=classifyOneGlobalCbaVendorFailure(error);
}
outputSanitized();
