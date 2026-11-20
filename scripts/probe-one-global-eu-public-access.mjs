// Diagnostic of public EU delayed post-trade access only.
// This probe does not read any private journal, API keys, Blob, orders,
// owner-consent file, brokerage account, or PAPER signal.
import {
  fetchOneGlobalEuronextMilanFile,fetchOneGlobalCboeCeuxFile
} from '../lib/market/one-global-eu-delayed-eod.mjs';

const now=new Date();
const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
  timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'
}).formatToParts(now).map(p=>[p.type,p.value]));
const sessionDate=parts.year+'-'+parts.month+'-'+parts.day;
const permitted=new Set([
  'EU_DELAYED_EOD_TRANSPORT_UNAVAILABLE','EU_DELAYED_EOD_AUTH_OR_PLAN_DENIED',
  'EU_DELAYED_EOD_RATE_LIMIT','EU_DELAYED_EOD_HTTP_REJECTED',
  'EU_DELAYED_EOD_BODY_MISSING','EU_DELAYED_EOD_BODY_TOO_LARGE',
  'EU_DELAYED_EOD_BODY_EMPTY','EU_DELAYED_EOD_ZIP_SIZE_INVALID',
  'EU_DELAYED_EOD_ZIP_DIRECTORY_INVALID','EU_DELAYED_EOD_ZIP_CENTRAL_INVALID',
  'EU_DELAYED_EOD_ZIP_ENTRY_INVALID','EU_DELAYED_EOD_ZIP_LOCAL_INVALID',
  'EU_DELAYED_EOD_ZIP_LOCAL_RANGE_INVALID','EU_DELAYED_EOD_ZIP_INFLATE_INVALID',
  'EU_DELAYED_EOD_ZIP_INTEGRITY_MISMATCH','EU_DELAYED_EOD_CBOE_DISCOVERY_INVALID',
  'EU_DELAYED_EOD_CBOE_DISCOVERY_JSON_INVALID',
  'EU_DELAYED_EOD_CBOE_EXACT_MINUTE_LINK_MISSING_OR_AMBIGUOUS',
]);
function safeReason(error){
  const code=typeof error?.message==='string'?error.message:'';
  return permitted.has(code)?code:'EU_PUBLIC_SOURCE_UNCLASSIFIED_FAILURE';
}
async function check(name,fn){
  try {
    const data=await fn();
    // Redact data entirely; never log file URLs or vendor response bodies.
    return {source:name,status:'PUBLIC_OFFICIAL_FILE_AVAILABLE',
      bytesVerified:data.raw?.length>0,sessionDate};
  } catch(error) {
    return {source:name,status:'PUBLIC_OFFICIAL_FILE_UNAVAILABLE',
      safeReason:safeReason(error),sessionDate};
  }
}
const results=await Promise.all([
  check('EURONEXT_MILAN',()=>fetchOneGlobalEuronextMilanFile()),
  check('CBOE_CEUX',()=>fetchOneGlobalCboeCeuxFile({sessionDate}))
]);
console.log('FENICE_EU_PUBLIC_SOURCE_DIAGNOSTIC='+JSON.stringify({
  kind:'EU_PUBLIC_POST_TRADE_DIAGNOSTIC_ONLY',checkedAt:now.toISOString(),
  results,paperFillsCreated:0,signalsCreated:0,certifiedTrades:0,
  originalJournalAccess:false,brokerConnectivityAllowed:false,
  liveTradingAllowed:false
}));
// An unavailable exchange file remains unavailable. This script has no output
// that can ever be used as positive PAPER evidence or an approval.
if(results.some(x=>x.status!=='PUBLIC_OFFICIAL_FILE_AVAILABLE'))process.exitCode=2;
