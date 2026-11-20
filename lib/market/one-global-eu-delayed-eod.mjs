/**
 * Euronext Milan + Cboe Europe delayed post-trade evidence.
 *
 * The first leg is the primary MTAA closing auction.  The second leg is the
 * last ordinary CEUX CLOB trade before Cboe Europe's own close.  They are two
 * independent venue observations, not two labels for the same vendor close.
 * Raw bytes remain private and are hash-bound to every receipt.
 */
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';

const fail=code=>{throw Error('EU_DELAYED_EOD_'+code);};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const day=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)
  &&new Date(x+'T00:00:00.000Z').toISOString().slice(0,10)===x;
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;

// The official 20-Nov Milan ZIP contains a 63,569,009-byte CSV, greater
// than the legacy 60 MB limit. Preserve one-entry ZIP, CRC, hash and venue
// rules; cap expansion at 70 MB AND 15x the compressed entry size.
export const MAX_ONE_GLOBAL_EURONEXT_CSV_BYTES=70_000_000;
export function oneGlobalEuronextZipExpansionSafe(compressed,uncompressed){
  return Number.isSafeInteger(compressed)&&compressed>=20&&compressed<=7_900_000
    &&Number.isSafeInteger(uncompressed)&&uncompressed>=100
    &&uncompressed<=MAX_ONE_GLOBAL_EURONEXT_CSV_BYTES
    &&uncompressed<=compressed*15;
}

export const ONE_GLOBAL_MILAN_INSTRUMENTS=Object.freeze({
  ENEL:Object.freeze({symbol:'ENEL',key:'XMIL:ENEL',mic:'XMIL',currency:'EUR',isin:'IT0003128367',primaryVenueMic:'MTAA'}),
  BAMI:Object.freeze({symbol:'BAMI',key:'XMIL:BAMI',mic:'XMIL',currency:'EUR',isin:'IT0005218380',primaryVenueMic:'MTAA'}),
});
export const ONE_GLOBAL_EU_RIGHTS_DOCUMENTS=Object.freeze({
  euronext:Object.freeze({providerId:'euronext-mifir',url:'https://www.euronext.com/sites/default/files/stld/terms_and_conditions_for_delayed_data.pdf',
    sha256:'feac1efaed4c90da3e4a7d72eeb48592581c06c98a36ae4bb3d0405de19c45a3'}),
  cboe:Object.freeze({providerId:'cboe-eu-mifir',url:'https://cdn.cboe.com/resources/participant_resources/Cboe_Europe_Data_Policy_August_2026.pdf',
    sha256:'f7b94db1c37c79cb9deb63dca855907ff0f30db08ce40bc20f6c093b1a59929a'}),
});
export const EURONEXT_TERMS_URL='https://www.euronext.com/sites/default/files/stld/terms_and_conditions_for_delayed_data.pdf';
export const CBOE_POLICY_URL='https://cdn.cboe.com/resources/participant_resources/Cboe_Europe_Data_Policy_August_2026.pdf';
export const EURONEXT_CALENDAR_URL='https://www.euronext.com/en/trading/trading-hours-holidays';
export const CBOE_TRANSPARENCY_URL='https://www.cboe.com/markets/eu/equities/transparency-data/';
export const CBOE_TRANSPARENCY_API_URL='https://www-api.cboe.com/europe/equities/transparency_data/get_file_map';
export const ONE_GLOBAL_MILAN_CLOSED_DATES_2026=Object.freeze([
  '2026-01-01','2026-04-03','2026-04-06','2026-05-01','2026-12-24','2026-12-25','2026-12-31',
]);
const MILAN_CLOSED_2026=new Set(ONE_GLOBAL_MILAN_CLOSED_DATES_2026);

const CSV_HEADER=['TradingDateTime','PublicationDateTime','MifidInstrumentID','MifidPrice','MifidQuantity',
  'MifidPriceNotation','MifidCurrency','MmtMarketMechanism','MmtNegotiationIndicator','MmtModificationIndicator',
  'MmtBenchMarkIndicator','MmtContributionToPrice','MmtAlgorithmicIndicator','MmtPublicationMode','Venue',
  'ThirdCountryTradingVenueExecution','TradeUniqueIdentifier','MissingPrice','MmtContingentTransactionIndicator','VenueOfPublication'];

