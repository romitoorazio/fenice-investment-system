import assert from 'node:assert/strict';
import {createProspectiveR2PaperStore} from '../lib/trading/one-global-r2-prospective-paper-store.mjs';
import {authorizeR2Paper,readR2PaperControl,runAuthorizedR2PaperCycle,validateR2PublicCycleSummary} from '../lib/trading/one-global-r2-paper-control.mjs';
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
await assert.rejects(runAuthorizedR2PaperCycle({storage,clock,run:async({storage:guarded})=>{
  t='2026-12-28T20:00:00.000Z';
  await guarded.compareAndSwap({expectedEtag:(await storage.read()).etag,body:before,contentType:'application/json'});
}}));
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
