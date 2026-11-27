/** Independent prospective PAPER storage. Not a historical migration or LIVE adapter. */
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {request as httpsRequest} from 'node:https';
import {resolvePrivateR2Config} from './one-global-r2-config.mjs';
import {newOneGlobalEodPaperLedger,replayOneGlobalEodPaperLedger} from './one-global-eod-paper.mjs';

const PREFIX='fenice/one-global/prospective-paper/';
const CURRENT='ledger.json';
const MAX=1_600_000;
const sha=b=>createHash('sha256').update(b).digest('hex');
const hmac=(k,b)=>createHmac('sha256',k).update(b).digest();
const fail=code=>{throw Error('R2_PROSPECTIVE_'+code);};
const iso=s=>typeof s==='string'&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
const tag=s=>typeof s==='string'&&/^"[A-Za-z0-9._:+/=~-]{1,254}"$/.test(s);
const encode=o=>JSON.stringify(o)+'\n';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// Direct HTTPS avoids framework removal of the provider's opaque version tag.
// No redirects, arbitrary paths, public access, DELETE or unconditional PUT.
function signedTransport(env){
  const c=resolvePrivateR2Config(env);
  return async ({method,key,body='',condition={}})=>{
    if(!/^(ledger\.json|snapshots\/[a-f0-9]{64}\.json)$/.test(key))fail('KEY_INVALID');
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
        'accept-encoding':'identity',...(method==='PUT'?{'content-type':'application/json','content-length':Buffer.byteLength(body)}:{})}},res=>{
        let size=0;const chunks=[];
        res.on('error',()=>reject(Error('R2_PROSPECTIVE_TRANSPORT_FAILED')));
        res.on('aborted',()=>reject(Error('R2_PROSPECTIVE_TRANSPORT_FAILED')));
        res.on('data',chunk=>{size+=chunk.length;if(size>MAX){res.destroy(Error('R2_PROSPECTIVE_BODY_LIMIT'));return;}chunks.push(chunk);});
        res.on('end',()=>{const tags=res.headersDistinct.etag??[];
          resolve({status:res.statusCode,etag:tags.length===1?tags[0]:null,body:Buffer.concat(chunks)});});
      });
      req.on('error',()=>reject(Error('R2_PROSPECTIVE_TRANSPORT_FAILED')));
      req.end(method==='PUT'?body:undefined);
    });
  };
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
export function createProspectiveR2PaperStore({env=process.env,transport,clock=()=>new Date().toISOString()}={}){
  const request=transport??signedTransport(env);
  async function readObject(key,condition={}){
    const out=await request({method:'GET',key,condition});
    if(out.status===404&&!Object.keys(condition).length)return null;
    if(out.status!==200||!tag(out.etag)||!Buffer.isBuffer(out.body)||out.body.length>MAX)fail('READ_REJECTED');
    if(condition['if-match']&&out.etag!==condition['if-match'])fail('VERSION_MISMATCH');
    return out;
  }
  async function readCurrent(condition={}){
    const out=await readObject(CURRENT,condition);
    return out?{...out,record:validate(out.body)}:null;
  }
  async function put(key,body,condition){
    if(Buffer.byteLength(body)>MAX)fail('BODY_LIMIT');
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
  return {
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
    async verifySnapshot(digest){
      if(typeof digest!=='string'||!/^[a-f0-9]{64}$/.test(digest))fail('BACKUP_DIGEST_INVALID');
      const found=await readObject('snapshots/'+digest+'.json');
      if(!found||sha(found.body)!==digest)fail('BACKUP_HASH_MISMATCH');
      const record=validate(found.body);
      return {originId:record.originId,startedAt:record.startedAt,eventCount:record.ledger.events.length,verified:true};
    }
  };
}
