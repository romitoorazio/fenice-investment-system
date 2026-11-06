/** Pure read-only boundary: preserve source provenance, never label synthetic input as real. */
import {getVenue} from "./venue-registry.mjs";
export function classifyEvidenceBundle({identity,calendarObservation,quotes,fxEvidence,fxObservations,fill,nowIso}){
  const fail=(reason)=>({accepted:false,classification:"UNVERIFIED",reason});
  const venue=getVenue(identity?.mic),now=Date.parse(nowIso);
  if(!venue||!Number.isFinite(now)||!identity?.instrumentId||!identity?.sessionDate)return fail("BUNDLE_IDENTITY_INVALID");
  if(!calendarObservation||!Array.isArray(quotes)||!quotes.length||!fxEvidence||!fill)return fail("BUNDLE_INCOMPLETE");
  const sources=[calendarObservation,fxEvidence,...quotes,...(fxObservations??[])];
  if(sources.some(s=>typeof s?.sourceId!=="string"||!s.sourceId.trim()||!Number.isFinite(Date.parse(s.observedAt??""))))return fail("BUNDLE_SOURCE_PROVENANCE_MISSING");
  if(sources.some(s=>Date.parse(s.observedAt)>now))return fail("BUNDLE_FUTURE_SOURCE");
  // Conflicting synthetic flags, identifiers or real-provider metadata cannot be trusted.
  if(sources.some(s=>(s.synthetic===false&&/^synthetic[-_:]/i.test(s.sourceId))||(s.synthetic===true&&(typeof s.sourceUrl==="string"&&s.sourceUrl.trim()||typeof s.provider==="string"&&s.provider.trim()))))return fail("CONTRADICTORY_SOURCE_PROVENANCE");
  const synthetic=sources.some(s=>s.synthetic===true||/^synthetic[-_:]/i.test(s.sourceId));
  const real=sources.every(s=>s.synthetic===false&&typeof s.sourceUrl==="string"&&/^https:\/\//.test(s.sourceUrl)&&typeof s.provider==="string"&&s.provider.trim());
  // An unverified live response must not be laundered through a synthetic test bundle.
  if(sources.some(s=>s.verificationStatus==="PROVIDER_RESPONSE_UNVERIFIED"))return fail("PROVIDER_RESPONSE_UNVERIFIED");
  // Never allow a synthetic marker on one source to launder mixed real/unverified inputs.
  if(synthetic&&sources.some(s=>!(s.synthetic===true||/^synthetic[-_:]/i.test(s.sourceId))))return fail("MIXED_SYNTHETIC_REAL_PROVENANCE");
  if(synthetic)return {accepted:true,classification:"SYNTHETIC_TEST_ONLY",reason:null};
  if(!real)return fail("REAL_SOURCE_ATTESTATION_MISSING");
  return {accepted:true,classification:"REAL_SOURCE_ATTESTED_NOT_VERIFIED",reason:null};
}
