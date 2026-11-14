import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {newOneGlobalEodPaperLedger,recordOneGlobalEodSignal} from '../lib/trading/one-global-eod-paper.mjs';
import {importOneGlobalPrivateInputs as put,inspectOneGlobalPrivateInputs as inspect} from '../lib/trading/one-global-private-input-intake.mjs';
import {handleOneGlobalPrivateInputRequest as http} from '../lib/trading/one-global-private-input-http.mjs';
import {createVercelPrivateEodBlobStore} from '../lib/trading/one-global-vercel-private-blob-store.mjs';
// Synthetic originals only; no user consent, credential or original ledger here.
const now='2026-11-14T18:00:00.000Z',sha=x=>createHash('sha256').update(x).digest('hex');
const authority={mode:'ONE_GLOBAL_FORWARD_EOD_PRIVATE_PAPER',ownerConsent:true,approvedForVirtualSimulation:true,
  approvalEvidence:{kind:'EXPLICIT_OWNER_CONSENT',reviewedCommit:'a'.repeat(40)},
  executionMethod:'NEXT_COMPLETED_SESSION_CLOSE_PLUS_IMPACT',allowBackfill:false,liveTradingAllowed:false,
  brokerConnectivityAllowed:false,realBrokerOrdersAllowed:false,strategyPerformanceCertified:false,
  approvedAt:'2026-11-12T20:00:00.000Z',expiresAt:'2026-12-01T00:00:00.000Z'};
const raw='  '+JSON.stringify(authority,null,2)+'\n\n'; // exact whitespace/newlines must survive
const original=recordOneGlobalEodSignal({previousLedger:newOneGlobalEodPaperLedger(),nowIso:'2026-11-12T22:00:00.000Z',
  signal:{signalId:'synthetic-private-intake-original',key:'XNAS:FIXTURE',mic:'XNAS',currency:'USD',side:'BUY',
    decisionAt:'2026-11-12T22:00:00.000Z',referenceSessionDate:'2026-11-12',referenceCloseAt:'2026-11-12T21:00:00.000Z',
    referencePublishedAt:'2026-11-12T21:30:00.000Z',sourceSnapshotHash:'b'.repeat(64),maxNotionalEuro:50,strategyReason:'UPTREND_CONFIRMATION'}}).ledger;
function memory(){
  let context=null,etag=null;const journal=JSON.stringify(original);
  return {privateAccess:true,durable:true,atomicCompareAndSwap:true,writes:0,archives:[],
    async read(){return {etag:'"original"',body:journal};},
    async readSettlementContext(){return context===null?null:{etag,body:context};},
    async createResearchObservation(x){this.archives.push(x);return {created:true};},
    async writeSettlementContext(x){assert.equal(x.expectedEtag,etag);context=x.body;etag='"context-'+(++this.writes)+'"';return {committed:true,etag};},
    async compareAndSwap(){throw Error('IMPORT_MUST_NEVER_WRITE_JOURNAL');},
    get context(){return context===null?null:JSON.parse(context);},get etag(){return etag;},get journal(){return journal;}};
}
const request=(bytes=raw,expectedEtag=null)=>({kind:'ORIGINAL_OWNER_PAPER_CONSENT',documentBase64:Buffer.from(bytes).toString('base64'),expectedEtag});
const store=memory(),before=store.journal;
assert.equal((await inspect({storage:store,nowIso:now})).contextPresent,false);
const imported=await put({storage:store,input:request(),nowIso:now});
assert.equal(imported.state,'ORIGINAL_PRIVATE_INPUTS_IMPORTED');assert.equal(imported.originalConsentValid,true);
assert.equal(imported.originalDocumentCount,1);assert.equal(imported.paperFillsCreated,0);assert.equal(imported.virtualFillCount,0);
assert.equal(imported.eligiblePendingSignals,0);assert.deepEqual(store.context.markets,[]);assert.deepEqual(store.context.sessions,[]);
assert.deepEqual(store.context.authority,authority);assert.equal(store.context.authority.approvedAt,authority.approvedAt);
assert.equal(Buffer.from(store.context.documents[0].bodyBase64,'base64').toString('utf8'),raw);
assert.equal(store.context.authorityEvidenceSha256,sha(raw));assert.equal(store.journal,before);
const archive=JSON.parse(store.archives[0].body);assert.equal(archive.originalFileSha256,sha(raw));
assert.equal(Buffer.from(archive.originalFileBase64,'base64').toString('utf8'),raw);
assert.doesNotMatch(JSON.stringify(imported),/bodyBase64|reviewedCommit|authorityEvidenceSha256|sourceSnapshotHash/);
await assert.rejects(put({storage:store,input:request(),nowIso:now}),/INPUTS_CHANGED_RELOAD_REQUIRED/);
const repeat=await put({storage:store,input:request(raw,store.etag),nowIso:now});
assert.equal(repeat.state,'ORIGINAL_CONSENT_ALREADY_CONNECTED');assert.equal(store.writes,1);
const expanded=structuredClone(store.context);
const terms=Buffer.from('SYNTHETIC TEST ONLY provider usage rights original');
expanded.documents.push({kind:'ORIGINAL_PROVIDER_USAGE_RIGHTS',sha256:sha(terms),bodyBase64:terms.toString('base64')});
const complete={kind:'SETTLEMENT_CONTEXT',documentBase64:Buffer.from(JSON.stringify(expanded)).toString('base64'),expectedEtag:store.etag};
await put({storage:store,input:complete,nowIso:now});assert.equal(store.context.documents.length,2);assert.equal(store.journal,before);
await put({storage:store,input:request(raw,store.etag),nowIso:now});assert.equal(store.context.documents.length,2,'bare consent never discards existing provider originals');
const erased=structuredClone(expanded);erased.documents.pop();
await assert.rejects(put({storage:store,input:{...complete,documentBase64:Buffer.from(JSON.stringify(erased)).toString('base64'),expectedEtag:store.etag},nowIso:now}),/PREVIOUS_ORIGINAL_DOCUMENTS_MUST_BE_PRESERVED/);
for(const changed of [request(JSON.stringify({...authority,ownerConsent:false})),request(JSON.stringify({...authority,expiresAt:'2026-11-13T00:00:00.000Z'})),
  {...request(),documentBase64:'not valid base64'}, {...request(),marketEvidence:{}}, {...request(),kind:'SETTLE'}]){
  const no=memory();await assert.rejects(put({storage:no,input:changed,nowIso:now}));assert.equal(no.writes,0);assert.equal(no.journal,before);
}
const denied=memory();denied.createResearchObservation=async()=>({created:false});
await assert.rejects(put({storage:denied,input:request(),nowIso:now}),/ARCHIVE_NOT_CONFIRMED/);assert.equal(denied.writes,0);
const ambiguous=memory(),writer=ambiguous.writeSettlementContext.bind(ambiguous);
ambiguous.writeSettlementContext=async x=>{await writer(x);throw Error('lost response');};
await assert.rejects(put({storage:ambiguous,input:request(),nowIso:now}),/WRITE_UNCONFIRMED/);
assert.equal((await inspect({storage:ambiguous,nowIso:now})).originalConsentValid,true);assert.equal(ambiguous.journal,before);

