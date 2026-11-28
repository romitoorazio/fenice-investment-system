import assert from 'node:assert/strict';
import {createProspectiveR2PaperStore} from '../lib/trading/one-global-r2-prospective-paper-store.mjs';
import {authorizeR2Paper,readR2PaperControl,runAuthorizedR2PaperCycle,validateR2PublicCycleSummary,runR2EuSourcePreflight,validateR2EuPreflightSummary,runR2UsSourcePreflight,validateR2UsPreflightSummary} from '../lib/trading/one-global-r2-paper-control.mjs';
const objects=new Map();let n=0;
const transport=async({method,key,body,condition})=>{
 const old=objects.get(key);
 if(method==='GET'){if(condition['if-match']&&old?.etag!==condition['if-match'])return {status:412};return old?{status:200,...old}:{status:404};}
 if((condition['if-match']&&old?.etag!==condition['if-match'])||(condition['if-none-match']==='*'&&old))return {status:412};
 objects.set(key,{body:Buffer.from(body),etag:'"t-'+(++n)+'"'});return {status:200};
};
let t='2026-11-27T20:00:00.000Z';
const clock=()=>t,storage=createProspectiveR2PaperStore({transport,clock}),reviewedCommit='a'.repeat(40);
let calls=0;
const run=async()=>{calls++;return {state:'R2_PROSPECTIVE_VERIFIED_OUTSIDE_POSTCLOSE_WINDOW',originalJournalVerified:false,prospectiveJournalVerified:true,
 newSignals:0,paperFillsCreated:0,certifiedTrades:0,phase9Credit:0,liveTradingAllowed:false,brokerConnectivityAllowed:false};};
assert.equal((await runAuthorizedR2PaperCycle({storage,clock,run})).state,'R2_PAPER_GENESIS_REQUIRED');
await storage.initialize();
assert.equal((await runAuthorizedR2PaperCycle({storage,clock,run})).state,'R2_PAPER_CONSENT_REQUIRED');
assert.equal(calls,0);
await assert.rejects(authorizeR2Paper({storage,clock,reviewedCommit:'bad'}));
const before=(await storage.read()).body;
assert.equal((await authorizeR2Paper({storage,clock,reviewedCommit})).authorityValid,true);
const context=(await storage.readSettlementContext()).body;
assert.equal((await authorizeR2Paper({storage,clock,reviewedCommit})).authorityValid,true);
assert.equal((await storage.readSettlementContext()).body,context);
assert.equal((await storage.read()).body,before);
assert.equal((await readR2PaperControl({storage,clock})).cashEuro,1000);
const result=await runAuthorizedR2PaperCycle({storage,clock,run});
assert.equal(result.authorityValid,true);assert.equal(calls,1);
assert.throws(()=>validateR2PublicCycleSummary({...result,originalJournalVerified:true}));
assert.throws(()=>validateR2PublicCycleSummary({...result,liveTradingAllowed:true}));
assert.throws(()=>validateR2PublicCycleSummary({...result,authorityValid:false,newSignals:1}));
assert.throws(()=>validateR2PublicCycleSummary({...result,paperFillsCreated:2}));
assert.throws(()=>validateR2PublicCycleSummary({...result,closedVirtualRoundTrips:1}));
const sanitized=validateR2PublicCycleSummary({...result,privateContext:'SYNTHETIC PRIVATE BYTES',cashEuro:1000});
assert.equal(Object.hasOwn(sanitized,'privateContext'),false);
assert.equal(Object.hasOwn(sanitized,'cashEuro'),false);
// A cycle that started with consent may cross expiry during collection.
const priorTime=t;
let journalWrites = 0;
const observedStorage = {
  ...storage,
  async compareAndSwap(args) {
    journalWrites++;
    return storage.compareAndSwap(args);
  },
};
await assert.rejects(runAuthorizedR2PaperCycle({storage:observedStorage,clock,run:async({storage:guarded})=>{
  t='2026-12-28T20:00:00.000Z';
  await guarded.compareAndSwap({expectedEtag:(await storage.read()).etag,body:before,contentType:'application/json'});
}}), {message:'CLOUD_SETTLEMENT_ORIGINAL_OWNER_CONSENT_INVALID_OR_EXPIRED'});
assert.equal(journalWrites,0);
assert.equal((await storage.read()).body,before);
assert.equal((await storage.readSettlementContext()).body,context);
t=priorTime;
const expiredAfterRead=await runAuthorizedR2PaperCycle({storage,clock,run:async()=>{
  t='2026-12-28T20:00:00.000Z';
  return {state:'R2_PROSPECTIVE_VERIFIED_OUTSIDE_POSTCLOSE_WINDOW',originalJournalVerified:false,prospectiveJournalVerified:true,
    newSignals:0,paperFillsCreated:0,certifiedTrades:0,phase9Credit:0,liveTradingAllowed:false,brokerConnectivityAllowed:false};
}});
assert.equal(expiredAfterRead.authorityValid,false);
t='2026-12-28T20:00:00.000Z';
assert.equal((await runAuthorizedR2PaperCycle({storage,clock,run})).state,'R2_PAPER_CONSENT_REVIEW_REQUIRED');
assert.equal(calls,1);
assert.equal((await storage.read()).body,before);
assert.equal((await storage.readSettlementContext()).body,context);
console.log('PASS R2 PAPER control: no engine without explicit valid consent, expiry, immutable genesis, no historical or LIVE credit.');