function csvLine(line){
  const out=[];let value='',quoted=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){
      if(quoted&&line[i+1]==='"'){value+='"';i++;}
      else quoted=!quoted;
    }else if(c===','&&!quoted){out.push(value);value='';}
    else value+=c;
  }
  if(quoted)fail('CSV_UNCLOSED_QUOTE');
  out.push(value);return out;
}
const localFormatters=new Map();
function localParts(epoch,zone){
  if(!localFormatters.has(zone))localFormatters.set(zone,new Intl.DateTimeFormat('en-GB',{
    timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
  return Object.fromEntries(localFormatters.get(zone).formatToParts(new Date(epoch)).map(x=>[x.type,x.value]));
}
function localToUtc(sessionDate,zone,hour,minute,second=0){
  const noon=Date.parse(sessionDate+'T12:00:00.000Z');
  for(let delta=-14*60;delta<=14*60;delta++){
    const epoch=noon+delta*60000+second*1000;
    const p=localParts(epoch,zone);
    if(`${p.year}-${p.month}-${p.day}`===sessionDate&&Number(p.hour)===hour
      &&Number(p.minute)===minute&&Number(p.second)===second)return new Date(epoch).toISOString();
  }
  fail('TIMEZONE_CONVERSION');
}
export function oneGlobalMilanSession(sessionDate){
  if(!day(sessionDate))fail('SESSION_DATE_INVALID');
  return {sessionDate,
    sessionOpenedAt:localToUtc(sessionDate,'Europe/Rome',9,0),
    continuousEndedAt:localToUtc(sessionDate,'Europe/Rome',17,30),
    closingAuctionNominalAt:localToUtc(sessionDate,'Europe/Rome',17,35),
    sessionClosedAt:localToUtc(sessionDate,'Europe/Rome',17,35,30),
    cboeSessionClosedAt:localToUtc(sessionDate,'Europe/London',16,30)};
}
export function isOneGlobalMilanRegularSessionDate2026(sessionDate){
  if(!day(sessionDate)||!sessionDate.startsWith('2026-'))return false;
  const weekday=new Date(sessionDate+'T12:00:00.000Z').getUTCDay();
  return ![0,6].includes(weekday)&&!MILAN_CLOSED_2026.has(sessionDate);
}

let crcTable;
function crc32(bytes){
  crcTable??=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
  let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;
}
/** Single-entry, bounded ZIP reader; rejects encryption, traversal and bombs. */
export function extractOneGlobalEuronextCsv(zip){
  if(!Buffer.isBuffer(zip)||zip.length<100||zip.length>8_000_000)fail('ZIP_SIZE_INVALID');
  let eocd=-1;for(let i=zip.length-22;i>=Math.max(0,zip.length-65557);i--)if(zip.readUInt32LE(i)===0x06054b50){eocd=i;break;}
  if(eocd<0||zip.readUInt16LE(eocd+4)!==0||zip.readUInt16LE(eocd+6)!==0
    ||zip.readUInt16LE(eocd+8)!==1||zip.readUInt16LE(eocd+10)!==1)fail('ZIP_DIRECTORY_INVALID');
  const centralSize=zip.readUInt32LE(eocd+12),centralOffset=zip.readUInt32LE(eocd+16);
  if(centralOffset+centralSize>eocd||zip.readUInt32LE(centralOffset)!==0x02014b50)fail('ZIP_CENTRAL_INVALID');
  const flags=zip.readUInt16LE(centralOffset+8),method=zip.readUInt16LE(centralOffset+10),expectedCrc=zip.readUInt32LE(centralOffset+16);
  const compressed=zip.readUInt32LE(centralOffset+20),uncompressed=zip.readUInt32LE(centralOffset+24);
  const nameLength=zip.readUInt16LE(centralOffset+28),extraLength=zip.readUInt16LE(centralOffset+30),commentLength=zip.readUInt16LE(centralOffset+32);
  const localOffset=zip.readUInt32LE(centralOffset+42),name=zip.subarray(centralOffset+46,centralOffset+46+nameLength).toString('utf8');
  if(flags&1||method!==8||name!=='Trades_Equities.csv'||compressed<20||compressed>7_900_000
    ||!oneGlobalEuronextZipExpansionSafe(compressed,uncompressed)
    ||46+nameLength+extraLength+commentLength>centralSize)fail('ZIP_ENTRY_INVALID');
  if(localOffset+30>zip.length||zip.readUInt32LE(localOffset)!==0x04034b50
    ||zip.readUInt16LE(localOffset+8)!==method)fail('ZIP_LOCAL_INVALID');
  const localNameLength=zip.readUInt16LE(localOffset+26),localExtraLength=zip.readUInt16LE(localOffset+28);
  const localName=zip.subarray(localOffset+30,localOffset+30+localNameLength).toString('utf8');
  const start=localOffset+30+localNameLength+localExtraLength,end=start+compressed;
  if(localName!==name||end>zip.length)fail('ZIP_LOCAL_RANGE_INVALID');
  let csv;try{csv=inflateRawSync(zip.subarray(start,end),{maxOutputLength:MAX_ONE_GLOBAL_EURONEXT_CSV_BYTES});}catch{fail('ZIP_INFLATE_INVALID');}
  if(csv.length!==uncompressed||crc32(csv)!==expectedCrc)fail('ZIP_INTEGRITY_MISMATCH');
  return csv;
}

function microIso(value){
  const m=/^(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d:\d\d)\.(\d{3})\d{0,3}Z?$/.exec(value||'');
  if(!m)fail('TRADE_TIMESTAMP_INVALID');
  const out=`${m[1]}T${m[2]}.${m[3]}Z`;if(!iso(out))fail('TRADE_TIMESTAMP_INVALID');return out;
}
function exactNumber(value){if(!/^\d+(?:\.\d+)?$/.test(value||''))fail('NUMERIC_FIELD_INVALID');const n=Number(value);if(!positive(n))fail('NUMERIC_FIELD_INVALID');return n;}

export function parseOneGlobalEuronextMilan({raw,isin,sessionDate}={}){
  if(!/^IT\d{10}$/.test(isin||'')||!day(sessionDate))fail('EURONEXT_IDENTITY_INVALID');
  const bytes=raw?.subarray?.(0,4).equals?.(Buffer.from('PK\x03\x04'))?extractOneGlobalEuronextCsv(raw):raw;
  if(!Buffer.isBuffer(bytes)||bytes.length<100||bytes.length>MAX_ONE_GLOBAL_EURONEXT_CSV_BYTES)fail('EURONEXT_RAW_INVALID');
  const text=bytes.toString('utf8');if(!Buffer.from(text).equals(bytes))fail('EURONEXT_UTF8_INVALID');
  const firstEnd=text.indexOf('\n'),headerEnd=text.indexOf('\n',firstEnd+1);
  if(firstEnd<0||headerEnd<0||!text.slice(0,firstEnd).includes('Euronext N.V.')
    ||text.slice(firstEnd+1,headerEnd).replace(/\r$/,'')!==CSV_HEADER.join(','))fail('EURONEXT_HEADER_INVALID');
  const bounds=oneGlobalMilanSession(sessionDate),open=Date.parse(bounds.sessionOpenedAt),continuousEnd=Date.parse(bounds.continuousEndedAt);
  const auctionStart=Date.parse(bounds.closingAuctionNominalAt),auctionEnd=Date.parse(bounds.sessionClosedAt);
  let cursor=headerEnd+1,opening=null,regularLast=null,sum=0,volume=0,regularTrades=0;const auction=[];
  while(cursor<text.length){const next=text.indexOf('\n',cursor),end=next<0?text.length:next;const line=text.slice(cursor,end).replace(/\r$/,'');cursor=end+1;
    if(!line.includes(isin))continue;const f=csvLine(line);if(f.length!==CSV_HEADER.length)fail('EURONEXT_ROW_SHAPE_INVALID');
    if(f[2]!==isin||f[5]!=='MONE'||f[6]!=='EUR'||f[7]!=='1'||f[8]!=='-'||f[9]!=='-'
      ||f[14]!=='MTAA'||f[17]!==''||f[19]!=='MTAA')continue;
    const tradeAt=microIso(f[0]),publishedAt=microIso(f[1]),time=Date.parse(tradeAt),price=exactNumber(f[3]),quantity=exactNumber(f[4]);
    if(!f[16]||Date.parse(publishedAt)<time)fail('EURONEXT_PROVENANCE_INVALID');
    const row={tradeAt,marketPublishedAt:publishedAt,price,quantity,tradeId:f[16]};
    if(time>=open&&time<continuousEnd){opening??=row;regularLast=row;sum+=price*quantity;volume+=quantity;regularTrades++;}
    if(time>=auctionStart&&time<=auctionEnd)auction.push(row);
  }
  if(!opening||!regularLast||regularTrades<10||volume<=0||auction.length<1)fail('EURONEXT_SESSION_INCOMPLETE');
  const prices=new Set(auction.map(x=>x.price.toFixed(7)));if(prices.size!==1)fail('EURONEXT_AUCTION_PRICE_AMBIGUOUS');
  const last=auction.reduce((a,b)=>Date.parse(b.tradeAt)>Date.parse(a.tradeAt)?b:a);
  return {providerId:'euronext-mifir',sourceFamily:'euronext-mtaa-primary',observedVenueMic:'MTAA',
    priceSemantics:'PRIMARY_CLOSING_AUCTION',isin,sessionDate,open:opening.price,
    continuousLast:regularLast.price,vwap:sum/volume,continuousVolume:volume,continuousTrades:regularTrades,
    close:last.price,tradeAt:last.tradeAt,marketPublishedAt:last.marketPublishedAt,auctionExecutions:auction.length,
    sourceSessionClosedAt:bounds.sessionClosedAt};
}

export function parseOneGlobalCboeCeux({raw,isin,sessionDate}={}){
  if(!Buffer.isBuffer(raw)||raw.length<20||raw.length>4_000_000||!/^IT\d{10}$/.test(isin||'')||!day(sessionDate))fail('CBOE_RAW_INVALID');
  const text=raw.toString('utf8');if(!Buffer.from(text).equals(raw))fail('CBOE_UTF8_INVALID');
  const bounds=oneGlobalMilanSession(sessionDate),close=Date.parse(bounds.cboeSessionClosedAt),minuteStart=close-60000;
  let last=null,count=0,cursor=0;
  while(cursor<text.length){const next=text.indexOf('\n',cursor),end=next<0?text.length:next;const line=text.slice(cursor,end).replace(/\r$/,'');cursor=end+1;if(!line.includes(isin))continue;
    const f=csvLine(line);if(f.length!==12)fail('CBOE_ROW_SHAPE_INVALID');
    if(f[1]!==isin||f[3]!=='EUR'||f[4]!=='MONE'||f[6]!=='CEUX'||f[7]!=='CLOB'||f[9]!=='CEUX'||f[11]!=='')continue;
    const tradeAt=microIso(f[0]),marketPublishedAt=microIso(f[8]),time=Date.parse(tradeAt),price=exactNumber(f[2]),quantity=exactNumber(f[5]);
    if(time<minuteStart||time>=close||Date.parse(marketPublishedAt)<time||!/^\w{6,20}$/.test(f[10]))continue;
    const row={price,quantity,tradeAt,marketPublishedAt,tradeId:f[10]};count++;if(!last||time>=Date.parse(last.tradeAt))last=row;
  }
  if(!last)fail('CBOE_EXACT_PRECLOSE_TRADE_MISSING');
  return {providerId:'cboe-eu-mifir',sourceFamily:'cboe-ceux-orderbook',observedVenueMic:'CEUX',
    priceSemantics:'INDEPENDENT_VENUE_LAST_REGULAR_TRADE',isin,sessionDate,close:last.price,
    tradeAt:last.tradeAt,marketPublishedAt:last.marketPublishedAt,quantity:last.quantity,eligibleTrades:count,
    sourceSessionClosedAt:bounds.cboeSessionClosedAt};
}

export function buildOneGlobalEuDualVenueReport({euronextRaw,cboeRaw,symbol,sessionDate,observedAt}={}){
  const instrument=ONE_GLOBAL_MILAN_INSTRUMENTS[symbol];if(!instrument||!iso(observedAt))fail('REPORT_INPUT_INVALID');
  const primary=parseOneGlobalEuronextMilan({raw:euronextRaw,isin:instrument.isin,sessionDate});
  const secondary=parseOneGlobalCboeCeux({raw:cboeRaw,isin:instrument.isin,sessionDate});
  const midpoint=(primary.close+secondary.close)/2,differencePct=Math.abs(primary.close-secondary.close)/midpoint*100;
  const uptrend=primary.close>primary.open&&primary.close>=primary.vwap*1.001&&primary.continuousLast>=primary.vwap;
  return {mode:'ONE_GLOBAL_EU_DUAL_VENUE_EOD_RESEARCH_ONLY',symbol,key:instrument.key,mic:'XMIL',currency:'EUR',isin:instrument.isin,
    sessionDate,observedAt,primary,secondary,closeDifferencePct:differencePct,
    researchIndicator:uptrend?'UPTREND_RESEARCH_ONLY':'NO_UPTREND',paperSettlementEligible:false,
    certifiedVirtualFills:0,strategyPerformanceCertified:false,phase9Credit:0,
    brokerConnectivityAllowed:false,liveTradingAllowed:false,
    rawEvidence:{euronextSha256:sha(euronextRaw),cboeSha256:sha(cboeRaw)}};
}

async function bounded(url,{fetcher=fetch,maxBytes,accept}){
  let response;try{response=await fetcher(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{Accept:accept}});}catch{fail('TRANSPORT_UNAVAILABLE');}
  if(!response?.ok){if([401,403].includes(response?.status))fail('AUTH_OR_PLAN_DENIED');if(response?.status===429)fail('RATE_LIMIT');fail('HTTP_REJECTED');}
  const reader=response.body?.getReader();if(!reader)fail('BODY_MISSING');let size=0;const chunks=[];
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();fail('BODY_TOO_LARGE');}chunks.push(Buffer.from(value));}}
  finally{try{reader.releaseLock()}catch{}}
  if(size<20)fail('BODY_EMPTY');return Buffer.concat(chunks);
}
export async function fetchOneGlobalEuronextMilanFile({tradingDay='CURRENT_TRADING_DAY',fetcher=fetch}={}){
  if(!['CURRENT_TRADING_DAY','PREVIOUS_TRADING_DAY'].includes(tradingDay))fail('EURONEXT_DAY_SELECTOR_INVALID');
  const url=`https://marketdata.euronext.com/data-reporting-service/trades-file/download/EQUITIES/${tradingDay}/MIL`;
  const raw=await bounded(url,{fetcher,maxBytes:8_000_000,accept:'application/zip, application/octet-stream'});
  extractOneGlobalEuronextCsv(raw);return {raw,url};
}
export function discoverOneGlobalCboeCeuxMinute({apiRaw,sessionDate}={}){
  if(!Buffer.isBuffer(apiRaw)||apiRaw.length<20||apiRaw.length>1_000_000||!day(sessionDate))fail('CBOE_DISCOVERY_INVALID');
  const bounds=oneGlobalMilanSession(sessionDate),minute=new Date(Date.parse(bounds.cboeSessionClosedAt)-60000).toISOString().slice(11,16).replace(':','');
  const filename=`eqt_trade_CEUX_${sessionDate.replaceAll('-','')}_${minute}.csv`;
  let data;try{data=JSON.parse(apiRaw.toString('utf8'));}catch{fail('CBOE_DISCOVERY_JSON_INVALID');}
  if(!data||typeof data!=='object'||!Array.isArray(data.minute)||data.minute.length>800
    ||data.daily!==undefined&&!Array.isArray(data.daily))fail('CBOE_DISCOVERY_JSON_INVALID');
  const expected=new RegExp(`^https://cdn\\.cboe\\.com/data/europe/equities/delayed_data/eqt_trade_CEUX/[a-f0-9]{10}/minute/${filename.replaceAll('.','\\.')}$`);
  const matches=data.minute.filter(x=>x?.filename===filename&&typeof x.serveUrl==='string'&&expected.test(x.serveUrl)).map(x=>x.serveUrl);
  const unique=[...new Set(matches)];if(unique.length!==1||matches.length!==1)fail('CBOE_EXACT_MINUTE_LINK_MISSING_OR_AMBIGUOUS');return unique[0];
}
export async function fetchOneGlobalCboeCeuxFile({sessionDate,fetcher=fetch}={}){
  if(!day(sessionDate))fail('SESSION_DATE_INVALID');
  const discoveryUrl=new URL(CBOE_TRANSPARENCY_API_URL);
  discoveryUrl.search=new URLSearchParams({category:'equities',venue:'dxe',trade_type:'trade',date:sessionDate});
  const discoveryRaw=await bounded(discoveryUrl,{fetcher,maxBytes:1_000_000,accept:'application/json'});
  const url=discoverOneGlobalCboeCeuxMinute({apiRaw:discoveryRaw,sessionDate});
  const raw=await bounded(url,{fetcher,maxBytes:4_000_000,accept:'text/csv, text/plain'});
  return {raw,discoveryRaw,discoveryUrl:discoveryUrl.toString(),url};
}
export async function fetchOneGlobalEuRightsOriginals({fetcher=fetch}={}){
  const [euronext,cboe,calendar]=await Promise.all([
    bounded(EURONEXT_TERMS_URL,{fetcher,maxBytes:1_000_000,accept:'application/pdf'}),
    bounded(CBOE_POLICY_URL,{fetcher,maxBytes:2_000_000,accept:'application/pdf'}),
    bounded(EURONEXT_CALENDAR_URL,{fetcher,maxBytes:3_000_000,accept:'text/html'}),
  ]);
  if(sha(euronext)!==ONE_GLOBAL_EU_RIGHTS_DOCUMENTS.euronext.sha256||sha(cboe)!==ONE_GLOBAL_EU_RIGHTS_DOCUMENTS.cboe.sha256)fail('RIGHTS_DOCUMENT_REVISION_UNREVIEWED');
  const calendarText=calendar.toString('utf8');
  if(!calendarText.includes('Calendar of business days 2026')||!calendarText.includes('open Monday to Friday throughout 2026')
    ||!calendarText.includes('Milan'))fail('CALENDAR_DOCUMENT_UNREVIEWED');
  return {euronext,cboe,calendar,calendarSha256:sha(calendar)};
}

