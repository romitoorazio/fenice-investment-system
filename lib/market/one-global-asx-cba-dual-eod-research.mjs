/**
 * ONE GLOBAL — exact CBA ASX next-session EOD two-publisher research probe.
 *
 * The original private CBA SIGNAL references 12 Nov 2026; Fri 13 Nov is the
 * nominal immediately following regular session. This parser only checks
 * response identity, data shape, session and pair divergence. It does NOT
 * validate an ASX trading calendar, upstream independence, vendor publish
 * timestamps, licence/redistribution rights, official ECB FX or a PAPER FILL.
 *
 * Never persist or print payloads, prices, hashes or provider API keys.
 */
const reject=x=>{throw Error('ASX_CBA_RESEARCH_'+x);};
export const CBA_REFERENCE_SESSION='2026-11-12';
export const CBA_NEXT_REGULAR_SESSION='2026-11-13';
export const CBA_ALPHA_SYMBOL='CBA.AX';
export const CBA_EODHD_SYMBOL='CBA.AU';
const parse=(bytes)=>{
  if((typeof bytes!=='string'&&!Buffer.isBuffer(bytes))
    ||Buffer.byteLength(bytes)>2_000_000||Buffer.byteLength(bytes)<10)
    reject('VENDOR_PAYLOAD_SIZE_INVALID');
  try{
    const v=JSON.parse(Buffer.isBuffer(bytes)?bytes.toString('utf8'):bytes);
    if(!v||typeof v!=='object')reject('VENDOR_JSON_SCHEMA_INVALID');
    return v;
  }catch{reject('VENDOR_JSON_UNUSABLE');}
};
const n=x=>typeof x==='number'&&Number.isFinite(x)&&x>0?x:null;
function alphaExactNextSessionClose(alphaRaw){
  const alpha=parse(alphaRaw);
  const symbol=alpha?.['Meta Data']?.['2. Symbol'];
  if(symbol!==CBA_ALPHA_SYMBOL)
    reject('ALPHA_SYMBOL_IDENTITY_UNVERIFIED');
  const daily=alpha?.['Time Series (Daily)'];
  if(!daily||typeof daily!=='object'||Array.isArray(daily))
    reject('ALPHA_DAILY_SERIES_UNAVAILABLE');
  const aBar=daily[CBA_NEXT_REGULAR_SESSION];
  const aClose=typeof aBar?.['4. close']==='string'
    ?Number(aBar['4. close']):null;
  if(!n(aClose)||typeof aBar?.['4. close']!=='string')
    reject('ALPHA_EXACT_NEXT_SESSION_CLOSE_UNAVAILABLE');
  return aClose;
}
export function assessOneGlobalAsxCbaAlphaEod({alphaRaw}={}){
  alphaExactNextSessionClose(alphaRaw);
  return {
    symbol:'XASX:CBA',sessionDate:CBA_NEXT_REGULAR_SESSION,
    alphaPublisherResponseParsed:true,alphaExactNextSessionClose:true,
    secondIndependentPublisherReceived:false,publisherPublicationTimesProven:false,
    dataRightsIndependentlyReviewed:false,officialEcbFxAttached:false,
    originalPrivateJournalRead:false,canonicalEventCommitted:false,
    virtualPaperFillsCreated:0,certifiedTrades:0,phase9Credit:0,
    liveTradingAllowed:false,brokerConnectivityAllowed:false,
    result:'ALPHA_CBA_NEXT_SESSION_ROW_VALID_EODHD_KEY_REQUIRED',
  };
}
export function assessOneGlobalAsxCbaDualEod({alphaRaw,eodhdRaw}={}){
  const aClose=alphaExactNextSessionClose(alphaRaw);
  const eod=parse(eodhdRaw);
  if(!Array.isArray(eod))
    reject('EODHD_NOT_A_DATED_SERIES');
  const matched=eod.filter(q=>q&&typeof q==='object'
    &&q.date===CBA_NEXT_REGULAR_SESSION);
  if(matched.length!==1||!n(matched[0].close))
    reject('EODHD_EXACT_NEXT_SESSION_CLOSE_UNAVAILABLE');
  if(eod.some(x=>x&&x.date===CBA_NEXT_REGULAR_SESSION
    &&('symbol' in x)&&x.symbol!==CBA_EODHD_SYMBOL))
    reject('EODHD_SYMBOL_RESPONSE_MISMATCH');
  // Explicit full pair divergence; independent labels are NOT proof of
  // independently sourced exchange feeds.
  const eClose=matched[0].close,mid=(aClose+eClose)/2;
  if(Math.abs(aClose-eClose)/mid>.005)
    reject('DUAL_CLOSE_DIVERGENCE');
  return {
    mode:'ONE_GLOBAL_ASX_CBA_NEXT_SESSION_DUAL_EOD_RESEARCH',
    symbol:'XASX:CBA',referenceSessionDate:CBA_REFERENCE_SESSION,
    comparedSessionDate:CBA_NEXT_REGULAR_SESSION,
    alphaIdentityMatched:true,eodhdExactDateMatched:true,
    twoPublisherRowsParsed:true,dualCloseWithinHalfPercent:true,
    exactExchangeCalendarAttested:false,
    independentFeedProven:false,publisherPublicationTimesProven:false,
    dataRightsIndependentlyReviewed:false,
    officialEcbFxAttached:false,ownerPaperAuthorityAttached:false,
    originalPrivateJournalRead:false,canonicalEventCommitted:false,
    virtualPaperFillsCreated:0,certifiedTrades:0,phase9Credit:0,
    liveTradingAllowed:false,brokerConnectivityAllowed:false,
    result:'TWO_REAL_VENDOR_ROWS_RESEARCH_ONLY_NOT_SETTLEMENT_EVIDENCE',
  };
}

/**
 * Convert private vendor transport errors to *fixed*, publishable statuses.
 * Never output an exception's raw message: failed fetches may include the
 * API URL containing the personal token.
 */
export function classifyOneGlobalCbaVendorFailure(error){
  const reason=String(error?.message??'');
  if(/^ASX_CBA_RESEARCH_[A-Z0-9_]{4,100}$/.test(reason))return reason;
  if(/^ASX_CBA_VENDOR_[A-Z0-9_]{4,100}$/.test(reason))return reason;
  if(error?.name==='TimeoutError'||error?.name==='AbortError')
    return 'ASX_CBA_VENDOR_TIMEOUT';
  return 'ASX_CBA_VENDOR_NETWORK_OR_UNKNOWN';
}
