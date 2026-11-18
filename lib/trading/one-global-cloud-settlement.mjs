/**
 * Original private EOD settlement: original consent/documents -> real HTTPS
 * receipts -> immutable private archive -> strict engine -> one CAS append.
 * Nothing here grants consent, assigns upstreams, guesses exchange sessions,
 * creates a journal, retires signals or enables financial certification.
 */
import {createHash} from 'node:crypto';
import {validOneGlobalEvidenceReview} from './one-global-technical-review.mjs';
import {replayOneGlobalEodPaperLedger,settleOneGlobalEodSignal,validPrivateEodAuthority} from './one-global-eod-paper.mjs';
import {commitOneGlobalCloudPrivateLedger} from './one-global-cloud-private-ledger.mjs';
import {fetchOneGlobalSettlementSource,parseOneGlobalSettlementClose} from '../market/one-global-cloud-settlement-sources.mjs';
import {fetchOneGlobalEcbCurrencyReference,selectOneGlobalEcbCurrencyReference} from '../market/one-global-cloud-ecb-reference.mjs';
const fail=code=>{throw Error('CLOUD_SETTLEMENT_'+code);};
const sha=x=>createHash('sha256').update(x).digest('hex');
const digest=x=>sha(JSON.stringify(x));
const hashOk=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const family=x=>typeof x==='string'&&/^[a-z0-9][a-z0-9._-]{0,63}$/.test(x);
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const safeError=error=>/^(?:CLOUD_SETTLEMENT(?:_SOURCE|_FX)?|EOD_PAPER|CLOUD_PRIVATE_LEDGER)_[A-Z0-9_]{3,100}$/.test(error?.message||'')
  ?error.message:'CLOUD_SETTLEMENT_EXTERNAL_EVIDENCE_UNAVAILABLE';

function journal(snapshot){
  if(!snapshot||typeof snapshot.body!=='string'||Buffer.byteLength(snapshot.body)>1500000)fail('ORIGINAL_JOURNAL_REQUIRED');
  let ledger;try{ledger=JSON.parse(snapshot.body);}catch{fail('ORIGINAL_JOURNAL_INVALID');}
  replayOneGlobalEodPaperLedger(ledger);
  if(!ledger.events.length)fail('NONEMPTY_ORIGINAL_REQUIRED');
  return ledger;
}
function documentBytes(doc){
  if(!doc||!hashOk(doc.sha256)||typeof doc.bodyBase64!=='string'||doc.bodyBase64.length>700000
    ||doc.bodyBase64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(doc.bodyBase64))fail('ORIGINAL_DOCUMENT_REQUIRED');
  const bytes=Buffer.from(doc.bodyBase64,'base64');
  if(bytes.length<20||sha(bytes)!==doc.sha256||bytes.toString('base64')!==doc.bodyBase64)fail('ORIGINAL_DOCUMENT_HASH_MISMATCH');
  return bytes;
}

