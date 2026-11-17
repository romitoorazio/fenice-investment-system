/**
 * Owner-only, explicit-review USA source mapping using verified original HTTP bytes.
 * Never creates provider licences, FILLs, new SIGNALs, account entitlement or orders.
 * A missing/unverifiable official original always fails closed.
 */
import {createHash} from 'node:crypto';
import {replayOneGlobalEodPaperLedger} from './one-global-eod-paper.mjs';
import {inspectOneGlobalSettlementOriginals,validateOneGlobalSettlementContext} from './one-global-cloud-settlement.mjs';
import {importOneGlobalPrivateInputs} from './one-global-private-input-intake.mjs';

const fail=x=>{throw Error('US_OWNER_MAPPING_'+x);};
// SHA-256 pinned against the full authentic Alpha Vantage original PDF,
// already reviewed and recorded by the existing technical-review module.
const PINNED_ALPHA_TERMS_PDF_SHA256='88ed3d22fe0f3624e76e53a210db3498b4a90712ab0d934356cc84b19ed1468a';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const SUPPORTED=new Set(['XNAS:AAPL','XNAS:MSFT','XNAS:TSLA']);
const TERMS=Object.freeze({
  alphaRights:'https://www.alphavantage.co/terms_of_service/',
  alphaOrigin:'https://www.alphavantage.co/stock_api_landing/',
  alpacaIex:'https://docs.alpaca.markets/us/docs/paper-trading',
  nasdaqCalendar:'https://www.nasdaqtrader.com/trader.aspx?id=calendar',
});
const SOURCES=[
  {providerId:'alpha-vantage',sourceFamily:'alpha-vantage-nasdaq-licensed',doc:'alphaOrigin',rights:'alphaRights'},
  {providerId:'alpaca-iex',sourceFamily:'alpaca-iex-single-venue',doc:'alpacaIex',rights:'alpacaIex'},
];
const CLOSED_2026=new Set([
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25',
  '2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
]);
const EARLY_2026=new Set(['2026-11-27','2026-12-24']);
const nextSession=date=>{
  const day=new Date(date+'T12:00:00.000Z');
  if(!Number.isFinite(day.getTime()))fail('REFERENCE_DATE_INVALID');
  for(let attempt=0;attempt<7;attempt++){
    day.setUTCDate(day.getUTCDate()+1);
    const target=day.toISOString().slice(0,10);
    if(!target.startsWith('2026-'))fail('OFFICIAL_CALENDAR_YEAR_NOT_REVIEWED');
    if(![0,6].includes(day.getUTCDay())&&!CLOSED_2026.has(target)&&!EARLY_2026.has(target))return target;
  }
  fail('OFFICIAL_NEXT_SESSION_NOT_VERIFIED');
};
const nyPart=instant=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
  timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
}).formatToParts(new Date(instant)).map(p=>[p.type,p.value]));
function nyInstant(day,hr,minute){
  const noon=Date.parse(day+'T12:00:00.000Z');
  for(let m=0;m<=12*60;m+=30){
    const date=new Date(noon+m*60000),p=nyPart(date);
    if(p.year+'-'+p.month+'-'+p.day===day&&Number(p.hour)===hr&&Number(p.minute)===minute)
      return date.toISOString();
  }
  fail('OFFICIAL_NY_TIMEZONE_NOT_RESOLVED');
}
function originalPending(ledger){
  const state=replayOneGlobalEodPaperLedger(ledger),open=new Set(state.pendingSignals);
  const matches=ledger.events.filter(e=>e.kind==='SIGNAL'&&open.has(e.key)&&SUPPORTED.has(e.key));
  if(!matches.length)fail('NO_SUPPORTED_PENDING_US_SIGNAL');
  if(matches.length!==1)fail('MULTIPLE_PENDING_US_REVIEW_REQUIRED');
  const signal=matches[0];
  if(signal.mic!=='XNAS'||signal.currency!=='USD'||!/^XNAS:(AAPL|MSFT|TSLA)$/.test(signal.key))
    fail('SIGNAL_IDENTITY_UNVERIFIED');
  return signal;
}
function readLedger(snapshot){
  if(typeof snapshot?.body!=='string'||Buffer.byteLength(snapshot.body)>1500000)
    fail('PRIVATE_LEDGER_REQUIRED');
  let ledger;try{ledger=JSON.parse(snapshot.body);}catch{fail('PRIVATE_LEDGER_INVALID');}
  replayOneGlobalEodPaperLedger(ledger);
  return ledger;
}
function readContext(snapshot,nowIso){
  if(typeof snapshot?.body!=='string'||Buffer.byteLength(snapshot.body)>500000
    ||typeof snapshot.etag!=='string'||!snapshot.etag)fail('EXISTING_PRIVATE_CONTEXT_REQUIRED');
  let context;try{context=JSON.parse(snapshot.body);}catch{fail('PRIVATE_CONTEXT_JSON_INVALID');}
  inspectOneGlobalSettlementOriginals({context,nowIso});
  return context;
}
export async function inspectOneGlobalUsOwnerMapping({storage,nowIso}={}){
  if(!iso(nowIso)||storage?.privateAccess!==true||storage.durable!==true
    ||storage.atomicCompareAndSwap!==true)fail('PRIVATE_OWNER_STORE_REQUIRED');
  const ledger=readLedger(await storage.read()),signal=originalPending(ledger);
  const snapshot=await storage.readSettlementContext(),context=readContext(snapshot,nowIso);
  const targetSessionDate=nextSession(signal.referenceSessionDate);
  const mapping=context.markets.find(m=>m?.key===signal.key&&m.mic==='XNAS'&&m.currency==='USD');
  return {
    state:mapping?'US_MAPPING_ALREADY_PRESENT_REVIEW_EXISTING':'US_MAPPING_OFFICIAL_DOCUMENT_REVIEW_AVAILABLE',
    signalKey:signal.key,referenceSessionDate:signal.referenceSessionDate,
    nextSessionDate:targetSessionDate,expectedEtag:snapshot.etag,
    officialTerms:{...TERMS},sourcePair:['alpha-vantage','alpaca-iex'],
    ownerMustReviewNonCommercialScope:true,notSIP:true,autoApprovesProviderRights:false,
    paperFillsCreated:0,liveTradingAllowed:false,brokerConnectivityAllowed:false
  };
}
async function boundedOfficial(key,fetcher,alphaTermsSha256=PINNED_ALPHA_TERMS_PDF_SHA256){
  const url=TERMS[key];if(!url)fail('OFFICIAL_URL_NOT_ALLOWLISTED');
  let response;
  try{response=await fetcher(url,{method:'GET',redirect:'error',cache:'no-store',
    signal:AbortSignal.timeout(10000),headers:{Accept:key==='alphaRights'?'application/pdf':'text/html'}});}
  catch{fail('OFFICIAL_ORIGINAL_UNREACHABLE');}
  const expectedType=key==='alphaRights'?/^application\/pdf(?:;|$)/i:/^text\/html(?:;|$)/i;
  if(!response?.ok||!expectedType.test(response.headers?.get('content-type')||''))
    fail('OFFICIAL_ORIGINAL_HTTP_OR_TYPE_REJECTED');
  const parts=[];let size=0,reader=response.body?.getReader();
  if(!reader)fail('OFFICIAL_ORIGINAL_BODY_MISSING');
  try{
    for(;;){const {value,done}=await reader.read();if(done)break;
      size+=value.length;if(size>500000){await reader.cancel();fail('OFFICIAL_ORIGINAL_TOO_LARGE');}
      parts.push(Buffer.from(value));}
  }finally{reader.releaseLock();}
  const raw=Buffer.concat(parts);
  if(raw.length<200)fail('OFFICIAL_ORIGINAL_EMPTY');
  if(key==='alphaRights'){
    if(raw.subarray(0,5).toString()!=='%PDF-'||sha(raw)!==alphaTermsSha256)
      fail('ALPHA_ORIGINAL_PDF_HASH_NOT_PREVIOUSLY_REVIEWED');
    return {key,url,raw,hash:sha(raw),contentType:'application/pdf'};
  }
  const html=raw.toString('utf8'),plain=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ');
  // Each expected source must be demonstrably the specified CURRENT official text.
  const facts={
    alphaOrigin:[/nasdaq/i,/licens/i],
    alpacaIex:[/Paper Only Account/i,/\bIEX\b/i,/market data/i],
    nasdaqCalendar:[/2026/i,/Thanksgiving/i,/November|Nov\b/i],
  };
  if(!facts[key].every(pattern=>pattern.test(plain+' '+html)))fail('OFFICIAL_POLICY_TEXT_NOT_CONFIRMED');
  return {key,url,raw,hash:sha(raw),contentType:'text/html'};
}
function capture(kind,body){
  const data=Buffer.from(JSON.stringify(body));
  return {kind,sha256:sha(data),bodyBase64:data.toString('base64')};
}
function dateReview(subject,time){
  return {...subject,reviewedByOwner:true,reviewedAt:time};
}
export async function connectOneGlobalUsOwnerMapping({storage,nowIso,input,fetcher=fetch,
  pinnedAlphaTermsSha256=PINNED_ALPHA_TERMS_PDF_SHA256}={}){
  if(storage?.privateAccess!==true||storage.durable!==true||storage.atomicCompareAndSwap!==true
    ||typeof storage.createSourceArtifact!=='function'||!iso(nowIso))
    fail('PRIVATE_ORIGINAL_STORE_REQUIRED');
  if(input?.confirm!=='I_REVIEWED_US_SOURCE_TERMS_AND_PRIVATE_PAPER_SCOPE'
    ||!SUPPORTED.has(input.key)||typeof input.expectedEtag!=='string'
    ||Object.keys(input).sort().join(',')!=='confirm,expectedEtag,key')
    fail('EXPLICIT_OWNER_REVIEW_REQUIRED');
  const ledger=readLedger(await storage.read()),signal=originalPending(ledger);
  if(signal.key!==input.key)fail('SIGNAL_CHANGED_RELOAD_REQUIRED');
  const snapshot=await storage.readSettlementContext();
  if(snapshot?.etag!==input.expectedEtag)fail('CONTEXT_CHANGED_RELOAD_REQUIRED');
  const context=readContext(snapshot,nowIso);
  if(context.markets.some(m=>m?.key===signal.key))fail('EXISTING_MAPPING_MUST_BE_PRESERVED');
  const sessionDate=nextSession(signal.referenceSessionDate);
  if(context.sessions.some(s=>s?.mic==='XNAS'&&s.sessionDate===sessionDate))
    fail('EXISTING_SESSION_REVIEW_REQUIRED');
  // Never create a retroactive owner approval or import after the strict 48h window.
  const sessionOpenedAt=nyInstant(sessionDate,9,30),sessionClosedAt=nyInstant(sessionDate,16,0);
  if(signal.recordedAt>=sessionOpenedAt||context.authority?.approvedAt>=sessionOpenedAt
    ||Date.parse(nowIso)>Date.parse(sessionClosedAt)+48*3600000)
    fail('FORWARD_SIGNAL_OR_EVIDENCE_WINDOW_INVALID');
  const keys=Object.keys(TERMS);
  const entries=await Promise.all(keys.map(k=>boundedOfficial(k,fetcher,pinnedAlphaTermsSha256)));
  const originals=Object.fromEntries(entries.map(o=>[o.key,o]));
  // Raw official HTML originals are archived separately, never copied into GitHub
  // or emitted in owner UI. Verify Blob write BEFORE committing context metadata.
  for(const original of entries){
    const stored=await storage.createSourceArtifact({
      hash:original.hash,body:original.raw,contentType:original.contentType});
    if(stored?.verified!==true)fail('OFFICIAL_RAW_ARCHIVE_NOT_VERIFIED');
  }
  const documents=[...context.documents],add=doc=>{
    if(!documents.some(d=>d.sha256===doc.sha256))documents.push(doc);
    return doc.sha256;
  };
  const rightsSha={},provenanceSha={};
  for(const s of SOURCES){
    const o=originals[s.rights],provenance=originals[s.doc];
    rightsSha[s.providerId]=add(capture('OFFICIAL_PROVIDER_USAGE_RIGHTS_CAPTURE',{
      kind:'ONE_GLOBAL_US_PUBLIC_POLICY_CAPTURE',providerId:s.providerId,
      officialUrl:o.url,originalHtmlSha256:o.hash,
      ownerScope:'PRIVATE_PERSONAL_PAPER_SIMULATION',
      ownerReviewedAt:nowIso,nonCommercialOnly:true,redistributionPermitted:false,
      rightsInferredFromApiAccess:false,accountScopeConfirmedByOwner:true,
      caveat:'Only original official policy and owner-confirmed personal account scope; not a vendor-issued bespoke licence.'
    }));
    provenanceSha[s.providerId]=add(capture('OFFICIAL_PROVIDER_UPSTREAM_PROVENANCE_CAPTURE',{
      kind:'ONE_GLOBAL_US_PUBLIC_UPSTREAM_CAPTURE',providerId:s.providerId,
      officialUrl:provenance.url,originalHtmlSha256:provenance.hash,
      key:signal.key,sourceFamily:s.sourceFamily,
      observationScope:s.providerId==='alpaca-iex'
        ?'IEX single venue historical daily; not consolidated SIP and not official Nasdaq closing auction'
        :'Alpha Vantage licensed Nasdaq daily publisher, separate HTTPS origin; upstream prints may overlap with IEX',
      independentlyVerifiedNonoverlappingPrints:false,
      ownerReviewedAt:nowIso
    }));
  }
  const symbol=signal.key.split(':')[1],validUntil='2026-12-31T23:59:59.000Z';
  const sources=SOURCES.map(s=>dateReview({
    providerId:s.providerId,key:signal.key,mic:'XNAS',currency:'USD',symbol,
    sourceFamily:s.sourceFamily,independenceEvidenceSha256:provenanceSha[s.providerId]
  },nowIso));
  const ownerReviewedRights=SOURCES.map(s=>dateReview({
    providerId:s.providerId,mic:'XNAS',currency:'USD',evidenceSha256:rightsSha[s.providerId],
    usageScope:'PRIVATE_PERSONAL_PAPER_SIMULATION',automatedUseAllowed:true,validUntil
  },nowIso));
  const calendar=originals.nasdaqCalendar;
  const evidenceSha256=add(capture('OFFICIAL_EXCHANGE_SESSION_CAPTURE',{
    kind:'ONE_GLOBAL_US_OFFICIAL_SESSION_CAPTURE',mic:'XNAS',
    sessionDate,sessionOpenedAt,sessionClosedAt,officialUrl:calendar.url,
    originalHtmlSha256:calendar.hash,
    holidayCalendarYear:2026,notListedAs2026ExchangeHoliday:true,
    officialRegularSessionTimeZone:'America/New_York',regularHours:'09:30-16:00',
    earlyClosingDatesExcluded:true,ownerReviewedAt:nowIso
  }));
  const updated={...context,documents,
    markets:[...context.markets,{key:signal.key,mic:'XNAS',currency:'USD',sources,ownerReviewedRights}],
    sessions:[...context.sessions,dateReview({
      mic:'XNAS',sessionDate,sessionOpenedAt,sessionClosedAt,evidenceSha256},nowIso)]};
  // The validator MUST either approve the original proof chain or reject solely
  // because the NEXT regular session has not yet finished. No other bypasses.
  try{validateOneGlobalSettlementContext({context:updated,signal,nowIso});}
  catch(e){
    if(e?.message!=='CLOUD_SETTLEMENT_NEXT_SESSION_NOT_COMPLETED')
      fail('ORIGINAL_SETTLEMENT_VALIDATOR_REJECTED');
  }
  const imported=await importOneGlobalPrivateInputs({storage,nowIso,input:{
    kind:'SETTLEMENT_CONTEXT',
    documentBase64:Buffer.from(JSON.stringify(updated)).toString('base64'),
    expectedEtag:snapshot.etag
  }});
  if(imported.imported!==true||imported.state!=='ORIGINAL_PRIVATE_INPUTS_IMPORTED')
    fail('PRIVATE_CONTEXT_IMPORT_NOT_CONFIRMED');
  return {state:'US_OWNER_REVIEWED_MAPPING_CONNECTED_PRIVATE',signalKey:signal.key,
    nextSessionDate:sessionDate,originalBytesArchived:true,
    originalJournalPreserved:true,paperFillsCreated:0,
    liveTradingAllowed:false,brokerConnectivityAllowed:false};
}
