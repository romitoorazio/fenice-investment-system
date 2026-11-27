import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {inspectPrivateR2OriginalCandidate as inspect} from '../lib/trading/one-global-r2-original-candidate.mjs';
import {newOneGlobalEodPaperLedger} from '../lib/trading/one-global-eod-paper.mjs';
const env={R2_ACCESS_KEY_ID:'test-id',R2_SECRET_ACCESS_KEY:'test-secret',R2_ENDPOINT:'https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com',R2_BUCKET_NAME:'fenice-private-storage'};
const digest=x=>createHash('sha256').update(x).digest('hex');
const now=new Date('2026-11-26T12:34:56Z');
let calls=0;
const run=(body,status=200,expectedSha256=digest(body))=>inspect({expectedSha256,env,now,fetcher:async(url,options)=>{
  calls++;
  assert.equal(url.pathname,'/fenice-private-storage/fenice/one-global/private-eod/original-ledger.json');
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
  assert.match(options.headers.authorization,/SignedHeaders=host;x-amz-content-sha256;x-amz-date/);
  return new Response(body,{status});
}});
assert.equal((await inspect({env,fetcher:async()=>{throw Error('must not call');}})).state,'R2_ORIGINAL_FINGERPRINT_REQUIRED');
assert.equal(calls,0);
assert.equal((await run('',404)).state,'R2_ORIGINAL_NOT_FOUND');
assert.equal((await run('data',403)).state,'R2_ORIGINAL_READ_REJECTED');
assert.equal((await run('data',200,'a'.repeat(64))).state,'R2_ORIGINAL_FINGERPRINT_MISMATCH');
assert.equal((await run('x'.repeat(1_500_001))).state,'R2_ORIGINAL_TOO_LARGE');
assert.equal((await run(Buffer.from([0xff]))).state,'R2_ORIGINAL_UTF8_INVALID');
assert.equal((await run('not json')).state,'R2_ORIGINAL_REPLAY_INVALID');
const result=await run(JSON.stringify(newOneGlobalEodPaperLedger()));
assert.equal(result.state,'R2_ORIGINAL_HISTORY_MISMATCH');
assert.equal(result.journalMutationAllowed,false);assert.equal(result.authoritativeStoreChanged,false);
assert.equal(result.sourceProvenanceIndependentlyVerified,false);assert.equal(result.liveTradingAllowed,false);
console.log('R2 original candidate read-only negative and transport tests passed; genuine journal required for positive replay.');

// Run the migration inventory regressions in the existing required Production CI R2 step.
await import('./test-one-global-r2-migration-preflight.mjs');
