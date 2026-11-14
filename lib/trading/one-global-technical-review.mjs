/** Attributed evidence review; integrity binding, never a signature or provider permission. */
import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const iso=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
const scopes=new Set(['SOURCE_MAPPING','PROVIDER_USAGE_RIGHTS','EXCHANGE_SESSION']);
function canonical(x){
  if(x===null||typeof x==='string'||typeof x==='boolean')return x;
  if(typeof x==='number'&&Number.isFinite(x))return x;
  if(Array.isArray(x))return x.map(canonical);
  if(x&&Object.getPrototypeOf(x)===Object.prototype)
    return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));
  throw Error('TECHNICAL_REVIEW_SUBJECT_NOT_JSON');
}
export function oneGlobalReviewSubjectSha256(subject){
  const fields=Object.fromEntries(Object.entries(subject).filter(([key])=>key!=='technicalReview'));
  return sha(JSON.stringify(canonical(fields)));
}
/** Keep authentic legacy owner review replayable. Delegation never sets reviewedByOwner. */
export function validOneGlobalEvidenceReview({subject,scope,evidenceSha256,authoritySnapshotHash,nowIso}={}){
  if(!subject||typeof subject!=='object')return false;
  if(subject.technicalReview===undefined)return subject.reviewedByOwner===true;
  const r=subject.technicalReview;
  if(subject.reviewedByOwner!==false||!r||r.kind!=='DELEGATED_PROJECT_TECHNICAL_REVIEW'
    ||r.reviewer?.role!=='DELEGATED_PROJECT_OPERATOR'||typeof r.reviewer.name!=='string'
    ||!/^[A-Za-z0-9 ._-]{2,80}$/.test(r.reviewer.name)||!scopes.has(scope)||r.scope!==scope
    ||r.outcome!=='APPROVED_FOR_DOCUMENTED_SCOPE'||!hash(authoritySnapshotHash)
    ||r.authoritySnapshotHash!==authoritySnapshotHash||!hash(evidenceSha256)
    ||r.evidenceSha256!==evidenceSha256||!hash(r.subjectSha256)
    ||!iso(nowIso)||!iso(r.reviewedAt)||r.reviewedAt>nowIso
    ||typeof r.reviewedCommit!=='string'||!/^[a-f0-9]{40}$/.test(r.reviewedCommit)
    ||typeof r.basis!=='string'||r.basis.trim().length<20||r.basis.length>2000)return false;
  if(subject.reviewedAt!==undefined&&subject.reviewedAt!==r.reviewedAt)return false;
  try{return r.subjectSha256===oneGlobalReviewSubjectSha256(subject);}catch{return false;}
}

// Reviewed full original PDF bytes on 2026-11-14. These are public-document
// hashes, never private consent/price hashes. Unknown revisions stay unreviewed.
// Findings are narrower than permission and MUST NOT create approval certificates.
const reviewedAt='2026-11-14T22:07:42.000Z';
const reviewedCommit='b2c3eb33c119d45d2bda261582f3c447bd0e6bfd';
const findings={
  '88ed3d22fe0f3624e76e53a210db3498b4a90712ab0d934356cc84b19ed1468a':{
    providerId:'alpha-vantage',outcome:'PRIVATE_SCOPE_TEXT_SUPPORTED',
    basis:'Original terms section 2 supports personal non-commercial analysis and testing. User eligibility, exact dataset entitlement and daily-close upstream independence are not established by this text.',
    blockers:['USER_AND_DATASET_SCOPE_NOT_ESTABLISHED','DAILY_UPSTREAM_INDEPENDENCE_NOT_PROVEN']},
  '2dc774d4aeeafbe4c7f0565e7842d932bc8bc10488af805fce43b8734e7b9859':{
    providerId:'alpaca-sip',outcome:'ACCOUNT_SCOPE_UNRESOLVED',
    basis:'Original terms permit limited personal use but contain a U.S.-residents scope. Public historical-SIP FAQ and Paper Only IEX entitlement documentation require account-specific reconciliation. HTTP success alone is not that evidence.',
    blockers:['ACCOUNT_AND_GEOGRAPHIC_SCOPE_UNRESOLVED','PAPER_ONLY_IEX_VERSUS_HISTORICAL_SIP_SCOPE_UNRESOLVED']},
};
/** Caller must first verify original bytes. This record is a review, not original provider terms. */
export function oneGlobalPublicDocumentReview({providerId,evidenceSha256}={}){
  const f=findings[evidenceSha256];
  if(!f||f.providerId!==providerId)return null;
  return {kind:'ONE_GLOBAL_PUBLIC_DOCUMENT_TECHNICAL_REVIEW',reviewer:{role:'DELEGATED_PROJECT_OPERATOR',name:'Codex'},
    reviewedAt,reviewedCommit,evidenceSha256,...structuredClone(f),reviewedByOwner:false,
    rightsApproved:false,independenceCertified:false,liveTradingAllowed:false};
}
