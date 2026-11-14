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
    // Extend the private input set without erasing any previously supplied original.
    // No generated rights, changed bytes or new approval timestamps are permitted.
    if(existing.documents?.some(old=>!context.documents.some(doc=>equal(doc,old))))fail('PREVIOUS_ORIGINAL_DOCUMENTS_MUST_BE_PRESERVED');
  }
  const body=JSON.stringify(context,null,2)+'\n';if(Buffer.byteLength(body)>500000)fail('CONTEXT_SIZE_LIMIT');
  const archivalBody=JSON.stringify({kind:'ONE_GLOBAL_PRIVATE_INPUT_ORIGINAL',
    receivedAt:nowIso,inputKind:input.kind,originalFileSha256:sha(bytes),
    originalFileBase64:input.documentBase64,context,liveTradingAllowed:false,brokerConnectivityAllowed:false})+'\n';
  const archived=await storage.createResearchObservation({hash:sha(archivalBody),body:archivalBody});
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
