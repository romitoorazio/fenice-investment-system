/** Independent prospective PAPER storage. Not a historical migration or LIVE adapter. */
import {createHash,createHmac,randomUUID,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {request as httpsRequest} from 'node:https';
import {resolvePrivateR2Config} from './one-global-r2-config.mjs';
import {newOneGlobalEodPaperLedger,replayOneGlobalEodPaperLedger} from './one-global-eod-paper.mjs';

const PREFIX='fenice/one-global/prospective-paper/';
const CURRENT='ledger.json';
const MAX=1_600_000;
const CONTEXT='evidence/settlement-inputs.json', CONTEXT_MAX=500_000, RAW_MAX=8_000_000;
const hashOk=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const keyLimit=key=>key===CONTEXT?CONTEXT_MAX:key.startsWith('evidence/raw/')?RAW_MAX:MAX;
const sha=b=>createHash('sha256').update(b).digest('hex');
const hmac=(k,b)=>createHmac('sha256',k).update(b).digest();
const fail=code=>{throw Error('R2_PROSPECTIVE_'+code);};
const iso=s=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
/** Runtime ordering for this uncertified R2 campaign only; not provider upload chronology. */
export function assertR2ProspectiveClockAfterReadback({proof,recordedAt}={}){
  if(proof?.provenance!=='R2_PRIVATE_READBACK_ONLY'||proof.historicalChronologyProven!==false
    ||!iso(proof.readbackObservedAt)||!iso(recordedAt)||recordedAt<proof.readbackObservedAt)
    fail('PRECOMMIT_READBACK_CLOCK_INVALID');
}
const tag=s=>typeof s==='string'&&/^"[A-Za-z0-9._:+/=~-]{1,254}"$/.test(s);
const encode=o=>JSON.stringify(o)+'\n';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// Direct HTTPS avoids framework removal of the provider's opaque version tag.
// No redirects, arbitrary paths, public access, DELETE or unconditional PUT.
function signedTransport(env,{config=resolvePrivateR2Config(env),backup=false}={}){
  const c=config;
  return async ({method,key,body='',condition={}})=>{
    if(!(backup?/^encrypted\/[a-f0-9]{64}\.bin$/:/^(ledger\.json|snapshots\/[a-f0-9]{64}\.json|evidence\/settlement-inputs\.json|evidence\/observations\/[a-f0-9]{64}\.json|evidence\/raw\/[a-f0-9]{64})$/).test(key))fail('KEY_INVALID');
    if((backup||key.startsWith('evidence/raw/')||key.startsWith('evidence/observations/'))&&method==='PUT'&&condition['if-none-match']!=='*')fail('IMMUTABLE_CREATE_ONLY');
    if(method==='PUT'&&Buffer.byteLength(body)>keyLimit(key)+(backup?29:0))fail('BODY_LIMIT');
    if(!['GET','PUT'].includes(method)||(method==='PUT'&&!('if-match' in condition||'if-none-match' in condition)))fail('METHOD_INVALID');
    const url=new URL('/'+c.bucket+'/'+PREFIX+key,c.endpoint);
    const stamp=new Date().toISOString().replace(/[:-]|\.\d{3}/g,'');
    const day=stamp.slice(0,8),scope=day+'/auto/s3/aws4_request';
    const headers={host:url.host,'x-amz-date':stamp,'x-amz-content-sha256':sha(body),...condition};
    const names=Object.keys(headers).sort(),signed=names.join(';');
    const canonical=[method,url.pathname,'',names.map(k=>k+':'+headers[k]+'\n').join(''),signed,sha(body)].join('\n');
    const signingKey=hmac(hmac(hmac(hmac('AWS4'+c.secretAccessKey,day),'auto'),'s3'),'aws4_request');
    const signature=hmac(signingKey,['AWS4-HMAC-SHA256',stamp,scope,sha(canonical)].join('\n')).toString('hex');
    return new Promise((resolve,reject)=>{
      const req=httpsRequest(url,{method,signal:AbortSignal.timeout(8000),headers:{...headers,
        authorization:'AWS4-HMAC-SHA256 Credential='+c.accessKeyId+'/'+scope+', SignedHeaders='+signed+', Signature='+signature,
        'accept-encoding':'identity',...(method==='PUT'?{'content-type':backup||key.startsWith('evidence/raw/')?'application/octet-stream':'application/json','content-length':Buffer.byteLength(body)}:{})}},res=>{
        let size=0;const chunks=[];
        res.on('error',()=>reject(Error('R2_PROSPECTIVE_TRANSPORT_FAILED')));
        res.on('aborted',()=>reject(Error('R2_PROSPECTIVE_TRANSPORT_FAILED')));
        res.on('data',chunk=>{size+=chunk.length;if(size>keyLimit(key)+(backup?29:0)){res.destroy(Error('R2_PROSPECTIVE_BODY_LIMIT'));return;}chunks.push(chunk);});
        res.on('end',()=>{const tags=res.headersDistinct.etag??[];
          resolve({status:res.statusCode,etag:tags.length===1?tags[0]:null,body:Buffer.concat(chunks)});});
      });
      req.on('error',()=>reject(Error('R2_PROSPECTIVE_TRANSPORT_FAILED')));
      req.end(method==='PUT'?body:undefined);
    });
  };
}
function backupConfig(env){
  const primary=resolvePrivateR2Config(env);
  const endpoint=env.R2_BACKUP_ENDPOINT??primary.endpoint;
  const bucket=env.R2_BACKUP_BUCKET_NAME;
  const accessKeyId=env.R2_BACKUP_ACCESS_KEY_ID;
  const secretAccessKey=env.R2_BACKUP_SECRET_ACCESS_KEY;
  const encryptionKey=env.R2_BACKUP_ENCRYPTION_KEY_HEX;
  let url;
  try{url=new URL(endpoint);}catch{fail('INDEPENDENT_BACKUP_CONFIG_REQUIRED_ENDPOINT');}
  if(url.protocol!=='https:'||! /^[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/.test(url.hostname)
    ||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash)
    fail('INDEPENDENT_BACKUP_CONFIG_REQUIRED_ENDPOINT');
  if(bucket===primary.bucket||!/^fenice-paper-backup(?:-[a-z0-9-]{1,32})?$/.test(bucket||''))
    fail('INDEPENDENT_BACKUP_CONFIG_REQUIRED_BUCKET');
  if(typeof accessKeyId!=='string'||!accessKeyId.trim()||accessKeyId===primary.accessKeyId
    ||typeof secretAccessKey!=='string'||!secretAccessKey.trim()||secretAccessKey===primary.secretAccessKey)
    fail('INDEPENDENT_BACKUP_CONFIG_REQUIRED_CREDENTIALS');
  if(typeof encryptionKey!=='string'||! /^[a-f0-9]{64}$/.test(encryptionKey))
    fail('INDEPENDENT_BACKUP_CONFIG_REQUIRED_ENCRYPTION_KEY');
  return {config:{endpoint:url.origin,bucket,accessKeyId,secretAccessKey},key:Buffer.from(encryptionKey,'hex'),backupAccountSeparated:url.hostname.split('.')[0]!==new URL(primary.endpoint).hostname.split('.')[0]};
}
function encryptBackup(bytes,key,digest){
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(Buffer.from('FENICE_R2_BACKUP_V1:'+digest));
  const encrypted=Buffer.concat([cipher.update(bytes),cipher.final()]);
  return Buffer.concat([Buffer.from([1]),iv,cipher.getAuthTag(),encrypted]);
}
function decryptBackup(bytes,key,digest){
  if(!Buffer.isBuffer(bytes)||bytes.length<30||bytes.length>MAX+29||bytes[0]!==1)fail('INDEPENDENT_BACKUP_FORMAT_INVALID');
  let clear;
  try{
    const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(1,13));
    decipher.setAAD(Buffer.from('FENICE_R2_BACKUP_V1:'+digest));
    decipher.setAuthTag(bytes.subarray(13,29));
    clear=Buffer.concat([decipher.update(bytes.subarray(29)),decipher.final()]);
  }catch{fail('INDEPENDENT_BACKUP_AUTHENTICATION_FAILED');}
  if(sha(clear)!==digest)fail('INDEPENDENT_BACKUP_HASH_MISMATCH');
  return {clear,record:validate(clear)};
}
function validate(body){
  if(!Buffer.isBuffer(body)||body.length>MAX)fail('BODY_INVALID');
  let record;
  try{record=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));}catch{fail('JSON_INVALID');}
  if(record?.kind!=='ONE_GLOBAL_INDEPENDENT_PROSPECTIVE_PAPER'
    ||record.schema!==1||!iso(record.startedAt)||!/^[a-f0-9-]{36}$/.test(record.originId||'')
    ||record.historicalCredit!==0||record.liveTradingAllowed!==false
    ||record.brokerConnectivityAllowed!==false||record.ledgerSha256!==sha(encode(record.ledger)))fail('ENVELOPE_INVALID');
  const ledger=record.ledger;
  if(replayOneGlobalEodPaperLedger(ledger).valid!==true)fail('REPLAY_INVALID');
  if(ledger.events.some(e=>!iso(e.recordedAt)||e.recordedAt<record.startedAt
    ||(e.kind==='SIGNAL'&&(!iso(e.decisionAt)||e.decisionAt<record.startedAt))))fail('PRE_GENESIS_EVENT');
  return record;
}
function pack(record,ledger){return encode({...record,ledger,ledgerSha256:sha(encode(ledger))});}

