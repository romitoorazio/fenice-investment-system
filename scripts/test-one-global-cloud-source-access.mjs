import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inspectOneGlobalCloudSourceAccess as inspect} from '../lib/trading/one-global-cloud-source-access.mjs';
import {runOneGlobalCloudPaperCycle} from '../lib/trading/one-global-cloud-paper-cycle.mjs';
import {newOneGlobalEodPaperLedger,recordOneGlobalEodSignal} from '../lib/trading/one-global-eod-paper.mjs';
const now='2026-11-14T20:00:00.000Z',sha=x=>createHash('sha256').update(x).digest('hex');
const authority={mode:'ONE_GLOBAL_FORWARD_EOD_PRIVATE_PAPER',ownerConsent:true,approvedForVirtualSimulation:true,
  approvalEvidence:{kind:'EXPLICIT_OWNER_CONSENT',reviewedCommit:'a'.repeat(40)},
  executionMethod:'NEXT_COMPLETED_SESSION_CLOSE_PLUS_IMPACT',allowBackfill:false,liveTradingAllowed:false,
  brokerConnectivityAllowed:false,realBrokerOrdersAllowed:false,strategyPerformanceCertified:false,
  approvedAt:'2026-11-12T20:00:00.000Z',expiresAt:'2026-12-01T00:00:00.000Z'};
const bytes=Buffer.from(JSON.stringify(authority)),consentDoc={kind:'ORIGINAL_OWNER_PAPER_CONSENT',sha256:sha(bytes),bodyBase64:bytes.toString('base64')};
const context={kind:'ONE_GLOBAL_PRIVATE_SETTLEMENT_CONTEXT',authority,authorityEvidenceSha256:consentDoc.sha256,
  documents:[consentDoc],markets:[],sessions:[]};
const ledger=recordOneGlobalEodSignal({previousLedger:newOneGlobalEodPaperLedger(),nowIso:'2026-11-12T22:00:00.000Z',
  signal:{signalId:'synthetic-source-access-original',key:'XNAS:FIXTURE',mic:'XNAS',currency:'USD',side:'BUY',
    decisionAt:'2026-11-12T22:00:00.000Z',referenceSessionDate:'2026-11-12',referenceCloseAt:'2026-11-12T21:00:00.000Z',
    referencePublishedAt:'2026-11-12T21:30:00.000Z',sourceSnapshotHash:'b'.repeat(64),maxNotionalEuro:50,strategyReason:'UPTREND_CONFIRMATION'}}).ledger;
function memory(){return {privateAccess:true,durable:true,atomicCompareAndSwap:true,archives:[],context:structuredClone(context),contextWrites:0,
  async read(){return {etag:'"original"',body:JSON.stringify(ledger)};},
  async readSettlementContext(){return this.context?{etag:'"context-'+this.contextWrites+'"',body:this.contextBody??JSON.stringify(this.context)}:null;},
  async createResearchObservation(x){this.archives.push(x);return {created:true};},
  // Synthetic stub for the settlement HEAD-backed read-only proof. The
  // source-access research flow cannot turn these records into a real FILL.
  async readResearchObservation(hash){
    const row=this.archives.find(x=>x.hash===hash);
    return row?{body:Buffer.from(row.body),uploadedAt:new Date('2026-11-14T19:59:59.000Z'),
      uploadedAtSource:'VERCEL_CONTROL_PLANE_HEAD'}:null;
  },
  async writeSettlementContext({expectedEtag,body}){assert.equal(expectedEtag,'"context-'+this.contextWrites+'"');
    this.context=JSON.parse(body);this.contextBody=body;this.contextWrites++;return {committed:true,etag:'"context-'+this.contextWrites+'"'};},
  async compareAndSwap(){throw Error('SOURCE_CHECK_MUST_NEVER_MUTATE_JOURNAL');}};}
