/** Owner-only, read-only audit of the FIRST original FILL. Never certifies LIVE.
 * Reads archived originals and reparses their bytes. No price-provider calls,
 * imports, context refreshes, CAS writes, cancellations or journal repairs.
 */
import {createHash} from 'node:crypto';
import {replayOneGlobalEodPaperLedger,settleOneGlobalEodSignal} from './one-global-eod-paper.mjs';
import {inspectOneGlobalSettlementOriginals,validateOneGlobalSettlementContext} from './one-global-cloud-settlement.mjs';
import {buildOneGlobalEuDualVenueReport,oneGlobalEuReceipt,ONE_GLOBAL_MILAN_INSTRUMENTS,
  ONE_GLOBAL_EU_RIGHTS_DOCUMENTS,oneGlobalMilanSession,discoverOneGlobalCboeCeuxMinute} from '../market/one-global-eu-delayed-eod.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
const digest=x=>sha(JSON.stringify(x));
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const ROOT='fenice/one-global/private-eod/';
const flags={journalMutationAllowed:false,paperFillsCreated:0,certifiedTrades:0,
  phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false};
class AuditError extends Error{
  constructor(code,missing=false,path=null){super(code);this.code=code;this.missing=missing;this.path=path;}
}
const invalid=code=>{throw new AuditError(code);};
const missing=(code,path=null)=>{throw new AuditError(code,true,path);};
function object(bytes,label){
  if(!Buffer.isBuffer(bytes)||bytes.length>1_500_000)invalid(label+'_SIZE_INVALID');
  const text=bytes.toString('utf8');
  if(!Buffer.from(text).equals(bytes))invalid(label+'_UTF8_INVALID');
  try{const parsed=JSON.parse(text);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))return parsed;}catch{}
  invalid(label+'_JSON_INVALID');
}
function engineCheck(fn){
  try{return fn();}catch(e){
    const code=/^(?:EOD_PAPER|CLOUD_SETTLEMENT|EU_DELAYED_EOD)_[A-Z0-9_]{3,120}$/.test(e?.message||'')?e.message:'ORIGINAL_ENGINE_REPLAY_REJECTED';
    invalid(code);
  }
}
function timestamp(x){
  const value=x instanceof Date?x.toISOString():x;
  return typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
}

