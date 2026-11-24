// Server-side public research projection ONLY. Never reads private Blob,
// broker data, PAPER settlement inputs or credential-bearing endpoints.
import {createHash} from 'node:crypto';

const ROOT='https://api.github.com/repos/romitoorazio/fenice-investment-system/contents/data/';
const FILES={
  committee:'investment-committee.json',
  quality:'intelligence-quality.json',
  sources:'global-source-health.json',
};
const LIMITS={committee:800_000,quality:500_000,sources:700_000};
const MAX_AGE_MS=36*60*60*1000;
const EMPTY=()=>({committee:{},quality:{},sources:{}});
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const short=(v,max=260)=>typeof v==='string'?v.slice(0,max):undefined;
const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:undefined;
const iso=(v,now)=>{
  if(typeof v!=='string')return false;
  const t=Date.parse(v);
  return Number.isFinite(t)&&new Date(t).toISOString()===v
    &&t<=now&&now-t<=MAX_AGE_MS;
};
const code=v=>typeof v==='string'&&/^[A-Z][A-Z0-9_ ]{1,49}$/.test(v);
const lines=v=>Array.isArray(v)?v.filter(s=>typeof s==='string')
  .slice(0,3).map(s=>s.slice(0,260)):[];

function validCommittee(value,now){
  return record(value)&&iso(value.generatedAt,now)
    &&code(value.executionGate)&&code(value.sourceGate)
    &&typeof value.marketRegime==='string'&&value.marketRegime.length<=100
    &&Number.isInteger(value.buyCandidateCount)&&value.buyCandidateCount>=0
    &&Array.isArray(value.allDecisions)&&value.allDecisions.length<=300
    &&value.allDecisions.every(a=>record(a)
      &&typeof a.symbol==='string'&&/^[A-Z0-9][A-Z0-9._:/-]{0,39}$/.test(a.symbol)
      &&code(a.decision)&&(!('terminalDecision' in a)||code(a.terminalDecision)));
}
function validQuality(value,now){
  return record(value)&&iso(value.generatedAt,now)
    &&typeof value.intelligenceConfidence==='number'
    &&Number.isFinite(value.intelligenceConfidence)
    &&value.intelligenceConfidence>=0&&value.intelligenceConfidence<=100;
}
function validSources(value,now){
  const c=value?.critical;
  return record(value)&&iso(value.generatedAt,now)&&record(c)
    &&code(c.gate)&&Number.isInteger(c.ready)&&Number.isInteger(c.total)
    &&c.total>=0&&c.ready>=0&&c.ready<=c.total
    &&Number.isInteger(value.totalSources)&&value.totalSources>=0
    &&record(value.summary)&&Number.isInteger(value.summary.healthy)
    &&value.summary.healthy>=0&&value.summary.healthy<=value.totalSources;
}
function projectAsset(a){
  const gap=a.buyGapEvidence;
  return {
    symbol:a.symbol,name:short(a.name,120),rank:finite(a.rank),
    decision:a.decision,terminalDecision:short(a.terminalDecision,50),
    committeeScore:finite(a.committeeScore),confidence:finite(a.confidence),
    riskScore:finite(a.riskScore),currency:short(a.currency,12),
    bullCase:lines(a.bullCase),bearCase:lines(a.bearCase),
    invalidation:lines(a.invalidation),reviewTriggers:lines(a.reviewTriggers),
    entryPlan:record(a.entryPlan)?{
      orderMode:short(a.entryPlan.orderMode,32),
      firstTrancheEuro:finite(a.entryPlan.firstTrancheEuro),
      maxEntryPrice:finite(a.entryPlan.maxEntryPrice)??null,
    }:undefined,
    buyGapEvidence:record(gap)?{
      scope:short(gap.scope,40),status:short(gap.status,40),
      paperExecutionEligible:gap.paperExecutionEligible===true,
      gaps:Array.isArray(gap.gaps)?gap.gaps.slice(0,12).map(g=>({
        code:short(g?.code,65),
      })):[],
    }:undefined,
  };
}
function project(data){
  const c=data.committee,q=data.quality,s=data.sources;
  return {
    committee:{
      generatedAt:c.generatedAt,executionGate:c.executionGate,
      dataQuality:finite(c.dataQuality),proposedFirstTrancheEuro:finite(c.proposedFirstTrancheEuro),
      marketRegime:c.marketRegime,sourceGate:c.sourceGate,
      buyCandidateCount:c.buyCandidateCount,
      allDecisions:c.allDecisions.map(projectAsset),
    },
    quality:{generatedAt:q.generatedAt,intelligenceConfidence:q.intelligenceConfidence},
    sources:{
      generatedAt:s.generatedAt,totalSources:s.totalSources,
      gate:short(s.gate,32),
      critical:{gate:s.critical.gate,ready:s.critical.ready,total:s.critical.total},
      summary:{healthy:s.summary.healthy,degraded:finite(s.summary.degraded),
        failed:finite(s.summary.failed),unconfigured:finite(s.summary.unconfigured)},
    },
  };
}
async function boundedText(response,maxBytes){
  const header=response.headers?.get('content-length');
  if(header!==null&&header!==undefined){
    const len=Number(header);
    if(!Number.isFinite(len)||len<0||len>maxBytes)throw Error('SOURCE_SIZE');
  }
  if(!response.body?.getReader){
    const body=await response.text();
    if(Buffer.byteLength(body,'utf8')>maxBytes)throw Error('SOURCE_SIZE');
    return body;
  }
  const reader=response.body.getReader();
  const chunks=[];let length=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      length+=value.byteLength;
      if(length>maxBytes)throw Error('SOURCE_SIZE');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  }catch(e){
    try{await reader.cancel();}catch{}
    throw e;
  }
}
async function readPublicFile(kind,fetcher){
  const name=FILES[kind],limit=LIMITS[kind];
  const response=await fetcher(ROOT+name,{
    cache:'no-store',redirect:'error',
    headers:{Accept:'application/vnd.github+json'},
    signal:AbortSignal.timeout(3500),
  });
  if(!response?.ok)throw Error('SOURCE_UNAVAILABLE');
  const envelope=JSON.parse(await boundedText(response,limit));
  if(!record(envelope)||envelope.type!=='file'
    ||envelope.path!=='data/'+name||envelope.encoding!=='base64'
    ||typeof envelope.sha!=='string'||!/^[a-f0-9]{40}$/.test(envelope.sha)
    ||typeof envelope.content!=='string')throw Error('SOURCE_PROVENANCE');
  const encoded=envelope.content.replace(/\s/g,'');
  if(!encoded||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw Error('SOURCE_ENCODING');
  const bytes=Buffer.from(encoded,'base64');
  if(bytes.length>limit||bytes.length!==envelope.size)throw Error('SOURCE_SIZE');
  const sha=createHash('sha1').update('blob '+bytes.length+'\0')
    .update(bytes).digest('hex');
  if(sha!==envelope.sha)throw Error('SOURCE_INTEGRITY');
  return JSON.parse(bytes.toString('utf8'));
}
/** No build-time fallback: an unavailable or invalid current public source
 * cannot make an old committee verdict appear fresh. Three fixed GETs only.
 */
export async function readCurrentPublicCommitteeContext({nowMs=Date.now(),fetcher=fetch}={}){
  if(!Number.isFinite(nowMs)||nowMs<0)return EMPTY();
  try{
    const [committee,quality,sources]=await Promise.all(
      Object.keys(FILES).map(kind=>readPublicFile(kind,fetcher)));
    if(!validCommittee(committee,nowMs)||!validQuality(quality,nowMs)
       ||!validSources(sources,nowMs))return EMPTY();
    return project({committee,quality,sources});
  }catch{
    return EMPTY();
  }
}
