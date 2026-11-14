import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {newOneGlobalEodPaperLedger,recordOneGlobalEodSignal} from '../lib/trading/one-global-eod-paper.mjs';
import {inspectOneGlobalPrivateEodCloudStatus as inspect} from '../lib/trading/one-global-cloud-private-status.mjs';

const initial=newOneGlobalEodPaperLedger();
const snapshot=(ledger)=>({etag:'"e1"',body:JSON.stringify(ledger)});
const store=(data)=>({privateAccess:true,durable:true,async read(){return data;}});
const assertNeverPrivateMaterial=(x)=>{
 const serialized=JSON.stringify(x);
 for(const text of ['cashEuro','positions','sourceSnapshotHash','providerReceipts','lastHash',
    'ownerConsent','payloadSha256','fxRateToEuro','signalId','token','etag'])
   assert.equal(serialized.includes('"'+text+'"'),false,'private field must never leave server: '+text);
 assert.equal(x.liveTradingAllowed,false);
 assert.equal(x.brokerConnectivityAllowed,false);
 assert.equal(x.journalMutationAllowed,false);
 assert.equal(x.phase9Credit,0);
 assert.equal(x.certifiedTrades,0);
};
const empty=await inspect({storage:store(null)});
assert.equal(empty.state,'ORIGINAL_JOURNAL_NOT_MIGRATED');
assertNeverPrivateMaterial(empty);
const original=await inspect({storage:store(snapshot(initial))});
assert.equal(original.state,'ORIGINAL_JOURNAL_VALID_PRIVATE');
assert.equal(original.journalEventCount,0);
assert.equal(original.virtualBuyCount,0);
assertNeverPrivateMaterial(original);
const signal={
 signalId:'fenice-xnas-aapl-20261113-readonly-probe',
 key:'XNAS:AAPL',mic:'XNAS',currency:'USD',side:'BUY',
 decisionAt:'2026-11-13T22:30:00.000Z',
 referenceSessionDate:'2026-11-13',
 referenceCloseAt:'2026-11-13T21:00:00.000Z',
 referencePublishedAt:'2026-11-13T22:10:00.000Z',
 sourceSnapshotHash:'a'.repeat(64),
 strategyReason:'UPTREND_CONFIRMATION',
 researchSignalOnly:true,sourceRightsIndependentlyCertified:false,
 maxNotionalEuro:50,
};
const actual=recordOneGlobalEodSignal({
 previousLedger:initial,nowIso:signal.decisionAt,signal,
}).ledger;
let reads=0;
const noWrite={
 privateAccess:true,durable:true,
 async read(){reads++;return snapshot(actual);},
 async compareAndSwap(){throw Error('PRIVATE_STATUS_WRITE_FORBIDDEN');}
};
const populated=await inspect({storage:noWrite});
assert.equal(populated.state,'ORIGINAL_JOURNAL_VALID_PRIVATE');
assert.equal(populated.journalEventCount,1);
assert.equal(populated.pendingSignalCount,1);
assert.equal(populated.virtualBuyCount,0);
assert.equal(reads,1);
assertNeverPrivateMaterial(populated);
assert.equal(initial.events.length,0,'original source not mutated');
const malformed=await inspect({storage:store({etag:'"e1"',body:'not-json'})});
assert.equal(malformed.state,'ORIGINAL_JOURNAL_REPLAY_INVALID');
assertNeverPrivateMaterial(malformed);
const changed={...actual,cashEuro:777};
const corrupt=await inspect({storage:store(snapshot(changed))});
assert.equal(corrupt.state,'ORIGINAL_JOURNAL_REPLAY_INVALID');
assertNeverPrivateMaterial(corrupt);
const broken=await inspect({storage:store({
 etag:'"etag"',body:'{"invalid":true,"rawClose":999}',
})});
assert.equal(broken.state,'ORIGINAL_JOURNAL_REPLAY_INVALID');
assertNeverPrivateMaterial(broken);
const readFail=await inspect({storage:{
 privateAccess:true,durable:true,
 async read(){throw Error('secret in provider exception');},
}});
assert.equal(readFail.state,'PRIVATE_STORE_READ_UNAVAILABLE');
assertNeverPrivateMaterial(readFail);
const publicStore=await inspect({storage:{
 privateAccess:false,durable:true,
 async read(){throw Error('MUST_NOT_READ_PUBLIC_STORE');},
}});
assert.equal(publicStore.state,'PRIVATE_STORE_NOT_CONFIGURED');
assertNeverPrivateMaterial(publicStore);
const max=await inspect({storage:store({
 etag:'"e1"',body:'x'.repeat(1_500_001),
})});
assert.equal(max.state,'PRIVATE_STORE_SNAPSHOT_INVALID');
assertNeverPrivateMaterial(max);

const route=readFileSync('app/api/paper/one-global-private-status/route.js','utf8');
assert.match(route,/export async function GET\(request\)/);
assert.match(route,/isOwnerAuthorized/);
assert.match(route,/verifyFeniceOwnerSession/);
assert.match(route,/FENICE_AI_OWNER_TOKEN/);
assert.match(route,/createVercelPrivateEodBlobStore/);
assert.match(route,/Cache-Control.*private, no-store/);
assert.doesNotMatch(route,/export\s+(?:async\s+)?function\s+(?:POST|PUT|PATCH|DELETE)/);
assert.doesNotMatch(route,/\.compareAndSwap\(|\.put\(|\.delete\(|\.del\(/);
assert.doesNotMatch(route,/JSON\.stringify\(snapshot\)|console\.(?:log|error)|cookies\(\)/);
console.log('PASS FENICE Blob authenticated read-only probe: missing journal, correct replay, corruption, no prices, no secret leaks, no broker/no writes.');