let factoryCalls=0;
const opts={production:true,authorized:true,sameOrigin:true,clock:()=>now,storageFactory:async()=>{factoryCalls++;return memory();}};
const req=(body=request(),extra={})=>new Request('https://fenice.test/api/paper/one-global-private-inputs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),...extra});
for(const [delta,status] of [[{authorized:false},401],[{production:false},403],[{sameOrigin:false},403]]){
  const response=await http(req(),{...opts,...delta});assert.equal(response.status,status);assert.equal(factoryCalls,0);
}
assert.equal((await http(req({}, {headers:{'Content-Type':'text/plain'}}),opts)).status,400);assert.equal(factoryCalls,0);
assert.equal((await http(req({}, {body:'x'.repeat(750001)}),opts)).status,409);assert.equal(factoryCalls,0);
const response=await http(req(),opts);assert.equal(response.status,200);assert.equal((await response.json()).paperFillsCreated,0);
assert.equal(response.headers.get('cache-control'),'private, no-store, max-age=0');
const secretFailure=await http(req(),{...opts,storageFactory:async()=>{throw Error('SECRET_PRIVATE_SOURCE_BODY');}});
assert.doesNotMatch(await secretFailure.text(),/SECRET_PRIVATE_SOURCE_BODY/);

let contextBody=null,contextEtag=null;
const sdk={async get(path,options){assert.equal(path,'fenice/one-global/private-eod/settlement-inputs.json');assert.equal(options.access,'private');
  if(contextBody===null)return null;return {statusCode:200,blob:{etag:contextEtag},stream:new Response(contextBody).body};},
 async put(path,body,options){assert.equal(path,'fenice/one-global/private-eod/settlement-inputs.json');assert.equal(options.access,'private');
  assert.equal(options.addRandomSuffix,false);assert.equal(options.allowOverwrite,contextEtag!==null);
  assert.equal(options.ifMatch,contextEtag??undefined);contextBody=body;contextEtag='"real-cas-contract"';return {etag:contextEtag};}};
const blob=await createVercelPrivateEodBlobStore({token:'',storeId:'store_SYNTHETIC',sdk});
await blob.writeSettlementContext({expectedEtag:null,body:JSON.stringify(expanded)});
await blob.writeSettlementContext({expectedEtag:contextEtag,body:JSON.stringify(expanded)});
assert.equal((await blob.readSettlementContext()).etag,contextEtag);
const route=readFileSync(new URL('../app/api/paper/one-global-private-inputs/route.js',import.meta.url),'utf8');
assert.match(route,/verifyFeniceOwnerSession/);assert.match(route,/feniceSameOrigin/);assert.match(route,/pinOneGlobalRecoveredOriginalStore/);
assert.doesNotMatch(route,/settleOneGlobalEodSignal|newOneGlobalEodPaperLedger|createFeniceOwnerSession/);
console.log('PASS private input intake: exact original bytes, genuine-schema consent only, private archive/readback, create-only+ETag updates, prior documents preserved, idempotency/lost responses, no journal mutation/FILL, owner/production/CSRF/body gates and redaction. All fixtures SYNTHETIC.');