/** Original byte integrity and original owner consent; document review is a separate gate. */
export function inspectOneGlobalSettlementOriginals({context,nowIso}={}){
  if(!iso(nowIso)||context?.kind!=='ONE_GLOBAL_PRIVATE_SETTLEMENT_CONTEXT'
    ||!Array.isArray(context.documents)||context.documents.length<1||context.documents.length>40
    ||!Array.isArray(context.markets)||context.markets.length>40
    ||!Array.isArray(context.sessions)||context.sessions.length>100)fail('ORIGINAL_CONTEXT_SCHEMA_INVALID');
  const documents=new Map();
  for(const doc of context.documents){
    if(documents.has(doc.sha256))fail('DUPLICATE_ORIGINAL_DOCUMENT');
    documents.set(doc.sha256,{...doc,bytes:documentBytes(doc)});
  }
  const authorityDoc=documents.get(context.authorityEvidenceSha256);
  if(!authorityDoc||authorityDoc.kind!=='ORIGINAL_OWNER_PAPER_CONSENT')fail('ORIGINAL_OWNER_CONSENT_DOCUMENT_MISSING');
  let originalAuthority;try{originalAuthority=JSON.parse(authorityDoc.bytes.toString('utf8'));}catch{fail('ORIGINAL_OWNER_CONSENT_JSON_INVALID');}
  if(!eq(originalAuthority,context.authority)||!validPrivateEodAuthority(originalAuthority,nowIso))fail('ORIGINAL_OWNER_CONSENT_INVALID_OR_EXPIRED');
  return {authority:originalAuthority,documents};
}
export function validateOneGlobalSettlementContext({context,signal,nowIso}={}){
  const {authority:originalAuthority,documents}=inspectOneGlobalSettlementOriginals({context,nowIso});
  const markets=context.markets.filter(m=>m?.key===signal.key&&m.mic===signal.mic&&m.currency===signal.currency);
  if(markets.length!==1)fail('OWNER_REVIEWED_MARKET_MAPPING_MISSING');
  const market=markets[0];
  if(!Array.isArray(market.sources)||market.sources.length<2||market.sources.length>3
    ||!Array.isArray(market.ownerReviewedRights)||market.ownerReviewedRights.length!==market.sources.length)fail('TWO_REVIEWED_SOURCES_AND_RIGHTS_REQUIRED');
  const reviewed=(subject,scope,evidenceSha256)=>validOneGlobalEvidenceReview({subject,scope,evidenceSha256,
    authoritySnapshotHash:digest(originalAuthority),nowIso});
  const providerIds=new Set(),upstreams=new Set();
  for(const source of market.sources){
    if(!['alpha-vantage','eodhd','twelve-data','alpaca-sip','alpaca-iex','euronext-mifir','cboe-eu-mifir'].includes(source?.providerId)||providerIds.has(source.providerId)
      ||source.key!==signal.key||source.mic!==signal.mic||source.currency!==signal.currency
      ||typeof source.symbol!=='string'||!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(source.symbol)
      ||!family(source.sourceFamily)||!reviewed(source,'SOURCE_MAPPING',source.independenceEvidenceSha256)
      ||!iso(source.reviewedAt)||source.reviewedAt>nowIso)fail('SOURCE_MAPPING_NOT_ORIGINALLY_REVIEWED');
    providerIds.add(source.providerId);upstreams.add(source.sourceFamily);
    const proof=documents.get(source.independenceEvidenceSha256);
    const euSource=['euronext-mifir','cboe-eu-mifir'].includes(source.providerId);
    const usCapturedSource=signal.mic==='XNAS'&&['alpha-vantage','alpaca-iex'].includes(source.providerId);
    const officialUsProvenance=usCapturedSource&&proof?.kind==='OFFICIAL_PROVIDER_UPSTREAM_PROVENANCE_CAPTURE';
    if(!proof||!(proof.kind==='PROVIDER_UPSTREAM_PROVENANCE'
      ||(euSource||usCapturedSource)&&proof.kind==='OFFICIAL_PROVIDER_UPSTREAM_PROVENANCE_CAPTURE'))
      fail('INDEPENDENT_UPSTREAM_ORIGINAL_EVIDENCE_MISSING');
    if(officialUsProvenance){
      let p;try{p=JSON.parse(proof.bytes.toString('utf8'));}catch{fail('US_ORIGINAL_PROVENANCE_CAPTURE_INVALID');}
      const expected=source.providerId==='alpaca-iex'
        ?'https://docs.alpaca.markets/us/docs/paper-trading'
        :'https://www.alphavantage.co/stock_api_landing/';
      if(p?.kind!=='ONE_GLOBAL_US_PUBLIC_UPSTREAM_CAPTURE'||p.providerId!==source.providerId
        ||p.officialUrl!==expected||p.key!==signal.key||p.sourceFamily!==source.sourceFamily
        ||!hashOk(p.originalHtmlSha256)||p.ownerReviewedAt!==source.reviewedAt
        ||p.independentlyVerifiedNonoverlappingPrints!==false)
        fail('US_ORIGINAL_PROVENANCE_CAPTURE_INVALID');
    }
    const rights=market.ownerReviewedRights.filter(r=>r?.providerId===source.providerId);
    if(rights.length!==1||rights[0].mic!==signal.mic||rights[0].currency!==signal.currency
      ||rights[0].usageScope!=='PRIVATE_PERSONAL_PAPER_SIMULATION'
      ||!reviewed(rights[0],'PROVIDER_USAGE_RIGHTS',rights[0].evidenceSha256)
      ||rights[0].automatedUseAllowed!==true||!iso(rights[0].validUntil)||rights[0].validUntil<=nowIso
      ||Date.parse(rights[0].validUntil)-Date.parse(nowIso)>366*86400000
      ||!(documents.get(rights[0].evidenceSha256)?.kind==='ORIGINAL_PROVIDER_USAGE_RIGHTS'
        ||(euSource||usCapturedSource)&&documents.get(rights[0].evidenceSha256)?.kind==='OFFICIAL_PROVIDER_USAGE_RIGHTS_CAPTURE'))
      fail('ORIGINAL_PROVIDER_RIGHTS_MISSING_OR_EXPIRED');
    const usRightsDoc=documents.get(rights[0].evidenceSha256);
    if(usCapturedSource&&usRightsDoc?.kind==='OFFICIAL_PROVIDER_USAGE_RIGHTS_CAPTURE'){
      let p;try{p=JSON.parse(usRightsDoc.bytes.toString('utf8'));}catch{fail('US_ORIGINAL_RIGHTS_CAPTURE_INVALID');}
      const expected=source.providerId==='alpaca-iex'
        ?'https://docs.alpaca.markets/us/docs/paper-trading'
        :'https://www.alphavantage.co/terms_of_service/';
      if(p?.kind!=='ONE_GLOBAL_US_PUBLIC_POLICY_CAPTURE'||p.providerId!==source.providerId
        ||p.officialUrl!==expected||!hashOk(p.originalHtmlSha256)
        ||p.ownerScope!=='PRIVATE_PERSONAL_PAPER_SIMULATION'
        ||p.ownerReviewedAt!==rights[0].reviewedAt||p.nonCommercialOnly!==true
        ||p.redistributionPermitted!==false||p.rightsInferredFromApiAccess!==false
        ||p.accountScopeConfirmedByOwner!==true)
        fail('US_ORIGINAL_RIGHTS_CAPTURE_INVALID');
    }
  }
  if(upstreams.size<2)fail('TWO_INDEPENDENT_UPSTREAMS_NOT_PROVEN');
  // Ordinary weekdays are only a strict boundary, never exchange-calendar proof.
  const target=new Date(signal.referenceSessionDate+'T12:00:00Z');
  do{target.setUTCDate(target.getUTCDate()+1);}while([0,6].includes(target.getUTCDay()));
  const sessionDate=target.toISOString().slice(0,10);
  const sessions=context.sessions.filter(s=>s?.mic===signal.mic&&s.sessionDate===sessionDate);
  if(sessions.length!==1)fail('EXACT_NEXT_EXCHANGE_SESSION_ORIGINAL_EVIDENCE_MISSING');
  const session=sessions[0];
  if(signal.mic==='XNAS'&&documents.get(session.evidenceSha256)?.kind==='OFFICIAL_EXCHANGE_SESSION_CAPTURE'){
    let p;try{p=JSON.parse(documents.get(session.evidenceSha256).bytes.toString('utf8'));}
    catch{fail('US_EXCHANGE_SESSION_CAPTURE_INVALID');}
    if(p?.kind!=='ONE_GLOBAL_US_OFFICIAL_SESSION_CAPTURE'||p.mic!=='XNAS'
      ||p.sessionDate!==sessionDate||p.sessionOpenedAt!==session.sessionOpenedAt
      ||p.sessionClosedAt!==session.sessionClosedAt||p.ownerReviewedAt!==session.reviewedAt
      ||p.officialUrl!=='https://www.nasdaqtrader.com/trader.aspx?id=calendar'
      ||!hashOk(p.originalHtmlSha256)||p.notListedAs2026ExchangeHoliday!==true
      ||p.officialRegularSessionTimeZone!=='America/New_York'
      ||p.earlyClosingDatesExcluded!==true)
      fail('US_EXCHANGE_SESSION_CAPTURE_INVALID');
  }
  if(!reviewed(session,'EXCHANGE_SESSION',session.evidenceSha256)||!iso(session.reviewedAt)||session.reviewedAt>nowIso
    ||!['ORIGINAL_EXCHANGE_SESSION','OFFICIAL_EXCHANGE_SESSION_CAPTURE'].includes(documents.get(session.evidenceSha256)?.kind)
    ||!iso(session.sessionOpenedAt)||!iso(session.sessionClosedAt)
    ||session.sessionOpenedAt>=session.sessionClosedAt
    ||signal.recordedAt>=session.sessionOpenedAt)fail('EXACT_EXCHANGE_SESSION_NOT_PROVEN');
  if(originalAuthority.approvedAt>session.sessionOpenedAt)fail('RETROACTIVE_OWNER_CONSENT_REJECTED');
  if(nowIso<session.sessionClosedAt)fail('NEXT_SESSION_NOT_COMPLETED');
  if(Date.parse(nowIso)-Date.parse(session.sessionClosedAt)>48*3600000)fail('STRICT_NEXT_SESSION_48H_WINDOW_ELAPSED');
  return {authority:originalAuthority,market,session};
}