export function oneGlobalEuReceipt({source,signal,sessionDate,raw,observedAt}){
  if(!iso(observedAt)||source?.symbol===undefined)fail('RECEIPT_INPUT_INVALID');
  const parsed=source.providerId==='euronext-mifir'
    ?parseOneGlobalEuronextMilan({raw,isin:source.symbol,sessionDate})
    :source.providerId==='cboe-eu-mifir'?parseOneGlobalCboeCeux({raw,isin:source.symbol,sessionDate}):fail('PROVIDER_UNSUPPORTED');
  return {providerId:source.providerId,sourceFamily:source.sourceFamily,key:signal.key,mic:signal.mic,currency:signal.currency,
    sessionDate,close:parsed.close,payloadSha256:sha(raw),publishedAt:observedAt,observedAt,
    marketPublishedAt:parsed.marketPublishedAt,tradeAt:parsed.tradeAt,priceSemantics:parsed.priceSemantics,
    observedVenueMic:parsed.observedVenueMic,sourceSessionClosedAt:parsed.sourceSessionClosedAt,
    timestampMeaning:'FIRST_OBSERVED_AT_HTTPS_FETCH_NOT_VENDOR_RELEASE',
    transport:source.providerId==='euronext-mifir'?'FIXED_OFFICIAL_HTTPS_NO_REDIRECT':'OFFICIAL_HTTPS_DISCOVERY_PINNED_CDN',
    simulatedOrSynthetic:false};
}
