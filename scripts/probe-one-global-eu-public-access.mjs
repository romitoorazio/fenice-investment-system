// Diagnostic of public EU delayed post-trade access only.
// This probe does not read any private journal, API keys, Blob, orders,
// owner-consent file, brokerage account, or PAPER signal.
import {
  fetchOneGlobalEuronextMilanFile,fetchOneGlobalCboeCeuxFile,
  buildOneGlobalEuDualVenueReport
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

async function euronextZipMetadataOnly(){
  const endpoint='https://marketdata.euronext.com/data-reporting-service/trades-file/download/EQUITIES/CURRENT_TRADING_DAY/MIL';
  const response=await fetch(endpoint,{redirect:'error',cache:'no-store',
    signal:AbortSignal.timeout(20000),headers:{Accept:'application/zip, application/octet-stream'}});
  if(!response.ok) return {fetchState:'OFFICIAL_HTTP_UNAVAILABLE',status:response.status};
  const reader=response.body?.getReader();
  if(!reader)return {fetchState:'OFFICIAL_BODY_MISSING'};
  let size=0;const parts=[];
  for(;;){
    const {value,done}=await reader.read();if(done)break;
    size+=value.length;
    if(size>8_000_000){await reader.cancel();return {fetchState:'OVERSIZED_ZIP'};}
    parts.push(Buffer.from(value));
  }
  const zip=Buffer.concat(parts);
  let eocd=-1;
  for(let i=zip.length-22;i>=Math.max(0,zip.length-65557);i--){
    if(zip.readUInt32LE(i)===0x06054b50){eocd=i;break;}
  }
  if(eocd<0)return {fetchState:'ZIP_DIRECTORY_NOT_FOUND',zipBytes:size};
  const entries=zip.readUInt16LE(eocd+10),offset=zip.readUInt32LE(eocd+16);
  const centralBytes=zip.readUInt32LE(eocd+12);
  let cursor=offset;const rows=[];
  for(let i=0;i<Math.min(entries,12);i++){
    if(cursor+46>zip.length||zip.readUInt32LE(cursor)!==0x02014b50)
      return {fetchState:'ZIP_CENTRAL_INVALID',zipBytes:size,entries};
    const fileNameLength=zip.readUInt16LE(cursor+28);
    const extraLength=zip.readUInt16LE(cursor+30),commentLength=zip.readUInt16LE(cursor+32);
    const filename=zip.subarray(cursor+46,cursor+46+fileNameLength).toString('utf8');
    rows.push({filename:/^[A-Za-z0-9._/-]{1,90}$/.test(filename)?filename:'UNSUPPORTED_FILENAME',
      method:zip.readUInt16LE(cursor+10),flags:zip.readUInt16LE(cursor+8),
      compressedBytes:zip.readUInt32LE(cursor+20),uncompressedBytes:zip.readUInt32LE(cursor+24)});
    cursor+=46+fileNameLength+extraLength+commentLength;
  }
  return {fetchState:'ZIP_DIRECTORY_OBSERVED',zipBytes:size,entries,centralBytes,rows};
}

if(results.every(x=>x.status==='PUBLIC_OFFICIAL_FILE_AVAILABLE')){
  const [euronext,cboe]=await Promise.all([
    fetchOneGlobalEuronextMilanFile(),
    fetchOneGlobalCboeCeuxFile({sessionDate})
  ]);
  const reports=[];
  for(const symbol of ['ENEL','BAMI']){
    try{
      const value=buildOneGlobalEuDualVenueReport({
        euronextRaw:euronext.raw,cboeRaw:cboe.raw,
        symbol,sessionDate,observedAt:now.toISOString()
      });
      reports.push({symbol,status:'EXACT_DUAL_VENUE_REPORT_VALID',
        coherentVenueCloses:value.closeDifferencePct<=0.5});
    }catch(error){
      const reason=String(error?.message||'');
      const safe=new Set([
        'EU_DELAYED_EOD_EURONEXT_HEADER_INVALID',
        'EU_DELAYED_EOD_EURONEXT_SESSION_INCOMPLETE',
        'EU_DELAYED_EOD_EURONEXT_AUCTION_PRICE_AMBIGUOUS',
        'EU_DELAYED_EOD_EURONEXT_ROW_SHAPE_INVALID',
        'EU_DELAYED_EOD_CBOE_EXACT_PRECLOSE_TRADE_MISSING',
        'EU_DELAYED_EOD_CBOE_ROW_SHAPE_INVALID',
      ]);
      reports.push({symbol,status:'DUAL_VENUE_REPORT_REJECTED',
        reason:safe.has(reason)?reason:'DUAL_VENUE_UNCLASSIFIED_REJECTION'});
    }
  }
  console.log('FENICE_EU_DUAL_VENUE_VALIDATION='+JSON.stringify({
    sessionDate,reports,signalsCreated:0,paperFillsCreated:0,
    liveTradingAllowed:false,originalJournalAccess:false
  }));
}

if(results[0].safeReason==='EU_DELAYED_EOD_ZIP_ENTRY_INVALID'){
  try{
    console.log('FENICE_EURONEXT_ZIP_METADATA='+JSON.stringify(await euronextZipMetadataOnly()));
  }catch{
    console.log('FENICE_EURONEXT_ZIP_METADATA='+JSON.stringify({fetchState:'ZIP_METADATA_DIAGNOSTIC_UNAVAILABLE'}));
  }
}
// An unavailable exchange file remains unavailable. This script has no output
// that can ever be used as positive PAPER evidence or an approval.
if(results.some(x=>x.status!=='PUBLIC_OFFICIAL_FILE_AVAILABLE'))process.exitCode=2;