// policyPins is injectable for isolated SYNTHETIC tests; the HTTP transport
// always uses the implementation's pinned official policies, never request data.
export async function auditOneGlobalFirstPrivateFill({storage,nowIso=new Date().toISOString(),policyPins=ONE_GLOBAL_EU_RIGHTS_DOCUMENTS}={}){
  const result={mode:'ONE_GLOBAL_FIRST_FILL_READ_ONLY_FORENSIC_AUDIT',auditedAt:nowIso,
    state:'FILL_NOT_YET_VERIFIABLE',...flags,checks:[],missingEvidence:[],defects:[]};
  const check=(name,extra={})=>result.checks.push({name,verified:true,...extra});
  try{
    if(storage?.privateAccess!==true||storage.durable!==true||typeof storage.read!=='function'
      ||typeof storage.readResearchObservation!=='function'||typeof storage.readSourceArtifact!=='function')
      missing('PRIVATE_READ_ONLY_EVIDENCE_ACCESS_REQUIRED');
    const snapshot=await storage.read();
    if(typeof snapshot?.body!=='string')missing('ORIGINAL_JOURNAL_REQUIRED',ROOT+'original-ledger.json');
    const ledger=object(Buffer.from(snapshot.body),'JOURNAL');
    const replay=engineCheck(()=>replayOneGlobalEodPaperLedger(ledger));
    result.journal={eventCount:ledger.events.length,virtualBuyCount:replay.virtualBuys,
      virtualSellCount:replay.virtualSells,pendingSignalCount:replay.pendingSignals.length,
      lastHash:ledger.lastHash,bodySha256:sha(snapshot.body)};
    check('ORIGINAL_HASH_CHAIN_AND_ACCOUNT_REPLAY');
    const fill=ledger.events.find(e=>e.kind==='FILL');
    if(!fill)return {...result,state:'NO_ORIGINAL_FILL'};
    const signal=ledger.events.find(e=>e.kind==='SIGNAL'&&e.hash===fill.signalHash);
    if(!signal)invalid('ORIGINAL_SIGNAL_MISSING');
    result.identity={key:fill.key,mic:fill.mic,currency:fill.currency,side:fill.side,
      signalRecordedAt:signal.recordedAt,referenceSessionDate:signal.referenceSessionDate,
      executionSessionDate:fill.sessionDate,sessionOpenedAt:fill.sessionOpenedAt,
      sessionClosedAt:fill.sessionClosedAt,fillRecordedAt:fill.recordedAt,
      signalHash:signal.hash,fillHash:fill.hash,sequence:fill.seq};
    const cache=new Map();
    async function evidence(hash,raw=false){
      if(!validHash(hash))invalid('EVIDENCE_REFERENCE_HASH_INVALID');
      const path=ROOT+'observations/'+(raw?'raw/'+hash:hash+'.json'),id=(raw?'raw:':'json:')+hash;
      if(cache.has(id))return cache.get(id);
      let item;try{item=await (raw?storage.readSourceArtifact(hash):storage.readResearchObservation(hash));}
      catch(e){
        // Retain a safe failure classification for the owner/attested Actions
        // path. Do not expose raw provider errors, URL, ETag or blob hash.
        if(e?.message==='CLOUD_BLOB_FORENSIC_RAW_HASH_MISMATCH')
          invalid('ARCHIVED_RAW_BYTES_HASH_MISMATCH');
        if(e?.message==='CLOUD_BLOB_FORENSIC_VERSION_METADATA_REQUIRED')
          missing('PRIVATE_EVIDENCE_ORIGIN_METADATA_REQUIRED',path);
        if(e?.message==='CLOUD_BLOB_FORENSIC_VERSION_METADATA_INVALID')
          missing('PRIVATE_EVIDENCE_ORIGIN_METADATA_INVALID',path);
        if(e?.message==='CLOUD_BLOB_FORENSIC_EVIDENCE_READ_INVALID')
          missing('PRIVATE_EVIDENCE_ORIGINAL_READ_INVALID',path);
        missing('PRIVATE_EVIDENCE_READ_UNAVAILABLE',path);
      }
      if(!item)missing('PRIVATE_EVIDENCE_OBJECT_MISSING',path);
      if(!Buffer.isBuffer(item.body)||item.body.length>(raw?8_000_000:1_500_000))invalid('EVIDENCE_BYTES_INVALID');
      if(raw&&sha(item.body)!==hash)invalid('ARCHIVED_RAW_BYTES_HASH_MISMATCH');
      const value={...item,path};cache.set(id,value);return value;
    }
    const archived=await evidence(fill.settlementEvidenceArchiveSha256);
    const observation=object(archived.body,'SETTLEMENT_ARCHIVE');
    if(observation.kind!=='ONE_GLOBAL_PRIVATE_SETTLEMENT_SOURCE_OBSERVATION'
      ||digest(observation)!==fill.settlementEvidenceArchiveSha256||observation.signalHash!==signal.hash)
      invalid('SETTLEMENT_ARCHIVE_HASH_OR_SIGNAL_MISMATCH');
    if(!eq(observation.marketEvidence?.providerReceipts,fill.providerReceipts)
      ||observation.marketEvidence.sessionDate!==fill.sessionDate
      ||observation.marketEvidence.sessionOpenedAt!==fill.sessionOpenedAt
      ||observation.marketEvidence.sessionClosedAt!==fill.sessionClosedAt)
      invalid('ORIGINAL_RECEIPT_JOURNAL_MISMATCH');
    check('ORIGINAL_SETTLEMENT_ARCHIVE_AND_RECEIPTS_BOUND_TO_FILL');
    const context=observation.context;
    if(sha(JSON.stringify(context,null,2)+'\n')!==observation.contextSha256)
      invalid('ORIGINAL_CONTEXT_SERIALIZED_HASH_MISMATCH');
    const originals=engineCheck(()=>inspectOneGlobalSettlementOriginals({context,nowIso:fill.recordedAt}));
    const inputs=engineCheck(()=>validateOneGlobalSettlementContext({context,signal,nowIso:fill.recordedAt}));
    if(digest(inputs.authority)!==fill.authoritySnapshotHash
      ||!eq(inputs.market.ownerReviewedRights.filter(r=>fill.providerReceipts.some(q=>q.providerId===r.providerId)),fill.ownerReviewedRights))
      invalid('ORIGINAL_AUTHORITY_OR_RIGHTS_SNAPSHOT_MISMATCH');
    check('ORIGINAL_DOCUMENT_BYTES_CONSENT_RIGHTS_MAPPING_AND_EXACT_SESSION',{documentCount:originals.documents.size});
    // This first implementation deliberately qualifies only the actually wired
    // Milan dual-venue method. Other markets are NEVER claimed by inference.
    const instrument=Object.values(ONE_GLOBAL_MILAN_INSTRUMENTS).find(x=>x.key===fill.key);
    if(!instrument||fill.mic!=='XMIL'||fill.currency!=='EUR')missing('FIRST_FILL_MARKET_FORENSIC_ADAPTER_NOT_REVIEWED');
    Object.assign(result.identity,{title:instrument.symbol==='BAMI'?'Banco BPM':'Enel',ticker:instrument.symbol,
      isin:instrument.isin,primaryVenueMic:instrument.primaryVenueMic,validationVenueMic:'CEUX'});
    const bounds=oneGlobalMilanSession(fill.sessionDate);
    if(fill.sessionOpenedAt!==bounds.sessionOpenedAt||fill.sessionClosedAt!==bounds.sessionClosedAt)
      invalid('EXACT_MILAN_SESSION_BOUNDS_MISMATCH');
    if(!Array.isArray(observation.providerRaw)||observation.providerRaw.length>10)invalid('ARCHIVED_PROVIDER_RAW_REFERENCES_INVALID');
    const parsedSources=[];
    for(const receipt of fill.providerReceipts){
      const source=inputs.market.sources.find(s=>s.providerId===receipt.providerId);
      if(source?.symbol!==instrument.isin)invalid('SOURCE_ISIN_MAPPING_MISMATCH');
      const references=observation.providerRaw.filter(x=>x.providerId===receipt.providerId&&!x.supportingKind);
      if(references.length!==1||references[0].rawArtifactSha256!==receipt.payloadSha256)
        invalid('ARCHIVED_PROVIDER_RAW_REFERENCE_MISMATCH');
      const raw=await evidence(receipt.payloadSha256,true);
      const rebuilt=engineCheck(()=>oneGlobalEuReceipt({source,signal,sessionDate:fill.sessionDate,
        raw:raw.body,observedAt:receipt.observedAt}));
      if(!eq(rebuilt,receipt))invalid('REPARSED_ORIGINAL_RECEIPT_MISMATCH');
      parsedSources.push({providerId:receipt.providerId,sourceFamily:receipt.sourceFamily,
        observedVenueMic:receipt.observedVenueMic,priceSemantics:receipt.priceSemantics,
        close:receipt.close,tradeAt:receipt.tradeAt,marketPublishedAt:receipt.marketPublishedAt,
        observedAt:receipt.observedAt,payloadSha256:receipt.payloadSha256});
      const provenance=originals.documents.get(source.independenceEvidenceSha256);
      const p=object(provenance.bytes,'UPSTREAM_PROVENANCE');
      if(p.providerId!==source.providerId||p.instrumentKey!==instrument.key||p.isin!==instrument.isin
        ||p.listingMic!=='XMIL'||p.observedVenueMic!==receipt.observedVenueMic
        ||p.sourceFamily!==source.sourceFamily||p.independentTransportAndVenue!==true)
        invalid('ORIGINAL_VENUE_PROVENANCE_MISMATCH');
      const right=fill.ownerReviewedRights.find(r=>r.providerId===receipt.providerId);
      const rights=object(originals.documents.get(right.evidenceSha256).bytes,'RIGHTS_CAPTURE');
      const pinned=receipt.providerId==='euronext-mifir'?policyPins.euronext:policyPins.cboe;
      if(rights.providerId!==source.providerId||rights.originalDocumentSha256!==pinned.sha256
        ||rights.officialUrl!==pinned.url||rights.usageScope!=='PRIVATE_PERSONAL_PAPER_SIMULATION'
        ||rights.automatedInternalAnalysis!==true||rights.distributionAllowedByThisReview!==false)
        invalid('PINNED_ORIGINAL_USAGE_POLICY_MISMATCH');
      await evidence(pinned.sha256,true);
    }
    const discovery=observation.providerRaw.filter(x=>x.providerId==='cboe-eu-mifir'&&x.supportingKind==='CBOE_OFFICIAL_DISCOVERY_JSON');
    if(discovery.length!==1)missing('ORIGINAL_CBOE_FILE_DISCOVERY_REQUIRED');
    const discovered=await evidence(discovery[0].rawArtifactSha256,true);
    engineCheck(()=>discoverOneGlobalCboeCeuxMinute({apiRaw:discovered.body,sessionDate:fill.sessionDate}));
    const calendar=object(originals.documents.get(inputs.session.evidenceSha256).bytes,'EXCHANGE_CALENDAR_CAPTURE');
    const calendarBytes=await evidence(calendar.calendarArtifactSha256,true);
    if(!calendarBytes.body.toString('utf8').includes('Calendar of business days 2026')
      ||!eq(calendar.bounds,bounds)||calendar.mic!=='XMIL'||calendar.sessionDate!==fill.sessionDate)
      invalid('ORIGINAL_EXCHANGE_CALENDAR_CAPTURE_MISMATCH');
    result.sources=parsedSources;
    check('BOTH_ORIGINAL_VENUE_FILES_REPARSED_EXACTLY');
    check('ARCHIVED_OFFICIAL_USAGE_POLICIES_CALENDAR_AND_DISCOVERY');
    const signalArchive=await evidence(signal.sourceSnapshotHash);
    const signalObservation=object(signalArchive.body,'SIGNAL_ARCHIVE');
    if(signalObservation.kind!=='ONE_GLOBAL_PRIVATE_EU_DUAL_VENUE_RESEARCH_OBSERVATION'
      ||digest(signalObservation.report)!==signal.sourceSnapshotHash)
      invalid('ORIGINAL_SIGNAL_REPORT_HASH_MISMATCH');
    const signalRaw=signalObservation.rawArtifacts;
    const [primaryRaw,secondaryRaw,signalDiscovery]=await Promise.all([
      evidence(signalRaw?.euronextHash,true),evidence(signalRaw?.cboeHash,true),evidence(signalRaw?.cboeDiscoveryHash,true)]);
    const rebuiltReport=engineCheck(()=>buildOneGlobalEuDualVenueReport({euronextRaw:primaryRaw.body,cboeRaw:secondaryRaw.body,
      symbol:instrument.symbol,sessionDate:signal.referenceSessionDate,observedAt:signalObservation.report.observedAt}));
    engineCheck(()=>discoverOneGlobalCboeCeuxMinute({apiRaw:signalDiscovery.body,sessionDate:signal.referenceSessionDate}));
    if(!eq(rebuiltReport,signalObservation.report)||rebuiltReport.researchIndicator!=='UPTREND_RESEARCH_ONLY'
      ||rebuiltReport.closeDifferencePct>0.5||rebuiltReport.key!==signal.key
      ||rebuiltReport.primary.tradeAt!==signal.referenceCloseAt||rebuiltReport.observedAt!==signal.referencePublishedAt
      ||rebuiltReport.observedAt>signal.recordedAt||signal.recordedAt>=fill.sessionOpenedAt)
      invalid('ORIGINAL_PROSPECTIVE_SIGNAL_RECOMPUTATION_MISMATCH');
    result.reference={primaryClose:rebuiltReport.primary.close,secondaryClose:rebuiltReport.secondary.close,
      primaryOpen:rebuiltReport.primary.open,primaryVwap:rebuiltReport.primary.vwap,
      observedAt:rebuiltReport.observedAt};
    check('PROSPECTIVE_SIGNAL_RECOMPUTED_FROM_ORIGINAL_PRIOR_SESSION_BYTES');
    // The first FILL has no preceding monetary events. Replay its exact prefix,
    // then regenerate the event with the actual archived inputs and timestamp.
    const before={...structuredClone(ledger),events:structuredClone(ledger.events.slice(0,fill.seq-1)),
      cashEuro:ledger.capitalEuro,positions:{},lastHash:fill.prevHash};
    engineCheck(()=>replayOneGlobalEodPaperLedger(before));
    const rebuilt=engineCheck(()=>settleOneGlobalEodSignal({previousLedger:before,nowIso:fill.recordedAt,
      signalHash:signal.hash,marketEvidence:observation.marketEvidence,ownerReviewedRights:fill.ownerReviewedRights,
      authority:inputs.authority,fxEvidence:observation.fxEvidence,
      settlementEvidenceArchiveSha256:fill.settlementEvidenceArchiveSha256}));
    if(!eq(rebuilt.ledger.events.at(-1),fill))invalid('EXACT_FILL_REPRODUCTION_MISMATCH');
    const midpoint=(fill.providerReceipts[0].close+fill.providerReceipts[1].close)/2;
    result.accounting={referencePrice:fill.unitPriceLocal,executionPrice:midpoint*(1+fill.slippageBps/10000),
      slippageBps:fill.slippageBps,quantity:fill.quantity,notionalEuro:fill.notionalEuro,feeEuro:fill.feeEuro,
      cashBeforeEuro:before.cashEuro,cashImmediatelyAfterEuro:rebuilt.ledger.cashEuro,currentCashEuro:ledger.cashEuro,
      sourceDifferencePct:Math.abs(fill.providerReceipts[0].close-fill.providerReceipts[1].close)/midpoint*100};
    check('EXACT_FILL_EVENT_QUANTITY_FEE_BALANCE_AND_HASH_REPRODUCED');
    if(ledger.events.filter(e=>e.kind==='FILL'&&e.signalHash===signal.hash).length!==1)invalid('DUPLICATE_FILL_FOR_ORIGINAL_SIGNAL');
    check('ONE_FILL_FOR_SIGNAL_AND_SINGLE_OPEN_POSITION');
    const second=await storage.read();
    if(second?.body!==snapshot.body||second?.etag!==snapshot.etag)missing('ORIGINAL_JOURNAL_CHANGED_DURING_READ_ONLY_AUDIT');
    check('ORIGINAL_JOURNAL_UNCHANGED_DURING_AUDIT');
    const signalUploadedAt=timestamp(signalArchive.uploadedAt),settlementUploadedAt=timestamp(archived.uploadedAt);
    result.storageTimestamps={signalObservationUploadedAt:signalUploadedAt,settlementObservationUploadedAt:settlementUploadedAt,
      signalTimestampSource:signalArchive.uploadedAtSource??null,settlementTimestampSource:archived.uploadedAtSource??null,
      independentTimestampSignature:false};
    if(!signalUploadedAt||!settlementUploadedAt)missing('ORIGINAL_STORAGE_OBJECT_TIMESTAMPS_REQUIRED');
    if(signalUploadedAt&&signalUploadedAt>=fill.sessionOpenedAt)invalid('SIGNAL_EVIDENCE_ARCHIVED_AFTER_NEXT_SESSION_OPEN');
    if(settlementUploadedAt>fill.recordedAt)missing('SETTLEMENT_ARCHIVE_PRECOMMIT_TIMESTAMP_NOT_PROVEN');
    check('ORIGINAL_STORAGE_TIMESTAMPS_PRESERVE_PROSPECTIVE_EVIDENCE');
    result.certification={certifiedTrades:0,closedVirtualRoundTrips:replay.closedVirtualRoundTrips,
      strategyPerformanceCertified:false,sourceRightsIndependentlyCertified:false,
      reason:'THIS_ENGINE_ALWAYS_ASSIGNS_ZERO_CERTIFICATION_CREDIT_TO_VIRTUAL_FILLS',
      actualBrokerExecutionProven:false};
    result.state='FILL_RIGOROUS_REPLAY_VERIFIED';
    result.evidenceObjectsRead=cache.size;
    return result;
  }catch(e){
    if(e instanceof AuditError){
      if(e.missing)result.missingEvidence.push({code:e.code,path:e.path});
      else{result.state='FILL_INVALID';result.defects.push(e.code);}
    }else result.missingEvidence.push({code:'PRIVATE_FORENSIC_CHECK_NOT_COMPLETED',path:null});
    return result;
  }
}

/** Never instantiate private storage before owner authentication succeeds. */
export async function handleOneGlobalPrivateForensicRequest(request,{production,authorized,storageFactory,clock}={}){
  const headers={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
  const json=(body,status=200)=>Response.json(body,{status,headers});
  if(production!==true)return json({state:'PRODUCTION_ONLY',...flags},403);
  if(authorized!==true)return json({state:'OWNER_AUTH_REQUIRED',...flags},401);
  if(request.method!=='GET')return json({state:'METHOD_NOT_ALLOWED',...flags},405);
  try{return json(await auditOneGlobalFirstPrivateFill({storage:await storageFactory(),nowIso:clock?.()??new Date().toISOString()}));}
  catch{return json({state:'PRIVATE_FORENSIC_CHECK_NOT_COMPLETED',...flags},503);}
}
