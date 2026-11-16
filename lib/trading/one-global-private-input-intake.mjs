/** Owner-supplied ORIGINAL documents only. This module cannot write the journal. */
import {createHash} from 'node:crypto';
import {replayOneGlobalEodPaperLedger,validPrivateEodAuthority} from './one-global-eod-paper.mjs';
import {inspectOneGlobalSettlementOriginals,validateOneGlobalSettlementContext} from './one-global-cloud-settlement.mjs';
const fail=code=>{throw Error('PRIVATE_INPUT_'+code);};
const sha=x=>createHash('sha256').update(x).digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const safeCode=e=>/^(?:CLOUD_SETTLEMENT|PRIVATE_INPUT)_[A-Z0-9_]{3,100}$/.test(e?.message||'')?e.message:'PRIVATE_INPUT_ORIGINALS_NOT_VALIDATED';
function readJournal(snapshot){
  if(typeof snapshot?.body!=='string'||Buffer.byteLength(snapshot.body)>1500000)fail('ORIGINAL_JOURNAL_REQUIRED');
  const ledger=JSON.parse(snapshot.body);replayOneGlobalEodPaperLedger(ledger);
  if(!ledger.events.length)fail('NONEMPTY_ORIGINAL_REQUIRED');return ledger;
}
function parseContext(snapshot){
  if(snapshot===null)return null;
  if(typeof snapshot?.body!=='string'||Buffer.byteLength(snapshot.body)>500000
    ||typeof snapshot.etag!=='string'||!snapshot.etag||snapshot.etag.length>256)fail('CONTEXT_SNAPSHOT_INVALID');
  try{return JSON.parse(snapshot.body);}catch{fail('CONTEXT_JSON_INVALID');}
}
function decodeBase64(text){
  if(typeof text!=='string'||text.length>666668||text.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(text))fail('ORIGINAL_FILE_ENCODING_INVALID');
  const bytes=Buffer.from(text,'base64');
  if(bytes.length<20||bytes.length>500000||bytes.toString('base64')!==text)fail('ORIGINAL_FILE_SIZE_OR_ENCODING_INVALID');
  return bytes;
}
function originalJson(bytes){
  // Do not silently replace invalid UTF-8, strip a BOM or reserialize originals.
  const text=bytes.toString('utf8');if(!Buffer.from(text,'utf8').equals(bytes))fail('ORIGINAL_FILE_UTF8_INVALID');
  try{const x=JSON.parse(text);if(!x||typeof x!=='object'||Array.isArray(x))fail('ORIGINAL_JSON_OBJECT_REQUIRED');return x;}
  catch{fail('ORIGINAL_FILE_JSON_INVALID');}
}
/** Preserve previously connected original evidence and source mappings.
 * A genuinely new, valid original owner consent may supersede the active one;
 * old consent bytes stay archived and all reviews must be revalidated. */
function preserveConnectedEvidence(previous,next){
  if(!Array.isArray(previous.documents)||!Array.isArray(previous.markets)
    ||!Array.isArray(previous.sessions))fail('PREVIOUS_CONTEXT_SCHEMA_INVALID');
  if(previous.documents.some(old=>!next.documents.some(doc=>equal(doc,old))))
    fail('PREVIOUS_ORIGINAL_DOCUMENTS_MUST_BE_PRESERVED');
  for(const old of previous.sessions){
    const matches=next.sessions.filter(s=>s?.mic===old?.mic&&s?.sessionDate===old?.sessionDate);
    if(matches.length!==1||!equal(matches[0],old))
      fail('PREVIOUS_EXCHANGE_SESSIONS_MUST_BE_PRESERVED');
  }
  for(const old of previous.markets){
    const matches=next.markets.filter(m=>m?.key===old?.key&&m?.mic===old?.mic&&m?.currency===old?.currency);
    if(matches.length!==1)fail('PREVIOUS_MARKET_MAPPING_MUST_BE_PRESERVED');
    const current=matches[0];
    if(!Array.isArray(old.sources)||!Array.isArray(current.sources)
      ||old.sources.some(source=>!current.sources.some(candidate=>equal(candidate,source))))
      fail('PREVIOUS_SOURCE_MAPPING_MUST_BE_PRESERVED');
    if(!Array.isArray(old.ownerReviewedRights)||!Array.isArray(current.ownerReviewedRights)
      ||old.ownerReviewedRights.some(right=>current.ownerReviewedRights.filter(candidate=>
        candidate?.providerId===right?.providerId).length!==1))
      fail('PREVIOUS_PROVIDER_RIGHTS_ENTRY_MUST_BE_PRESERVED');
    // Existing rights may be refreshed or revoked, but the validator must
    // recheck the full original review, provenance and current usage scope.
  }
}
const flags={journalChangedByImport:false,paperFillsCreated:0,certifiedTrades:0,
  phase9Credit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false};
