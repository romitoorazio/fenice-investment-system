import assert from 'node:assert/strict';
import {oneGlobalReviewSubjectSha256 as subjectHash,validOneGlobalEvidenceReview as valid,
  oneGlobalPublicDocumentReview as originalReview} from '../lib/trading/one-global-technical-review.mjs';
// All approvals in this test are SYNTHETIC, never user/provider authorizations.
const authoritySnapshotHash='a'.repeat(64),evidenceSha256='b'.repeat(64),nowIso='2026-11-14T22:10:00.000Z';
const subject={providerId:'synthetic',evidenceSha256,mic:'XNAS',currency:'USD',reviewedByOwner:false,
  usageScope:'PRIVATE_PERSONAL_PAPER_SIMULATION',automatedUseAllowed:true,validUntil:'2026-12-01T00:00:00.000Z'};
subject.technicalReview={kind:'DELEGATED_PROJECT_TECHNICAL_REVIEW',reviewer:{role:'DELEGATED_PROJECT_OPERATOR',name:'Synthetic Test'},
  scope:'PROVIDER_USAGE_RIGHTS',outcome:'APPROVED_FOR_DOCUMENTED_SCOPE',authoritySnapshotHash,evidenceSha256,
  reviewedAt:'2026-11-14T22:09:00.000Z',reviewedCommit:'c'.repeat(40),basis:'SYNTHETIC TEST ONLY: exact original fixture evaluated for this particular scope.',subjectSha256:subjectHash(subject)};
const args={subject,scope:'PROVIDER_USAGE_RIGHTS',evidenceSha256,authoritySnapshotHash,nowIso};
assert.equal(valid(args),true);
assert.equal(subjectHash(subject),subjectHash(Object.fromEntries(Object.entries(subject).reverse())),'canonical key order');
for(const mutate of [
  s=>{s.reviewedByOwner=true;},s=>{s.providerId='other';},s=>{s.mic='XMIL';},
  s=>{s.technicalReview.scope='SOURCE_MAPPING';},s=>{s.technicalReview.outcome='ACCOUNT_SCOPE_UNRESOLVED';},
  s=>{s.technicalReview.authoritySnapshotHash='d'.repeat(64);},s=>{s.technicalReview.evidenceSha256='e'.repeat(64);},
  s=>{s.technicalReview.subjectSha256='f'.repeat(64);},s=>{s.technicalReview.reviewedAt='2026-11-15T00:00:00.000Z';},
  s=>{s.technicalReview.reviewer.role='OWNER';},s=>{s.technicalReview.basis='';},s=>{s.technicalReview.reviewedCommit='main';},
]){const changed=structuredClone(subject);mutate(changed);assert.equal(valid({...args,subject:changed}),false);}
assert.equal(valid({...args,authoritySnapshotHash:'0'.repeat(64)}),false);
assert.equal(valid({...args,scope:'EXCHANGE_SESSION'}),false);
assert.equal(valid({...args,subject:{reviewedByOwner:true}}),true,'authentic legacy shape stays replayable');
assert.equal(valid({...args,subject:{reviewedByOwner:true,technicalReview:null}}),false,'malformed delegation cannot fall back to owner');
assert.equal(valid({...args,subject:{reviewedByOwner:false}}),false);
const alpha=originalReview({providerId:'alpha-vantage',evidenceSha256:'88ed3d22fe0f3624e76e53a210db3498b4a90712ab0d934356cc84b19ed1468a'});
const alpaca=originalReview({providerId:'alpaca-sip',evidenceSha256:'2dc774d4aeeafbe4c7f0565e7842d932bc8bc10488af805fce43b8734e7b9859'});
assert.equal(alpha.outcome,'PRIVATE_SCOPE_TEXT_SUPPORTED');assert.equal(alpaca.outcome,'ACCOUNT_SCOPE_UNRESOLVED');
for(const review of [alpha,alpaca]){assert.equal(review.rightsApproved,false);assert.equal(review.reviewedByOwner,false);
  assert.equal(review.independenceCertified,false);assert.ok(review.blockers.length);assert.equal(valid({...args,subject:{...subject,technicalReview:review}}),false);}
assert.equal(originalReview({providerId:'alpaca-sip',evidenceSha256:alpha.evidenceSha256}),null);
assert.equal(originalReview({providerId:'alpha-vantage',evidenceSha256:'0'.repeat(64)}),null);
alpha.blockers.length=0;assert.ok(originalReview({providerId:'alpha-vantage',evidenceSha256:alpha.evidenceSha256}).blockers.length,'immutable catalog');
console.log('PASS attributed technical review: synthetic scope/subject/authority/evidence binding, tamper/cross-scope/future rejection, legacy replay, pinned real-document findings never grant permission.');
