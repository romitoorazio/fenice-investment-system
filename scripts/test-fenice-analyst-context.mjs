import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readCurrentPublicCommitteeContext} from '../lib/ui/fenice-analyst-context-runtime.mjs';
import {answerFeniceResearch} from '../lib/ui/fenice-grounded-analyst.ts';

const now=Date.parse('2026-11-23T22:00:00.000Z');
const committee={
  generatedAt:'2026-11-23T21:30:00.000Z',executionGate:'ATTENDERE',
  marketRegime:'PROTEGGERE CAPITALE',sourceGate:'GREEN',buyCandidateCount:0,
  privateSecret:'NEVER_ECHO_THIS_SECRET',allDecisions:[{
    symbol:'ASML',name:'ASML Holding',decision:'OSSERVA',
    terminalDecision:'ATTENDI',committeeScore:70,confidence:91,riskScore:52,
    privateSecret:'HIDDEN_VALUE',bullCase:['Supportato da fonti pubbliche'],
    entryPlan:{orderMode:'NESSUN ORDINE',firstTrancheEuro:0},
  }],
};
const quality={generatedAt:'2026-11-23T21:29:00.000Z',intelligenceConfidence:95};
const sources={generatedAt:'2026-11-23T21:25:00.000Z',totalSources:21,gate:'GREEN',
  critical:{gate:'GREEN',ready:9,total:9},summary:{healthy:20}};
const data={committee,quality,sources};
const filename={committee:'investment-committee.json',
  quality:'intelligence-quality.json',sources:'global-source-health.json'};
function githubEnvelope(kind,payload){
  const bytes=Buffer.from(typeof payload==='string'?payload:JSON.stringify(payload));
  const sha=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  return {type:'file',path:'data/'+filename[kind],size:bytes.length,sha,
    encoding:'base64',content:bytes.toString('base64')};
}
function response(object,{ok=true,length}={}){
  const raw=JSON.stringify(object);
  return {ok,headers:{get:()=>String(length??Buffer.byteLength(raw))},
    text:async()=>raw};
}
const read=(overrides={},config={})=>{
  const fn=async (url,opts)=>{
    assert.ok(url.startsWith('https://api.github.com/repos/romitoorazio/fenice-investment-system/contents/data/'));
    assert.equal(opts.cache,'no-store');
    assert.equal(opts.redirect,'error');
    assert.equal(opts.headers.Accept,'application/vnd.github+json');
    const name=url.split('/').at(-1),kind=Object.keys(filename).find(k=>filename[k]===name);
    assert.ok(kind);
    if(config.offline)throw Error('offline');
    const payload=Object.hasOwn(overrides,kind)?overrides[kind]:data[kind];
    const envelope=githubEnvelope(kind,payload);
    if(config.badSha&&kind==='committee')envelope.sha='0'.repeat(40);
    if(config.badPath&&kind==='committee')envelope.path='private-ledger.json';
    return response(envelope,{ok:!(config.unavailable&&kind==='committee'),
      length:config.oversize&&kind==='committee'?2_000_000:undefined});
  };
  return readCurrentPublicCommitteeContext({nowMs:config.now??now,fetcher:fn});
};
const first=await read();
assert.equal(first.committee.allDecisions[0].decision,'OSSERVA');
assert.equal(first.quality.intelligenceConfidence,95);
assert.equal(first.sources.critical.ready,9);
assert.ok(!JSON.stringify(first).includes('NEVER_ECHO_THIS_SECRET'));
assert.ok(!JSON.stringify(first).includes('HIDDEN_VALUE'));
const second=await read({committee:{...committee,generatedAt:'2026-11-23T21:55:00.000Z',
  allDecisions:[{symbol:'ASML',decision:'EVITA',terminalDecision:'ATTENDI'}]}});
assert.equal(second.committee.allDecisions[0].decision,'EVITA',
  'the same deployment must read the newer public verdict on the next request');
assert.equal(first.committee.allDecisions[0].decision,'OSSERVA',
  'a new read must not retroactively change original committee decisions');
for(const bad of [
  {committee:{...committee,generatedAt:'2026-11-21T00:00:00.000Z'}},
  {committee:{...committee,generatedAt:'2026-11-24T00:00:00.000Z'}},
  {committee:'{invalid json'},
  {committee:{...committee,allDecisions:[{symbol:'BAD',decision:5}]}},
  {quality:{...quality,generatedAt:'not-a-date'}},
  {sources:{...sources,critical:{gate:'GREEN',ready:20,total:9}}},
]){
  const got=await read(bad);
  assert.deepEqual(got,{committee:{},quality:{},sources:{}},
    'invalid, stale or future public snapshots must fail closed');
}
for(const configuration of [
  {offline:true},{unavailable:true},{oversize:true},{badSha:true},{badPath:true},
  {now:Number.NaN},
]){
  assert.deepEqual(await read({},configuration),{committee:{},quality:{},sources:{}});
}
const context={...first,campaign:{},calibration:{}};
const reply=answerFeniceResearch('ASML',context,now);
assert.equal(reply.verdict,'ATTENDERE');
assert.equal(reply.brokerOrderAllowed,false);
assert.equal(reply.providerCalls,0);
assert.equal(reply.generativeModelConnected,false);
const denied=answerFeniceResearch('ASML',
  {...context,...await read({committee:'{invalid json'})},now);
assert.equal(denied.sourceTimestamp,null);
assert.equal(denied.evidenceQualityVerified,false);
assert.equal(denied.brokerOrderAllowed,false);
// Original entry-point checks remain in the parent regression script.
console.log('PASS current public committee: changed verdict between requests, SHA integrity, schema, provenance, age, privacy and fail-closed safety');