function assess({ledger,context,snapshot,nowIso}){
  const replay=replayOneGlobalEodPaperLedger(ledger);
  const result={...flags,state:context?'PRIVATE_ORIGINAL_INPUTS_CONNECTED':'PRIVATE_ORIGINAL_INPUTS_MISSING',
    contextPresent:context!==null,contextEtag:snapshot?.etag??null,
    originalConsentValid:false,originalDocumentCount:0,eligiblePendingSignals:0,
    journalEventCount:ledger.events.length,virtualFillCount:replay.virtualBuys+replay.virtualSells,
    blockers:[],settlementPerformedByImport:false};
  if(!context)return {...result,blockers:['CLOUD_SETTLEMENT_ORIGINAL_CONTEXT_NOT_CONNECTED']};
  try{
    const original=inspectOneGlobalSettlementOriginals({context,nowIso});
    result.originalConsentValid=true;result.originalDocumentCount=original.documents.size;
  }catch(e){return {...result,state:'PRIVATE_ORIGINAL_INPUTS_INVALID',blockers:[safeCode(e)]};}
  const pending=new Map();
  for(const event of ledger.events)if(event.kind==='SIGNAL'&&replay.pendingSignals.includes(event.key))pending.set(event.key,event);
  for(const signal of pending.values()){
    try{validateOneGlobalSettlementContext({context,signal,nowIso});result.eligiblePendingSignals++;}
    catch(e){result.blockers.push(safeCode(e));}
  }
  return {...result,blockers:[...new Set(result.blockers)]};
}
export async function inspectOneGlobalPrivateInputs({storage,nowIso}={}){
  const ledger=readJournal(await storage.read()),snapshot=await storage.readSettlementContext();
  return assess({ledger,context:parseContext(snapshot),snapshot,nowIso});
}
/** OWNER-ONLY, read-only comparison of archived original input packets.
 * The presence of an archived market mapping is NOT an entitlement or a FILL.
 * Never infer absence from an incomplete or unverifiable archive scan. */
export async function inspectOneGlobalPrivateArchive({storage,nowIso}={}){
  if(storage?.privateAccess!==true||storage.durable!==true
    ||typeof storage.readArchivedOriginalContexts!=='function')
    fail('PRIVATE_ARCHIVE_AUDIT_STORE_REQUIRED');
  const ledger=readJournal(await storage.read());
  const snap=await storage.readSettlementContext();
  const current=parseContext(snap);
  if(!current)return {state:'ORIGINAL_CONTEXT_NOT_CONNECTED',archiveScanComplete:false,
    examinedArchiveObjects:0,verifiedArchivedContexts:0,pendingWithoutCurrentMappings:0,
    historicalMappingCandidates:[],paperFillsCreated:0,brokerConnectivityAllowed:false,liveTradingAllowed:false};
  inspectOneGlobalSettlementOriginals({context:current,nowIso});
  const replay=replayOneGlobalEodPaperLedger(ledger),pendingKeys=new Set(replay.pendingSignals);
  const pending=ledger.events.filter(e=>e.kind==='SIGNAL'&&pendingKeys.has(e.key));
  const missing=pending.filter(s=>!current.markets.some(m=>m?.key===s.key&&m.mic===s.mic&&m.currency===s.currency));
  const archives=await storage.readArchivedOriginalContexts();
  if(!archives||!Array.isArray(archives.contexts)||archives.contexts.length>25
    ||typeof archives.complete!=='boolean'
    ||!Number.isSafeInteger(archives.listed)||archives.listed<0||archives.listed>400
    ||!Number.isSafeInteger(archives.read)||archives.read<0||archives.read>40)
    fail('PRIVATE_ARCHIVE_AUDIT_RESULT_INVALID');
  const candidates=new Map();
  let verified=0;
  for(const item of archives.contexts){
    if(typeof item?.receivedAt!=='string'||!Number.isFinite(Date.parse(item.receivedAt)))continue;
    try{inspectOneGlobalSettlementOriginals({context:item.context,nowIso:item.receivedAt});}catch{continue;}
    verified++;
    for(const s of missing){
      const same=item.context.authorityEvidenceSha256===current.authorityEvidenceSha256;
      const match=item.context.markets.find(m=>m?.key===s.key&&m.mic===s.mic
        &&m.currency===s.currency&&Array.isArray(m.sources)&&m.sources.length>=2
        &&Array.isArray(m.ownerReviewedRights)&&m.ownerReviewedRights.length>=2);
      if(!match)continue;
      const prev=candidates.get(s.key);
      candidates.set(s.key,{key:s.key,mic:s.mic,archivedWithCurrentConsent:same||prev?.archivedWithCurrentConsent===true});
    }
  }
  return {state:candidates.size?'HISTORICAL_MAPPING_CANDIDATES_REVIEW_REQUIRED':
      archives.complete?'NO_MATCHING_ARCHIVED_ORIGINAL_FOUND':'PRIVATE_ARCHIVE_AUDIT_INCOMPLETE',
    archiveScanComplete:archives.complete,examinedArchiveObjects:archives.listed,
    verifiedArchivedContexts:verified,pendingWithoutCurrentMappings:missing.length,
    historicalMappingCandidates:[...candidates.values()].slice(0,10),
    originalJournalVerified:true,originalJournalEventCount:ledger.events.length,
    paperFillsCreated:0,brokerConnectivityAllowed:false,liveTradingAllowed:false};
}