/** Not connected to any route or scheduled cycle until independent integration review.
 * The start timestamp is runtime genesis metadata, NOT provider chronology proof.
 * Snapshots are immutable within R2; a separate disaster-recovery copy is still needed.
 */
export function createProspectiveR2PaperStore({env=process.env,transport,backupTransport,clock=()=>new Date().toISOString()}={}){
  const request=transport??signedTransport(env);
  async function readObject(key,condition={}){
    const out=await request({method:'GET',key,condition});
    if(out.status===404&&!Object.keys(condition).length)return null;
    if(out.status!==200||!tag(out.etag)||!Buffer.isBuffer(out.body)||out.body.length>keyLimit(key))fail('READ_REJECTED');
    if(condition['if-match']&&out.etag!==condition['if-match'])fail('VERSION_MISMATCH');
    return out;
  }
  async function readCurrent(condition={}){
    const out=await readObject(CURRENT,condition);
    return out?{...out,record:validate(out.body)}:null;
  }
  async function put(key,body,condition){
    if(Buffer.byteLength(body)>keyLimit(key))fail('BODY_LIMIT');
    const out=await request({method:'PUT',key,body,condition});
    if(![200,412].includes(out.status))fail('WRITE_AMBIGUOUS_RELOAD_REQUIRED');
    return out;
  }
  async function snapshot(body){
    const digest=sha(body),key='snapshots/'+digest+'.json';
    await put(key,body.toString('utf8'),{'if-none-match':'*'});
    const found=await readObject(key);
    if(!found||!found.body.equals(body)||sha(found.body)!==digest)fail('BACKUP_NOT_VERIFIED');
    validate(found.body);
    return digest;
  }
  function independent(){
    const {config,key,backupAccountSeparated}=backupConfig(env);
    return {request:backupTransport??signedTransport(env,{config,backup:true}),key,backupAccountSeparated};
  }
  async function readEvidenceObject(key){
    const found=await readObject(key);
    if(!found)return null;
    // Readback is not a provider upload timestamp; never attest historical proof.
    const readbackObservedAt=clock();if(!iso(readbackObservedAt))fail('CLOCK_INVALID');
    return {body:found.body,uploadedAt:null,uploadedAtSource:'R2_PRIVATE_READBACK_ONLY',readbackObservedAt};
  }
  async function createEvidenceObject(key,bytes){
    const result=await put(key,bytes,{'if-none-match':'*'});
    const found=await readEvidenceObject(key);
    if(!found||!found.body.equals(bytes))fail('EVIDENCE_READBACK_MISMATCH');
    return {created:result.status===200,verified:true,readbackObservedAt:found.readbackObservedAt};
  }
  return {
    privateAccess:true,durable:true,atomicCompareAndSwap:true,
    campaignKind:'R2_PROSPECTIVE_UNCERTIFIED',
    async readSettlementContext(){
      const found=await readObject(CONTEXT);
      if(!found)return null;
      const body=new TextDecoder('utf-8',{fatal:true}).decode(found.body);
      if(!Buffer.from(body,'utf8').equals(found.body))fail('CONTEXT_UTF8_INVALID');
      return {etag:found.etag,body};
    },
    async writeSettlementContext({expectedEtag,body}){
      if(!await readCurrent())fail('GENESIS_REQUIRED');
      if(!(expectedEtag===null||tag(expectedEtag))||typeof body!=='string'||Buffer.byteLength(body)<30||Buffer.byteLength(body)>CONTEXT_MAX)fail('CONTEXT_WRITE_INVALID');
      let parsed;try{parsed=JSON.parse(body);}catch{fail('CONTEXT_JSON_INVALID');}
      if(parsed?.kind!=='ONE_GLOBAL_PRIVATE_SETTLEMENT_CONTEXT'||parsed.authority?.liveTradingAllowed!==false||parsed.authority?.brokerConnectivityAllowed!==false)fail('CONTEXT_SCOPE_INVALID');
      const out=await put(CONTEXT,body,expectedEtag===null?{'if-none-match':'*'}:{'if-match':expectedEtag});
      if(out.status!==200)fail('CONTEXT_CAS_CONFLICT_RELOAD_REQUIRED');
      const confirmed=await readObject(CONTEXT);
      // R2 content-derived ETags may stay unchanged on identical conditional PUTs.
      if(!confirmed||!confirmed.body.equals(Buffer.from(body)))fail('CONTEXT_READBACK_UNCONFIRMED');
      return {committed:true,etag:confirmed.etag};
    },
    async createResearchObservation({hash,body}){
      if(!await readCurrent())fail('GENESIS_REQUIRED');
      if(!hashOk(hash)||typeof body!=='string'||Buffer.byteLength(body)<20||Buffer.byteLength(body)>1_500_000)fail('OBSERVATION_INVALID');
      let parsed;try{parsed=JSON.parse(body);}catch{fail('OBSERVATION_JSON_INVALID');}
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||parsed.liveTradingAllowed!==false)fail('OBSERVATION_SCOPE_INVALID');
      return createEvidenceObject('evidence/observations/'+hash+'.json',Buffer.from(body));
    },
    // Explicit prospective-only proof; never supply it to the legacy forensic path.
    async verifyProspectivePrecommitObservation({hash,body}={}){
      if(!hashOk(hash)||typeof body!=='string'||Buffer.byteLength(body)<20||Buffer.byteLength(body)>1_500_000)fail('OBSERVATION_INVALID');
      const current=await readCurrent();
      if(!current)fail('GENESIS_REQUIRED');
      const found=await readEvidenceObject('evidence/observations/'+hash+'.json');
      if(!found||!found.body.equals(Buffer.from(body)))fail('EVIDENCE_READBACK_MISMATCH');
      if(found.readbackObservedAt<current.record.startedAt)fail('PRECOMMIT_READBACK_BEFORE_GENESIS');
      const proof={provenance:'R2_PRIVATE_READBACK_ONLY',readbackObservedAt:found.readbackObservedAt,
        historicalChronologyProven:false,originId:current.record.originId,observationSha256:sha(found.body)};
      assertR2ProspectiveClockAfterReadback({proof,recordedAt:clock()});
      return proof;
    },
    async readResearchObservation(hash){
      if(!hashOk(hash))fail('EVIDENCE_HASH_INVALID');
      return readEvidenceObject('evidence/observations/'+hash+'.json');
    },
    async createSourceArtifact({hash,body,contentType}){
      if(!await readCurrent())fail('GENESIS_REQUIRED');
      if(!hashOk(hash)||!Buffer.isBuffer(body)||body.length<20||body.length>RAW_MAX||sha(body)!==hash||!['application/zip','text/csv','text/html','application/pdf','application/json'].includes(contentType))fail('RAW_ARTIFACT_INVALID');
      return createEvidenceObject('evidence/raw/'+hash,body);
    },
    async readSourceArtifact(hash){
      if(!hashOk(hash))fail('EVIDENCE_HASH_INVALID');
      const found=await readEvidenceObject('evidence/raw/'+hash);
      if(found&&sha(found.body)!==hash)fail('RAW_ARTIFACT_HASH_MISMATCH');
      return found;
    },
    // Explicit operation; does not initialize, append or modify the primary.
    async backupCurrent(){
      const {request:external,key,backupAccountSeparated}=independent();
      const current=await readCurrent();
      if(!current)fail('GENESIS_REQUIRED');
      const digest=sha(current.body),objectKey='encrypted/'+digest+'.bin';
      const local=await readObject('snapshots/'+digest+'.json');
      if(!local||!local.body.equals(current.body))fail('CURRENT_SNAPSHOT_NOT_VERIFIED');
      const putResult=await external({method:'PUT',key:objectKey,body:encryptBackup(current.body,key,digest),condition:{'if-none-match':'*'}});
      if(![200,412].includes(putResult.status))fail(putResult.status===401||putResult.status===403?'INDEPENDENT_BACKUP_WRITE_AUTH_DENIED':putResult.status===404?'INDEPENDENT_BACKUP_BUCKET_NOT_FOUND':'INDEPENDENT_BACKUP_WRITE_UNCONFIRMED');
      const found=await external({method:'GET',key:objectKey,condition:{}});
      if(found.status!==200)fail(found.status===401||found.status===403?'INDEPENDENT_BACKUP_READ_AUTH_DENIED':'INDEPENDENT_BACKUP_READ_FAILED');
      const restored=decryptBackup(found.body,key,digest);
      if(!restored.clear.equals(current.body))fail('INDEPENDENT_BACKUP_CONTENT_MISMATCH');
      const latest=await readCurrent();
      if(!latest||!latest.body.equals(current.body))fail('INDEPENDENT_BACKUP_STALE_RETRY');
      return {verified:true,backupAccountSeparated,digest,eventCount:restored.record.ledger.events.length,
        startedAt:restored.record.startedAt,historicalCredit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false};
    },
    // Isolated recovery rehearsal, no writes to either storage backend.
    async verifyIndependentBackup(digest){
      if(typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest))fail('BACKUP_DIGEST_INVALID');
      const {request:external,key,backupAccountSeparated}=independent();
      const found=await external({method:'GET',key:'encrypted/'+digest+'.bin',condition:{}});
      if(found.status!==200)fail(found.status===401||found.status===403?'INDEPENDENT_BACKUP_READ_AUTH_DENIED':'INDEPENDENT_BACKUP_READ_FAILED');
      const {record}=decryptBackup(found.body,key,digest);
      return {verified:true,backupAccountSeparated,eventCount:record.ledger.events.length,startedAt:record.startedAt,
        historicalCredit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false};
    },
    async initialize(){
      const current=await readCurrent();
      if(current){await snapshot(current.body);return {created:false,originId:current.record.originId,startedAt:current.record.startedAt};}
      const startedAt=clock();if(!iso(startedAt))fail('CLOCK_INVALID');
      const initial=newOneGlobalEodPaperLedger();
      const body=pack({kind:'ONE_GLOBAL_INDEPENDENT_PROSPECTIVE_PAPER',schema:1,originId:randomUUID(),startedAt,
        historicalCredit:0,brokerConnectivityAllowed:false,liveTradingAllowed:false},initial);
      const out=await put(CURRENT,body,{'if-none-match':'*'});
      const found=await readCurrent();
      if(!found||(out.status===200&&!found.body.equals(Buffer.from(body))))fail('GENESIS_READBACK_FAILED');
      await snapshot(found.body);
      return {created:out.status===200,originId:found.record.originId,startedAt:found.record.startedAt};
    },
    async read(){
      const found=await readCurrent();
      return found?{etag:found.etag,body:encode(found.record.ledger),originId:found.record.originId,startedAt:found.record.startedAt}:null;
    },
    async compareAndSwap({expectedEtag,body,contentType}){
      if(!tag(expectedEtag)||typeof body!=='string'||Buffer.byteLength(body)>MAX||contentType!=='application/json')fail('CAS_ARGUMENTS_INVALID');
      const previous=await readCurrent({'if-match':expectedEtag});
      if(!previous)fail('GENESIS_REQUIRED');
      let ledger;try{ledger=JSON.parse(body);}catch{fail('NEXT_JSON_INVALID');}
      const before=previous.record.ledger;
      if(!Array.isArray(ledger?.events)||ledger.events.length!==before.events.length+1
        ||!same(ledger.events.slice(0,-1),before.events)||ledger.events.at(-1)?.prevHash!==before.lastHash)fail('NOT_SINGLE_APPEND');
      const next=pack(previous.record,ledger);
      validate(Buffer.from(next));
      await snapshot(previous.body);
      const out=await put(CURRENT,next,{'if-match':expectedEtag});
      if(out.status!==200)fail('CAS_CONFLICT_RELOAD_REQUIRED');
      const confirmed=await readCurrent();
      if(!confirmed||!confirmed.body.equals(Buffer.from(next))||confirmed.etag===expectedEtag)fail('CAS_READBACK_UNCONFIRMED');
      await snapshot(confirmed.body);
      return {committed:true,etag:confirmed.etag};
    },
    // Non-mutating recovery rehearsal: compare the current ledger against its
    // exact immutable snapshot, then independently replay the recovered bytes.
    // This proves same-bucket recoverability, not disaster recovery.
    async verifyCurrentSnapshot(){
      const current=await readCurrent();
      if(!current)return null;
      const digest=sha(current.body);
      const backup=await readObject('snapshots/'+digest+'.json');
      if(!backup||sha(backup.body)!==digest||!backup.body.equals(current.body))
        fail('CURRENT_SNAPSHOT_NOT_VERIFIED');
      const restored=validate(backup.body);
      return {verified:true,eventCount:restored.ledger.events.length,
        startedAt:restored.startedAt,historicalCredit:0,
        brokerConnectivityAllowed:false,liveTradingAllowed:false};
    },
    async verifySnapshot(digest){
      if(typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest))fail('BACKUP_DIGEST_INVALID');
      const found=await readObject('snapshots/'+digest+'.json');
      if(!found||sha(found.body)!==digest)fail('BACKUP_HASH_MISMATCH');
      const record=validate(found.body);
      return {originId:record.originId,startedAt:record.startedAt,eventCount:record.ledger.events.length,verified:true};
    }
  };
}
