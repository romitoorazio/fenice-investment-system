import {createHash} from 'node:crypto';
import {findOneGlobalPrivateClosedRoundTrips} from './one-global-private-roundtrip-audit.mjs';
import {inspectOneGlobalSettlementOriginals} from './one-global-cloud-settlement.mjs';

export const ROOT='fenice/one-global/private-eod/';
export const LEDGER=ROOT+'original-ledger.json';
export const CONTEXT=ROOT+'settlement-inputs.json';
export const OBS=ROOT+'observations/';
export const MAX_OBJECTS=1000;
export const MAX_BYTES=150_000_000;
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export const isHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const isIso=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))
  &&new Date(value).toISOString()===value;
export const reject=code=>{throw Error('MIGRATION_'+code);};

export function objectLimit(key){
  if(key===LEDGER)return 1_500_000;
  if(key===CONTEXT)return 500_000;
  if(typeof key!=='string'||!key.startsWith(OBS))return 0;
  const suffix=key.slice(OBS.length);
  if(/^[a-f0-9]{64}\.json$/.test(suffix))return 1_500_000;
  return /^raw\/[a-f0-9]{64}$/.test(suffix)?8_000_000:0;
}

export function validateManifest(manifest){
  if(!Array.isArray(manifest)||manifest.length<2||manifest.length>MAX_OBJECTS)reject('INVENTORY_INVALID');
  const seen=new Set();
  let total=0;
  for(const row of manifest){
    const limit=objectLimit(row?.key);
    if(!limit||seen.has(row.key)||!isHash(row.sha256)||!Number.isSafeInteger(row.size)
      ||row.size<1||row.size>limit||!isIso(row.sourceUploadedAt))reject('MANIFEST_INVALID');
    seen.add(row.key);
    total+=row.size;
    if(total>MAX_BYTES)reject('SIZE_LIMIT');
  }
  if(!seen.has(LEDGER)||!seen.has(CONTEXT))reject('REQUIRED_OBJECT_MISSING');
  return total;
}

export function verifyBytes(row,bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length!==row.size||sha256(bytes)!==row.sha256)reject('BYTES_MISMATCH');
}

function jsonObject(bytes){
  try{
    const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes));
    if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))return parsed;
  }catch{/* Return only a fixed diagnostic. */}
  reject('INVALID_JSON_OBJECT');
}

/** Verifies byte identity and event/account reconciliation. No source authority is conferred. */
export function reconcileInventory(manifest,objects){
  const totalBytes=validateManifest(manifest);
  if(!Array.isArray(objects)||objects.length!==manifest.length)reject('INVENTORY_INVALID');
  const bodies=new Map();
  for(const item of objects){
    if(!objectLimit(item?.key)||!Buffer.isBuffer(item.bytes)||bodies.has(item.key))reject('OBJECT_INVALID');
    bodies.set(item.key,item.bytes);
  }
  for(const row of manifest)verifyBytes(row,bodies.get(row.key));
  const ledger=jsonObject(bodies.get(LEDGER));
  let replay;
  try{({replay}=findOneGlobalPrivateClosedRoundTrips(ledger));}catch{reject('HISTORY_MISMATCH');}
  if(replay.valid!==true)reject('HISTORY_MISMATCH');
  const context=jsonObject(bodies.get(CONTEXT));
  // Validate archived consent at its original approval instant. Current trading eligibility is separate.
  try{inspectOneGlobalSettlementOriginals({context,nowIso:context.authority?.approvedAt});}
  catch{reject('ORIGINAL_CONTEXT_INVALID');}

  const requireObservation=hash=>{
    if(!isHash(hash)||!bodies.has(OBS+hash+'.json'))reject('REFERENCED_OBSERVATION_MISSING');
  };
  const requireRaw=hash=>{
    if(!isHash(hash)||!bodies.has(OBS+'raw/'+hash))reject('REFERENCED_RAW_MISSING');
  };
  for(const event of ledger.events){
    if(event.kind==='SIGNAL')requireObservation(event.sourceSnapshotHash);
    if(event.kind==='FILL')requireObservation(event.settlementEvidenceArchiveSha256);
  }
  for(const [key,bytes] of bodies){
    if(!key.startsWith(OBS))continue;
    if(key.startsWith(OBS+'raw/')){
      if(sha256(bytes)!==key.slice((OBS+'raw/').length))reject('RAW_FINGERPRINT_MISMATCH');
      continue;
    }
    const observation=jsonObject(bytes);
    const address=key.slice(OBS.length,-5);
    // Writers use the research report, an original input packet, or the compact observation as the address.
    const research=['ONE_GLOBAL_PRIVATE_RESEARCH_SOURCE_OBSERVATION','ONE_GLOBAL_PRIVATE_EU_DUAL_VENUE_RESEARCH_OBSERVATION'];
    const input=observation.kind==='ONE_GLOBAL_PRIVATE_INPUT_ORIGINAL';
    let fingerprint;
    if(input){
      fingerprint=sha256(bytes);
      const original=Buffer.from(observation.originalFileBase64??'','base64');
      if(original.toString('base64')!==observation.originalFileBase64||sha256(original)!==observation.originalFileSha256)
        reject('ARCHIVED_INPUT_MISMATCH');
    }else{
      const value=research.includes(observation.kind)?observation.report:observation;
      if(!value)reject('OBSERVATION_FINGERPRINT_MISMATCH');
      fingerprint=sha256(JSON.stringify(value));
    }
    if(fingerprint!==address)reject('OBSERVATION_FINGERPRINT_MISMATCH');
    for(const hash of Object.values(observation.rawArtifacts??{}))requireRaw(hash);
    for(const item of observation.providerRaw??[])if(Object.hasOwn(item,'rawArtifactSha256'))requireRaw(item.rawArtifactSha256);
  }
  return {ledger,objectCount:bodies.size,totalBytes};
}

// Even a self-consistent candidate with a known prefix is never an authenticated inventory.
export function prepareR2Migration({manifest,objects}={}){
  const flags={sourceProvenanceIndependentlyVerified:false,completeInventoryIndependentlyVerified:false,
    authoritativeStoreChanged:false,journalMutationAllowed:false,brokerConnectivityAllowed:false,liveTradingAllowed:false};
  try{
    const {ledger,objectCount,totalBytes}=reconcileInventory(manifest,objects);
    if(ledger.events.length<10||ledger.events[2]?.hash!=='a733637275ad95c086566a6d29213035fbb0f5060d222df7eddbf99f074adf89')
      reject('HISTORY_MISMATCH');
    return {...flags,state:'MIGRATION_PREFLIGHT_BYTES_VERIFIED',objectCount,totalBytes};
  }catch(error){
    return {...flags,state:/^MIGRATION_[A-Z_]+$/.test(error.message)?error.message:'MIGRATION_PREFLIGHT_REJECTED'};
  }
}