export async function importOneGlobalPrivateInputs({storage,input,nowIso}={}){
  if(storage?.privateAccess!==true||storage.durable!==true||storage.atomicCompareAndSwap!==true
    ||typeof storage.writeSettlementContext!=='function'||typeof storage.createResearchObservation!=='function')fail('PRIVATE_CONTEXT_STORE_REQUIRED');
  const before=readJournal(await storage.read());
  if(!input||!['ORIGINAL_OWNER_PAPER_CONSENT','SETTLEMENT_CONTEXT'].includes(input.kind)
    ||Object.keys(input).some(k=>!['kind','documentBase64','expectedEtag'].includes(k))
    ||!(input.expectedEtag===null||typeof input.expectedEtag==='string'))fail('EXACT_IMPORT_REQUEST_REQUIRED');
  const snapshot=await storage.readSettlementContext(),existing=parseContext(snapshot);
  if((snapshot?.etag??null)!==input.expectedEtag)fail('INPUTS_CHANGED_RELOAD_REQUIRED');
  const bytes=decodeBase64(input.documentBase64),original=originalJson(bytes);
  let context;
  if(input.kind==='ORIGINAL_OWNER_PAPER_CONSENT'){
    if(!validPrivateEodAuthority(original,nowIso))fail('ORIGINAL_OWNER_CONSENT_INVALID_OR_EXPIRED');
    if(existing){
      inspectOneGlobalSettlementOriginals({context:existing,nowIso});
      if(existing.authorityEvidenceSha256!==sha(bytes))fail('EXISTING_INPUTS_REQUIRE_COMPLETE_CONTEXT');
      // Re-uploading a consent never discards already-connected market proofs.
      return {...assess({ledger:before,context:existing,snapshot,nowIso}),state:'ORIGINAL_CONSENT_ALREADY_CONNECTED',imported:false};
    }
    context={kind:'ONE_GLOBAL_PRIVATE_SETTLEMENT_CONTEXT',authority:original,
      authorityEvidenceSha256:sha(bytes),documents:[{kind:'ORIGINAL_OWNER_PAPER_CONSENT',
        sha256:sha(bytes),bodyBase64:input.documentBase64}],markets:[],sessions:[]};
  }else context=original;
  inspectOneGlobalSettlementOriginals({context,nowIso});
  if(existing){
    // An expired previous consent must not block a valid genuine renewal.
    // Preservation checks compare the immutable previous originals, not their
    // current eligibility. The NEW active consent was validated above.
    preserveConnectedEvidence(existing,context);
  }
  const body=JSON.stringify(context,null,2)+'\n';if(Buffer.byteLength(body)>500000)fail('CONTEXT_SIZE_LIMIT');
  const archivalBody=JSON.stringify({kind:'ONE_GLOBAL_PRIVATE_INPUT_ORIGINAL',
    receivedAt:nowIso,inputKind:input.kind,originalFileSha256:sha(bytes),
    originalFileBase64:input.documentBase64,context,liveTradingAllowed:false,brokerConnectivityAllowed:false})+'\n';
  let archived;
  try{archived=await storage.createResearchObservation({hash:sha(archivalBody),body:archivalBody});}
  catch(error){
    if(/^CLOUD_BLOB_[A-Z0-9_]{3,100}$/.test(error?.message||''))throw error;
    fail('ORIGINAL_DOCUMENT_ARCHIVE_UNAVAILABLE');
  }
  if(archived?.created!==true)fail('ORIGINAL_DOCUMENT_ARCHIVE_NOT_CONFIRMED');
  let written;
  try{written=await storage.writeSettlementContext({expectedEtag:input.expectedEtag,body});}
  catch{fail('CONTEXT_WRITE_UNCONFIRMED_RELOAD_REQUIRED');}
  if(written?.committed!==true||typeof written.etag!=='string'||!written.etag)fail('CONTEXT_WRITE_UNCONFIRMED_RELOAD_REQUIRED');
  const readback=await storage.readSettlementContext();
  if(readback?.etag!==written.etag||readback.body!==body)fail('CONTEXT_READBACK_UNCONFIRMED');
  const after=readJournal(await storage.read());
  if(!equal(after.events.slice(0,before.events.length),before.events))fail('ORIGINAL_JOURNAL_PREFIX_CHANGED');
  return {...assess({ledger:after,context,snapshot:readback,nowIso}),state:'ORIGINAL_PRIVATE_INPUTS_IMPORTED',
    imported:true,originalBytesArchived:true};
}
