import {createHash} from 'node:crypto';
import {replayOneGlobalEodPaperLedger} from './one-global-eod-paper.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const prefix='a733637275ad95c086566a6d29213035fbb0f5060d222df7eddbf99f074adf89';
const root='fenice/one-global/private-eod/';
const required=['original-ledger.json','settlement-inputs.json'];
// Offline preflight only. Manifest must come from an authenticated source,
// independently of the candidate bytes. No storage or broker side effects.
export function prepareR2Migration({manifest,objects}={}){
 const fail=state=>({state,authoritativeStoreChanged:false,journalMutationAllowed:false,liveTradingAllowed:false});
 try{
 if(!Array.isArray(manifest)||!Array.isArray(objects)||manifest.length!==objects.length||manifest.length<2||manifest.length>1000)return fail('MIGRATION_INVENTORY_INVALID');
 const seen=new Set(), candidates=new Map();
 for(const o of objects){
 if(!o||typeof o.key!=='string'||candidates.has(o.key)||!Buffer.isBuffer(o.bytes))return fail('MIGRATION_OBJECT_INVALID');
 candidates.set(o.key,o.bytes);
 }
 let total=0;
 for(const m of manifest){
 if(!m||typeof m.key!=='string'||!m.key.startsWith(root)||!/^([A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(m.key.slice(root.length))||m.key.split('/').some(x=>x==='.'||x==='..')||seen.has(m.key)||!(/^[a-f0-9]{64}$/).test(m.sha256)||!Number.isSafeInteger(m.size)||m.size<1||typeof m.sourceUploadedAt!=='string'||!Number.isFinite(Date.parse(m.sourceUploadedAt)))return fail('MIGRATION_MANIFEST_INVALID');
 seen.add(m.key);
 const bytes=candidates.get(m.key);
 if(!bytes||bytes.length!==m.size||sha(bytes)!==m.sha256)return fail('MIGRATION_BYTES_MISMATCH');
 total+=bytes.length;if(total>150_000_000)return fail('MIGRATION_SIZE_LIMIT');
 }
 if(required.some(k=>!seen.has(root+k)))return fail('MIGRATION_REQUIRED_OBJECT_MISSING');
 const bytes=candidates.get(root+required[0]);
 if(bytes.length>1_500_000)return fail('MIGRATION_LEDGER_TOO_LARGE');
 const json=bytes.toString('utf8');if(!Buffer.from(json).equals(bytes))return fail('MIGRATION_LEDGER_UTF8_INVALID');
 const ledger=JSON.parse(json);
 if(replayOneGlobalEodPaperLedger(ledger).valid!==true||ledger.events?.[2]?.hash!==prefix)return fail('MIGRATION_HISTORY_MISMATCH');
 return {...fail('MIGRATION_PREFLIGHT_BYTES_VERIFIED'),objectCount:seen.size,totalBytes:total,sourceProvenanceIndependentlyVerified:false,completeInventoryIndependentlyVerified:false};
 }catch{return fail('MIGRATION_PREFLIGHT_REJECTED');}
}