export async function collectOneGlobalSettlementPair({sources,signal,sessionDate,fetcher=fetch,clock,env}={}){
  const results=await Promise.allSettled(sources.map(source=>fetchOneGlobalSettlementSource({source,signal,sessionDate,fetcher,clock,env})));
  const usable=results.flatMap((r,i)=>r.status==='fulfilled'?[{...r.value,source:sources[i]}]:[]);
  const outcomes=results.map((r,i)=>({providerId:sources[i].providerId,
    state:r.status==='fulfilled'?'EXACT_DAILY_ROW_RECEIVED':safeError(r.reason)}));
  for(let i=0;i<usable.length;i++)for(let j=i+1;j<usable.length;j++){
    if(usable[i].receipt.sourceFamily!==usable[j].receipt.sourceFamily)return {pair:[usable[i],usable[j]],outcomes};
  }
  return {pair:null,outcomes};
}

export async function runOneGlobalCloudSettlementCycle({storage,clock=()=>new Date().toISOString(),fetcher=fetch,
  collect=collectOneGlobalSettlementPair,collectFx=fetchOneGlobalEcbCurrencyReference}={}){
  if(storage?.privateAccess!==true||storage.durable!==true||storage.atomicCompareAndSwap!==true
    ||typeof storage.readSettlementContext!=='function'
    ||typeof storage.createResearchObservation!=='function'
    ||typeof storage.readResearchObservation!=='function')fail('PRIVATE_CONTEXT_AND_CAS_STORE_REQUIRED');
  const before=journal(await storage.read()),replay=replayOneGlobalEodPaperLedger(before);
  const open=new Set(replay.pendingSignals),latest=new Map();
  for(const e of before.events)if(e.kind==='SIGNAL'&&open.has(e.key))latest.set(e.key,e);
  const report={state:'NO_PENDING_SIGNAL_TO_SETTLE',originalJournalVerified:true,originalEventsPreserved:true,
    journalEventCount:before.events.length,pendingSignalCount:replay.pendingSignals.length,
    virtualFillCount:replay.virtualBuys+replay.virtualSells,paperFillsCreated:0,
    settlementSourceRequests:0,sourceEvidenceArchived:false,settlementBlockers:[],sourceOutcomes:[],
    originalSettlementContextPresent:false,ownerPaperAuthorityValidated:false,
    sourceRightsEvidenceValidated:false,upstreamEvidenceValidated:false,exchangeSessionEvidenceValidated:false,
    certifiedTrades:0,phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false};
  if(latest.size===0)return report;
  const snapshot=await storage.readSettlementContext();
  if(snapshot===null)return {...report,state:'SETTLEMENT_BLOCKED',settlementBlockers:['CLOUD_SETTLEMENT_ORIGINAL_CONTEXT_NOT_CONNECTED']};
  if(typeof snapshot?.body!=='string'||Buffer.byteLength(snapshot.body)>500000
    ||typeof snapshot.etag!=='string'||!snapshot.etag)fail('PRIVATE_CONTEXT_SNAPSHOT_INVALID');
  let context;try{context=JSON.parse(snapshot.body);}catch{fail('ORIGINAL_CONTEXT_JSON_INVALID');}
  report.originalSettlementContextPresent=true;
  try{inspectOneGlobalSettlementOriginals({context,nowIso:clock()});report.ownerPaperAuthorityValidated=true;}
  catch(error){return {...report,state:'SETTLEMENT_BLOCKED',settlementBlockers:[safeError(error)]};}
  // At most one actual FILL per invocation; all pending markets receive a gate
  // assessment so an unusable older pilot cannot starve another valid market.
  for(const signal of latest.values()){
    let transactionStarted=false;
    let evidenceWriteStarted=false;
    let inputs;
    try{inputs=validateOneGlobalSettlementContext({context,signal,nowIso:clock()});}
    catch(error){
      const blocker=safeError(error);
      // These are the final two gates in validateOneGlobalSettlementContext:
      // reaching either proves the ORIGINAL consent/rights/upstream/session
      // checks passed. Report that fact without admitting a receipt or FILL.
      if(['CLOUD_SETTLEMENT_NEXT_SESSION_NOT_COMPLETED',
        'CLOUD_SETTLEMENT_STRICT_NEXT_SESSION_48H_WINDOW_ELAPSED'].includes(blocker))
        Object.assign(report,{sourceRightsEvidenceValidated:true,
          upstreamEvidenceValidated:true,exchangeSessionEvidenceValidated:true});
      report.settlementBlockers.push(blocker);continue;
    }
    Object.assign(report,{ownerPaperAuthorityValidated:true,sourceRightsEvidenceValidated:true,
      upstreamEvidenceValidated:true,exchangeSessionEvidenceValidated:true});
    const {market,session}=inputs;
    report.settlementSourceRequests+=market.sources.length;
    try{
      const collected=await collect({sources:market.sources,signal,sessionDate:session.sessionDate,fetcher,clock});
      report.sourceOutcomes=collected.outcomes;
      if(!collected.pair){
        report.settlementBlockers.push('CLOUD_SETTLEMENT_TWO_ADMISSIBLE_PROVIDER_RECEIPTS_UNAVAILABLE');
        continue;
      }
      const pair=collected.pair;
      if(pair.length!==2)fail('TWO_RAW_SOURCE_RECEIPTS_REQUIRED');
      const receipts=pair.map(item=>{
        const source=market.sources.find(s=>s.providerId===item.receipt?.providerId);
        if(!source||!Buffer.isBuffer(item.raw)||sha(item.raw)!==item.receipt.payloadSha256
          ||item.receipt.sourceFamily!==source.sourceFamily
          ||parseOneGlobalSettlementClose({raw:item.raw,source,signal,sessionDate:session.sessionDate})!==item.receipt.close
          ||item.receipt.timestampMeaning!=='FIRST_OBSERVED_AT_HTTPS_FETCH_NOT_VENDOR_RELEASE'
          ||!['FIXED_HTTPS_ORIGIN_NO_REDIRECT','FIXED_OFFICIAL_HTTPS_NO_REDIRECT','OFFICIAL_HTTPS_DISCOVERY_PINNED_CDN'].includes(item.receipt.transport)
          ||item.receipt.observedAt!==item.receipt.publishedAt)fail('RECEIPT_RAW_BYTES_OR_PROVENANCE_MISMATCH');
        return item.receipt;
      });
      const fx=signal.currency==='EUR'?{raw:null,evidence:null}:await collectFx({currency:signal.currency,sessionDate:session.sessionDate,fetcher,clock});
      if(signal.currency!=='EUR'&&!eq(fx.evidence,selectOneGlobalEcbCurrencyReference({raw:fx.raw,
        currency:signal.currency,sessionDate:session.sessionDate,observedAt:fx.evidence?.publishedAt})))fail('OFFICIAL_ECB_RECEIPT_MISMATCH');
      const ownerReviewedRights=market.ownerReviewedRights.filter(r=>receipts.some(q=>q.providerId===r.providerId));
      const marketEvidence={sessionDate:session.sessionDate,sessionOpenedAt:session.sessionOpenedAt,
        sessionClosedAt:session.sessionClosedAt,providerReceipts:receipts};
      // Evaluate first: do not archive a rejected close, stale quote or bad FX as eligible.
      settleOneGlobalEodSignal({previousLedger:before,nowIso:clock(),signalHash:signal.hash,
        marketEvidence,ownerReviewedRights,authority:inputs.authority,fxEvidence:fx.evidence});
      // From this point onwards any storage failure is terminal, even if
      // only evidence (not the journal) might have been persisted. Pure
      // per-market receipt/FX/engine rejection above can safely move on.
      evidenceWriteStarted=true;
      const providerRaw=[];
      for(const item of pair){
        const largeOrEu=item.raw.length>500000||['euronext-mifir','cboe-eu-mifir'].includes(item.receipt.providerId);
        if(largeOrEu){
          if(typeof storage.createSourceArtifact!=='function')fail('PRIVATE_RAW_ARTIFACT_STORE_REQUIRED');
          const saved=await storage.createSourceArtifact({hash:item.receipt.payloadSha256,body:item.raw,
            contentType:item.receipt.providerId==='euronext-mifir'?'application/zip':'text/csv'});
          if(saved?.verified!==true)fail('PRIVATE_RAW_ARTIFACT_NOT_CONFIRMED');
          providerRaw.push({providerId:item.receipt.providerId,rawArtifactSha256:item.receipt.payloadSha256});
          for(const support of item.supportingRaw??[]){
            const contentType=support.contentType==='application/json'?'application/json':'text/html';
            const supportHash=sha(support.raw),extra=await storage.createSourceArtifact({hash:supportHash,body:support.raw,contentType});
            if(extra?.verified!==true)fail('PRIVATE_RAW_ARTIFACT_NOT_CONFIRMED');
            providerRaw.push({providerId:item.receipt.providerId,supportingKind:support.kind,rawArtifactSha256:supportHash});
          }
        }else providerRaw.push({providerId:item.receipt.providerId,rawBase64:item.raw.toString('base64')});
      }
      const observation={kind:'ONE_GLOBAL_PRIVATE_SETTLEMENT_SOURCE_OBSERVATION',signalHash:signal.hash,
        context,contextSha256:sha(snapshot.body),marketEvidence,
        providerRaw,
        fxEvidence:fx.evidence,ecbRawBase64:fx.raw?.toString('base64')??null,
        sourceRightsIndependentlyCertified:false,liveTradingAllowed:false,brokerConnectivityAllowed:false};
      const archiveBody=JSON.stringify(observation)+'\n',archiveHash=digest(observation);
      const archived=await storage.createResearchObservation({hash:archiveHash,body:archiveBody});
      if(archived?.created!==true)fail('PRIVATE_RECEIPT_ARCHIVE_NOT_CONFIRMED');
      report.sourceEvidenceArchived=true;
      // An immutable archive must be read back through the same private-origin
      // HEAD-backed forensic adapter. Never trust an application clock alone:
      // the next FILL's recordedAt must be >= the provider upload timestamp.
      // A missing, stale, or future-dated proof causes NO journal write.
      const originalProof=await storage.readResearchObservation(archiveHash);
      if(!Buffer.isBuffer(originalProof?.body)
        ||originalProof.body.toString('utf8')!==archiveBody
        ||originalProof.uploadedAtSource!=='VERCEL_CONTROL_PLANE_HEAD')
        fail('PRECOMMIT_ARCHIVE_ORIGIN_PROOF_NOT_VERIFIED');
      const uploadedAt=originalProof.uploadedAt instanceof Date
        ?originalProof.uploadedAt.getTime()
        :iso(originalProof.uploadedAt)?Date.parse(originalProof.uploadedAt):NaN;
      if(!Number.isFinite(uploadedAt))
        fail('PRECOMMIT_ARCHIVE_TIMESTAMP_NOT_VERIFIED');
      // A known clock skew is a definitive pre-CAS refusal, not an
      // ambiguous commit. Preserve the archived evidence, append nothing.
      const precommitNow=clock();
      if(!iso(precommitNow)||Date.parse(precommitNow)<uploadedAt)
        fail('PRECOMMIT_ARCHIVE_TIMESTAMP_AFTER_FILL_CLOCK');
      transactionStarted=true;
      const committed=await commitOneGlobalCloudPrivateLedger({storage,makeNext:async ledger=>{
        const current=await storage.readSettlementContext();
        if(current?.etag!==snapshot.etag||current.body!==snapshot.body)fail('ORIGINAL_CONTEXT_CHANGED_RELOAD_REQUIRED');
        // Capture the real transaction timestamp once, after durable origin
        // proof and BEFORE CAS. Do not synthesize, backdate or round a time.
        const recordedAt=clock();
        if(!iso(recordedAt)||Date.parse(recordedAt)<uploadedAt)
          fail('PRECOMMIT_ARCHIVE_TIMESTAMP_AFTER_FILL_CLOCK');
        const checked=validateOneGlobalSettlementContext({context,signal,nowIso:recordedAt});
        return settleOneGlobalEodSignal({previousLedger:ledger,nowIso:recordedAt,signalHash:signal.hash,
          marketEvidence,ownerReviewedRights,authority:checked.authority,fxEvidence:fx.evidence,
          settlementEvidenceArchiveSha256:archiveHash});
      }});
      if(committed.committed!==true||committed.newEvents!==1||committed.eventKind!=='FILL')fail('SINGLE_FILL_NOT_CONFIRMED');
      const after=journal(await storage.read()),verified=replayOneGlobalEodPaperLedger(after);
      if(!eq(after.events.slice(0,before.events.length),before.events)
        ||!after.events.some(e=>e.hash===committed.lastHash&&e.kind==='FILL'&&e.signalHash===signal.hash))fail('FILL_READBACK_NOT_CONFIRMED');
      return {...report,state:'STRICT_PAPER_FILL_COMMITTED_PRIVATE',paperFillsCreated:1,
        journalEventCount:after.events.length,pendingSignalCount:verified.pendingSignals.length,
        virtualFillCount:verified.virtualBuys+verified.virtualSells};
    }catch(error){
      // A storage conflict or ambiguous readback is terminal. Never retry another
      // market, hide it as zero fills, or overwrite a possibly committed event.
      if(transactionStarted)fail('COMMIT_OUTCOME_UNCONFIRMED_RELOAD_REQUIRED');
      report.settlementBlockers.push(safeError(error));
      if(evidenceWriteStarted)break;
    }
  }
  return {...report,state:'SETTLEMENT_BLOCKED',settlementBlockers:[...new Set(report.settlementBlockers)]};
}
