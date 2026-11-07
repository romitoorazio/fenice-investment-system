/** Pure read-only boundary: preserve source provenance, never label synthetic input as real. */
import {getVenue} from "./venue-registry.mjs";
export function classifyEvidenceBundle({identity,calendarObservation,quotes,fxEvidence,fxObservations,fill,nowIso}){
  const fail=(reason)=>({accepted:false,classification:"UNVERIFIED",reason});
  const venue=getVenue(identity?.mic),now=Date.parse(nowIso);
  if(!venue||!Number.isFinite(now)||!identity?.instrumentId||!identity?.sessionDate)return fail("BUNDLE_IDENTITY_INVALID");
  if(!calendarObservation||!Array.isArray(quotes)||!quotes.length||!fxEvidence||!fill)return fail("BUNDLE_INCOMPLETE");
  if(fxObservations!=null&&!Array.isArray(fxObservations))return fail("BUNDLE_SOURCE_PROVENANCE_MISSING");
  const sources=[calendarObservation,fxEvidence,...quotes,...(fxObservations??[])];
  if(sources.some(s=>typeof s?.sourceId!=="string"||!s.sourceId.trim()||!Number.isFinite(Date.parse(s.observedAt??""))))return fail("BUNDLE_SOURCE_PROVENANCE_MISSING");
  if(sources.some(s=>Date.parse(s.observedAt)>now))return fail("BUNDLE_FUTURE_SOURCE");
  const synthetic=sources.some(s=>s.synthetic===true||/^synthetic[-_:]/i.test(s.sourceId));
  const real=sources.every(s=>s.synthetic===false&&typeof s.sourceUrl==="string"&&/^https:\/\//.test(s.sourceUrl)&&typeof s.provider==="string"&&s.provider.trim());
  if(synthetic)return {accepted:true,classification:"SYNTHETIC_TEST_ONLY",reason:null};
  if(!real)return fail("REAL_SOURCE_ATTESTATION_MISSING");
  return {accepted:true,classification:"REAL_SOURCE_ATTESTED_NOT_VERIFIED",reason:null};
}
