/** All source HTML, original consent and journals below are SYNTHETIC test fixtures. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {newOneGlobalEodPaperLedger,recordOneGlobalEodSignal} from '../lib/trading/one-global-eod-paper.mjs';
import {inspectOneGlobalUsOwnerMapping,connectOneGlobalUsOwnerMapping} from '../lib/trading/one-global-us-owner-mapping.mjs';
import {handleOneGlobalUsOwnerMappingRequest} from '../lib/trading/one-global-us-owner-mapping-http.mjs';
import {validateOneGlobalSettlementContext} from '../lib/trading/one-global-cloud-settlement.mjs';
import {oneGlobalNextReviewedNasdaqRegularSession2026} from '../lib/market/one-global-nasdaq-regular-session-2026.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const reviewedNext=oneGlobalNextReviewedNasdaqRegularSession2026;
assert.equal(reviewedNext('2026-11-20'),'2026-11-23');
assert.equal(reviewedNext('2026-11-25'),'2026-11-30',
  'Thanksgiving closure and early-close Friday are not normal settlement sessions');
assert.equal(reviewedNext('2026-11-26'),'2026-11-30');
assert.equal(reviewedNext('2026-11-27'),'2026-11-30');
assert.equal(reviewedNext('2026-12-23'),'2026-12-28');
assert.equal(reviewedNext('2026-12-31'),null,'2027 calendar not reviewed: fail closed');
assert.equal(reviewedNext('2027-01-04'),null,'no unverified calendar expansion');
assert.equal(reviewedNext('2026-02-31'),null,'reject rollover invalid calendar dates');

const now='2026-11-17T00:55:00.000Z';
const consent={mode:'ONE_GLOBAL_FORWARD_EOD_PRIVATE_PAPER',ownerConsent:true,
  approvedForVirtualSimulation:true,approvalEvidence:{kind:'EXPLICIT_OWNER_CONSENT',reviewedCommit:'a'.repeat(40)},
  executionMethod:'NEXT_COMPLETED_SESSION_CLOSE_PLUS_IMPACT',allowBackfill:false,
  liveTradingAllowed:false,brokerConnectivityAllowed:false,realBrokerOrdersAllowed:false,
  strategyPerformanceCertified:false,approvedAt:'2026-11-16T18:00:00.000Z',
  expiresAt:'2026-12-01T00:00:00.000Z'};
const consentRaw=Buffer.from(JSON.stringify(consent));
const original={kind:'ORIGINAL_OWNER_PAPER_CONSENT',sha256:sha(consentRaw),
  bodyBase64:consentRaw.toString('base64')};
const context={kind:'ONE_GLOBAL_PRIVATE_SETTLEMENT_CONTEXT',authority:consent,
  authorityEvidenceSha256:original.sha256,documents:[original],markets:[],sessions:[]};
const refTime='2026-11-16T22:45:00.000Z';
const rawJournal=recordOneGlobalEodSignal({previousLedger:newOneGlobalEodPaperLedger(),
  nowIso:refTime,signal:{signalId:'us-test-authentic-only-in-synthetic-fixtures',
  key:'XNAS:AAPL',mic:'XNAS',currency:'USD',side:'BUY',decisionAt:refTime,
  referenceSessionDate:'2026-11-16',referenceCloseAt:'2026-11-16T21:00:00.000Z',
  referencePublishedAt:'2026-11-16T21:30:00.000Z',
  sourceSnapshotHash:'e'.repeat(64),maxNotionalEuro:50,strategyReason:'UPTREND_CONFIRMATION'}}).ledger;
function fixture(){
  let c=structuredClone(context),etag='"original"',writes=0,rawWrites=0,packetWrites=0;
  let currentBody=JSON.stringify(c);
  return {
    privateAccess:true,durable:true,atomicCompareAndSwap:true,
    async read(){return {etag:'"ledger"',body:JSON.stringify(rawJournal)};},
    async readSettlementContext(){return {etag,body:currentBody};},
    async createSourceArtifact({hash,body,contentType}){
      assert.equal(hash,sha(body));assert(['text/html','application/pdf'].includes(contentType));
      assert(Buffer.isBuffer(body));rawWrites++;return {verified:true};
    },
    async createResearchObservation({body}){assert(JSON.parse(body).kind==='ONE_GLOBAL_PRIVATE_INPUT_ORIGINAL');
      packetWrites++;return {created:true};},
    async writeSettlementContext({expectedEtag,body}){
      assert.equal(expectedEtag,etag);writes++;currentBody=body;c=JSON.parse(body);etag='"reviewed"';
      return {committed:true,etag};
    },
    get(){return {c,writes,rawWrites,packetWrites,etag};}
  };
}
const fixtures={
  'https://www.alphavantage.co/terms_of_service/':
    Buffer.from('%PDF-1.4\n% SYNTHETIC PDF test fixture, not Alpha Vantage terms.\n'+('fixture only. '.repeat(20))+'\n%%EOF'),
  'https://www.alphavantage.co/stock_api_landing/':
    '<html><body>Alpha Vantage data officially licensed from NASDAQ. '+
    'NASDAQ licensed publisher and exchange data. '.repeat(12)+'</body></html>',
  'https://docs.alpaca.markets/us/docs/paper-trading':
    '<html><body>As an Alpaca Paper Only Account holder, you are only entitled to receive '+
    'and make use of IEX market data. '.repeat(16)+'</body></html>',
  'https://www.nasdaqtrader.com/trader.aspx?id=calendar':
    '<html><body>NASDAQ 2026 U.S. Market Holiday Schedule; November 26 Thanksgiving closed. '+
    'Regular exchange calendar for 2026. '.repeat(14)+'</body></html>',
};
let httpCalls=0;
const fetcher=async(url,opts)=>{
  httpCalls++;assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');
  assert.equal(opts.cache,'no-store');
  assert.equal(opts.headers.Accept,url.includes('terms_of_service')?'application/pdf':'text/html');
  if(!Object.hasOwn(fixtures,url))throw Error('FORBIDDEN_URL');
  return new Response(fixtures[url],{headers:{'content-type':url.includes('terms_of_service')?'application/pdf':'text/html;charset=UTF-8'}});
};
const store=fixture();
const preview=await inspectOneGlobalUsOwnerMapping({storage:store,nowIso:now});
assert.equal(preview.signalKey,'XNAS:AAPL');
assert.equal(preview.nextSessionDate,'2026-11-17');
assert.equal(preview.expectedEtag,'"original"');
assert.equal(preview.state,'US_MAPPING_OFFICIAL_DOCUMENT_REVIEW_AVAILABLE');
assert.equal(httpCalls,0,'read-only preview does not fetch or write');
assert.equal(store.get().writes,0);
const pinnedAlphaTermsSha256=sha(fixtures['https://www.alphavantage.co/terms_of_service/']);
const input={confirm:'I_REVIEWED_US_SOURCE_TERMS_AND_PRIVATE_PAPER_SCOPE',
  key:'XNAS:AAPL',expectedEtag:preview.expectedEtag};
for(const bad of [{...input,confirm:'yes'}, {...input,key:'XNAS:TSLA'},
  {...input,expectedEtag:'"old"'},
  {...input,unexpectedKey:true}]){
  await assert.rejects(connectOneGlobalUsOwnerMapping({storage:store,input:bad,nowIso:now,fetcher,pinnedAlphaTermsSha256}),
    /US_OWNER_MAPPING_/);
  assert.equal(store.get().writes,0);
}
const saved=await connectOneGlobalUsOwnerMapping({storage:store,input,nowIso:now,fetcher,pinnedAlphaTermsSha256});
assert.equal(saved.state,'US_OWNER_REVIEWED_MAPPING_CONNECTED_PRIVATE');
assert.equal(saved.originalBytesArchived,true);
assert.equal(saved.paperFillsCreated,0);
assert.equal(saved.brokerConnectivityAllowed,false);
assert.equal(httpCalls,4);
const out=store.get();
assert.equal(out.writes,1);assert.equal(out.rawWrites,4);assert.equal(out.packetWrites,1);
assert.equal(out.c.markets.length,1);assert.equal(out.c.sessions.length,1);
assert.equal(out.c.documents.length,6);
assert.deepEqual(out.c.markets[0].sources.map(q=>q.providerId),['alpha-vantage','alpaca-iex']);
assert(out.c.markets[0].ownerReviewedRights.every(q=>q.reviewedByOwner===true
  &&q.usageScope==='PRIVATE_PERSONAL_PAPER_SIMULATION'));
assert.equal(out.c.sessions[0].sessionOpenedAt,'2026-11-17T14:30:00.000Z');
assert.equal(out.c.sessions[0].sessionClosedAt,'2026-11-17T21:00:00.000Z');
assert.equal(out.c.documents[0].sha256,context.documents[0].sha256);
assert.equal(rawJournal.events.length,1);
assert.throws(()=>validateOneGlobalSettlementContext({context:out.c,signal:rawJournal.events[0],nowIso:now}),
  /CLOUD_SETTLEMENT_NEXT_SESSION_NOT_COMPLETED/);
assert.deepEqual((await inspectOneGlobalUsOwnerMapping({storage:store,nowIso:now})).state,
  'US_MAPPING_ALREADY_PRESENT_REVIEW_EXISTING');
await assert.rejects(connectOneGlobalUsOwnerMapping({storage:store,input:{...input,expectedEtag:'"reviewed"'},nowIso:now,fetcher}),
  /US_OWNER_MAPPING_EXISTING_MAPPING_MUST_BE_PRESERVED/);
const badRights=structuredClone(out.c);
badRights.markets[0].ownerReviewedRights[0].automatedUseAllowed=false;
assert.throws(()=>validateOneGlobalSettlementContext({context:badRights,signal:rawJournal.events[0],nowIso:now}),
  /CLOUD_SETTLEMENT_ORIGINAL_PROVIDER_RIGHTS_MISSING_OR_EXPIRED/);
const badVenue=structuredClone(out.c);
const market=badVenue.markets[0],proof=badVenue.documents.find(d=>d.sha256===market.sources[1].independenceEvidenceSha256);
const raw=JSON.parse(Buffer.from(proof.bodyBase64,'base64').toString());
raw.officialUrl='https://fake.example/venue';
const bytes=Buffer.from(JSON.stringify(raw)),h=sha(bytes);
proof.sha256=h;proof.bodyBase64=bytes.toString('base64');
market.sources[1].independenceEvidenceSha256=h;
assert.throws(()=>validateOneGlobalSettlementContext({context:badVenue,signal:rawJournal.events[0],nowIso:now}),
  /CLOUD_SETTLEMENT_US_ORIGINAL_PROVENANCE_CAPTURE_INVALID/);
const failStorage=fixture();
await assert.rejects(connectOneGlobalUsOwnerMapping({storage:failStorage,input,nowIso:now,pinnedAlphaTermsSha256,
  fetcher:async(url,opts)=>url.includes('paper-trading')?Response.json({error:'not found'},{status:403}):fetcher(url,opts)}),
  /US_OWNER_MAPPING_OFFICIAL_ORIGINAL_HTTP_OR_TYPE_REJECTED/);
assert.equal(failStorage.get().writes,0);assert.equal(failStorage.get().rawWrites,0);
const noAuth=await handleOneGlobalUsOwnerMappingRequest(new Request('https://example.test/mapping'),{
  production:true,authorized:false,sameOrigin:true,storageFactory:async()=>store});
assert.equal(noAuth.status,401);
const csrf=await handleOneGlobalUsOwnerMappingRequest(new Request('https://example.test/mapping',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),{
    production:true,authorized:true,sameOrigin:false,storageFactory:async()=>store});
assert.equal(csrf.status,403);
assert.equal(store.get().writes,1,'CSRF and unauthenticated access never write');
console.log('PASS US owner review: official originals captured, fixed sources and Nasdaq time, CAS, strict rights, signal preserved, refusers fail closed; SYNTHETIC docs only.');

 // The existing owner review is also exercised against an isolated R2-shaped
 // storage fixture. No real source, owner approval or journal is manufactured.
 const r2Base=fixture();
 const r2Fixture={...r2Base,campaignKind:'R2_PROSPECTIVE_UNCERTIFIED',
   verifyProspectivePrecommitObservation:async()=>{throw Error('unexpected signal proof');},
   async read(){return {...await r2Base.read(),originId:'12345678-1234-1234-1234-123456789abc',
     startedAt:'2026-11-16T18:00:00.000Z'};}};
 const r2Preview=await inspectOneGlobalUsOwnerMapping({storage:r2Fixture,nowIso:now});
 assert.equal(r2Preview.state,'US_MAPPING_OFFICIAL_DOCUMENT_REVIEW_AVAILABLE');
 assert.equal(r2Base.get().writes,0);
 const r2Saved=await connectOneGlobalUsOwnerMapping({storage:r2Fixture,nowIso:now,input:{...input,expectedEtag:r2Preview.expectedEtag},fetcher,pinnedAlphaTermsSha256});
 assert.equal(r2Saved.state,'US_OWNER_REVIEWED_MAPPING_CONNECTED_PRIVATE');
 assert.equal(r2Saved.paperFillsCreated,0);
 assert.equal(r2Saved.liveTradingAllowed,false);
 assert.equal(r2Base.get().writes,1);
 assert.deepEqual(r2Base.get().c.authority,consent);
 assert.equal(JSON.parse((await r2Fixture.read()).body).events.length,1);
 const emptyR2={...r2Fixture,async read(){return {body:JSON.stringify(newOneGlobalEodPaperLedger())};}};
 await assert.rejects(inspectOneGlobalUsOwnerMapping({storage:emptyR2,nowIso:now}),/NO_SUPPORTED_PENDING_US_SIGNAL/);
 console.log('PASS isolated R2 USA owner mapping: explicit review, no synthetic production trades, unchanged authority and signal.');