t='2026-11-28T12:00:00.000Z';
let preflightCalls=0;
const qualify=async({storage:restricted})=>{
 preflightCalls++;
 assert.equal(restricted.compareAndSwap,undefined);
 assert.equal(restricted.initialize,undefined);
 return {state:'EU_TWO_INDEPENDENT_VENUE_OBSERVATIONS_VERIFIED',sourcePairsReceived:6,sourcePairsAgree:6,uptrendCandidates:1,
 rawArtifactsVerified:true,rightsEvidenceConnected:true,paperFillsCreated:0,certifiedTrades:0,liveTradingAllowed:false,brokerConnectivityAllowed:false};
};
const preflight=await runR2EuSourcePreflight({storage,clock,qualify});
assert.equal(preflight.sourcePairsAgree,6);
assert.equal(preflight.newSignals,0);
assert.equal((await storage.read()).body,before);
assert.equal((await storage.readSettlementContext()).body,context);
assert.throws(()=>validateR2EuPreflightSummary({...preflight,paperFillsCreated:1}));
assert.throws(()=>validateR2EuPreflightSummary({...preflight,sourcePairsAgree:7}));
assert.throws(()=>validateR2EuPreflightSummary({...preflight,liveTradingAllowed:true}));
t='2026-11-30T12:00:00.000Z';
assert.equal((await runR2EuSourcePreflight({storage,clock,qualify})).state,'R2_PREFLIGHT_OUTSIDE_WEEKEND');
t='2027-01-02T12:00:00.000Z';
assert.equal((await runR2EuSourcePreflight({storage,clock,qualify})).state,'R2_PREFLIGHT_AUTHORITY_REQUIRED');
assert.equal(preflightCalls,1);
console.log('PASS isolated weekend EU source qualification: no journal writer, no new signal or fill, consent and weekend gates, strict public summary.');

 // Consent expires while source collection is in flight. No supporting write
 // can begin after the expiry; even a successful-looking qualifier is rejected.
 for(const method of ['createSourceArtifact','createResearchObservation','verifyProspectivePrecommitObservation','writeSettlementContext']){
   t='2026-11-28T12:00:00.000Z';let writes=0;
   const wrapped={...storage,[method]:async()=>{writes++;throw Error('unexpected write');}};
   const snap=await storage.readSettlementContext();
   await assert.rejects(runR2EuSourcePreflight({storage:wrapped,clock,qualify:async({storage:restricted})=>{
     t='2026-12-28T20:00:00.000Z';
     await restricted[method]({expectedEtag:snap.etag,body:context});
   }}),/CLOUD_SETTLEMENT_ORIGINAL_OWNER_CONSENT_INVALID_OR_EXPIRED/);
   assert.equal(writes,0);
 }
 t='2026-11-28T12:00:00.000Z';
 await assert.rejects(runR2EuSourcePreflight({storage,clock,qualify:async(args)=>{
   const report=await qualify(args);t='2026-12-28T20:00:00.000Z';return report;
 }}),/CLOUD_SETTLEMENT_ORIGINAL_OWNER_CONSENT_INVALID_OR_EXPIRED/);
 assert.equal((await storage.read()).body,before);
 assert.equal((await storage.readSettlementContext()).body,context);
 console.log('PASS preflight consent expiry guards all evidence writes and final attestation.');

// US access tests are synthetic only, with no storage mutation or rights claim.
t='2026-11-28T12:00:00.000Z';
const writesBefore=n;let usCalls=0;
const usCollect=async({source,signal,sessionDate})=>{
  usCalls++;assert.equal(sessionDate,'2026-11-27');
  if(source.providerId==='alpaca-iex'&&source.symbol==='TSLA')throw Error('synthetic denied');
  return {receipt:{...signal,providerId:source.providerId,sessionDate,close:100,simulatedOrSynthetic:false}};
};
const us=await runR2UsSourcePreflight({storage,clock,collect:usCollect});
assert.equal(us.state,'US_ACCESS_DIAGNOSTIC_COMPLETED');
assert.equal(usCalls,7);
assert.deepEqual(us.symbols.map(x=>x.symbol),['AAPL','MSFT','TSLA']);
assert.equal(us.symbols[2].eodhd,'EXACT_DAILY_ROW_RECEIVED');
assert.equal(us.symbols[2].iex,'ACCESS_NOT_CONFIRMED');
assert.equal(us.symbols.every(x=>x.numericalAgreement),true);
assert.equal(us.rightsApproved,false);assert.equal(us.independenceCertified,false);
assert.throws(()=>validateR2UsPreflightSummary({...us,rightsApproved:true}));
assert.throws(()=>validateR2UsPreflightSummary({...us,newSignals:1}));
assert.equal(n,writesBefore);
t='2026-11-30T12:00:00.000Z';
assert.equal((await runR2UsSourcePreflight({storage,clock,collect:usCollect})).state,'R2_PREFLIGHT_OUTSIDE_WEEKEND');
t='2027-01-02T12:00:00.000Z';
assert.equal((await runR2UsSourcePreflight({storage,clock,collect:usCollect})).state,'R2_PREFLIGHT_AUTHORITY_REQUIRED');
assert.equal(usCalls,7);assert.equal(n,writesBefore);
console.log('PASS synthetic R2 US source diagnostic: three symbols, fallback, no writes or approval, weekday and authority guards.');