const env={ALPHA_VANTAGE_API_KEY:'YOUR_TEST_ALPHA_KEY',APCA_API_KEY_ID:'SYNTHETIC_KEY_ID',APCA_API_SECRET_KEY:'SYNTHETIC_SECRET_KEY'};
function network({denyAlpha=false,denySip=false,diverge=false,denyDocs=false}={}){
  const calls=[];return {calls,fetcher:async(url,init)=>{
    const u=new URL(url);calls.push(u.hostname);assert.equal(init.redirect,'error');
    if(u.pathname.endsWith('.pdf')||u.pathname==='/terms_of_service/'){
      if(denyDocs)return new Response('unavailable',{status:404});
      return new Response('%PDF-1.7\nSYNTHETIC TEST DOCUMENT '+u.hostname,{headers:{'Content-Type':'application/pdf'}});
    }
    if(u.hostname==='www.alphavantage.co'){
      assert.equal(init.headers['APCA-API-SECRET-KEY'],undefined);
      if(denyAlpha)return Response.json({error:'SECRET'},{status:403});
      return Response.json({'Meta Data':{'2. Symbol':'AAPL'},'Time Series (Daily)':{'2026-11-13':{'4. close':'100'}}});
    }
    if(u.hostname==='eodhd.com'){assert.equal(init.headers['APCA-API-SECRET-KEY'],undefined);return Response.json([{date:'2026-11-13',close:100.1}]);}
    assert.equal(u.hostname,'data.alpaca.markets');assert.equal(u.searchParams.get('feed'),'iex');
    if(denySip)return Response.json({message:'SECRET'},{status:403});
    return Response.json({symbol:'AAPL',next_page_token:null,bars:[{t:'2026-11-13T05:00:00Z',o:100,h:103,l:99,c:diverge?102:100.1,v:100,n:10}]});
  }};
}
const store=memory(),net=network(),before=(await store.read()).body;
const result=await inspect({storage:store,env,fetcher:net.fetcher,clock:()=>now});
assert.equal(result.state,'TWO_DAILY_ROWS_AGREE_REVIEW_REQUIRED');assert.equal(result.sessionDate,'2026-11-13');
assert.equal(result.twoDailyRowsReceived,true);assert.equal(result.closesAgree,true);
assert.equal(result.rawReceiptArchiveConfirmed,true);
assert.equal(result.alpacaPriceScope,'IEX_SINGLE_VENUE_NOT_CONSOLIDATED');assert.equal(result.originalDocumentsArchived,2);
assert.equal(result.originalDocumentsConnected,true);assert.equal(result.originalDocumentConnectionState,'ORIGINAL_DOCUMENTS_CONNECTED');assert(result.candidateContextBytes>0);assert.equal(store.context.documents.length,3);
assert.equal(result.technicalReviewsConnected,0);assert.equal(result.alphaDocumentReview,'UNKNOWN_ORIGINAL_REVISION');
assert.equal(result.alpacaDocumentReview,'UNKNOWN_ORIGINAL_REVISION');
assert.equal(result.rightsApproved,false);assert.equal(result.independenceCertified,false);assert.equal(result.paperFillsCreated,0);
assert.deepEqual(store.context.authority,authority);assert.deepEqual(store.context.markets,[]);assert.deepEqual(store.context.sessions,[]);
assert.deepEqual(store.context.documents[0],consentDoc);assert.equal((await store.read()).body,before);
for(const doc of store.context.documents.slice(1)){
  assert.equal(doc.reviewStatus,'ORIGINAL_NOT_YET_REVIEWED');assert.equal(sha(Buffer.from(doc.bodyBase64,'base64')),doc.sha256);
  assert.equal(doc.reviewedByOwner,undefined);assert.equal(doc.validUntil,undefined);
}
assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_SECRET|bodyBase64|payloadSha256|closeDifference|"close"/);
await inspect({storage:store,env,fetcher:net.fetcher,clock:()=>now});assert.equal(store.contextWrites,1,'never duplicate or replace original documents');
for(const options of [{denyAlpha:true},{denySip:true},{diverge:true},{denyDocs:true}]){
  const s=memory(),n=network(options),r=await inspect({storage:s,env,fetcher:n.fetcher,clock:()=>now});
  assert.equal(r.paperFillsCreated,0);assert.equal((await s.read()).body,before);
  if(options.denyAlpha||options.denySip){assert.equal(r.state,'TWO_DAILY_ROWS_AGREE_REVIEW_REQUIRED');assert.equal(r.eodhdState,'EXACT_DAILY_ROW_RECEIVED');}
  if(options.diverge)assert.equal(r.state,'DAILY_ROWS_DIVERGE');
  if(options.denyDocs){assert.equal(r.originalDocumentsArchived,0);assert.equal(s.contextWrites,0);}
}
const missing=memory(),emptyNetwork=network();missing.context=null;
assert.equal((await inspect({storage:missing,env,fetcher:emptyNetwork.fetcher,clock:()=>now})).state,'ORIGINAL_CONSENT_REQUIRED');
assert.equal(emptyNetwork.calls.length,0);
const failed=memory();failed.createResearchObservation=async()=>({created:false});
assert.equal((await inspect({storage:failed,env,fetcher:network().fetcher,clock:()=>now})).state,'SOURCE_ARCHIVE_NOT_CONFIRMED');assert.equal(failed.contextWrites,0);
let checked=0;
const cycle=await runOneGlobalCloudPaperCycle({storage:memory(),clock:()=>now,collect:()=>{throw Error('NO_HISTORICAL_SIGNAL');},
  checkSourceAccess:async()=>{checked++;return result;}});
assert.equal(checked,1);assert.equal(cycle.newSignals,0);assert.equal(cycle.paperFillsCreated,0);
assert.equal(cycle.ownerPaperAuthorityValidated,true,'an unrelated market-mapping blocker must not hide valid original consent');
assert.equal(cycle.sourceRightsEvidenceValidated,false);assert.equal(cycle.sourceAccessCheck.state,result.state);
console.log('PASS source access: real-interface two-source/difference checks, exact private bytes and original PDFs, originals appended by CAS without invented reviews or expiry, old documents/authority/journal preserved, idempotency, consent/access/archive failures, weekend no-backfill wiring. SYNTHETIC fixtures only.');

const conflict=memory();conflict.writeSettlementContext=async()=>{throw Error('SYNTHETIC conflict: never overwrite');};
const notConnected=await inspect({storage:conflict,env,fetcher:network().fetcher,clock:()=>now});
assert.equal(notConnected.rawReceiptArchiveConfirmed,true);assert.equal(notConnected.originalDocumentsConnected,false);
assert.equal(notConnected.originalDocumentConnectionState,'PRIVATE_INPUT_CONTEXT_WRITE_UNCONFIRMED_RELOAD_REQUIRED');
assert.equal(conflict.context.documents.length,1);assert.equal((await conflict.read()).body,before);
