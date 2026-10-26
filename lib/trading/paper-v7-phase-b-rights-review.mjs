/**
 * Verify an independent, time-limited licensing/evidence review signature.
 * This verifies reviewer attestation, NOT the underlying legal contract.
 * The reviewer public key pin must arrive out-of-band from trusted config.
 */
import {createHash,createPublicKey,verify} from "node:crypto";
const digest=x=>createHash("sha256").update(x).digest("hex");
const iso=t=>typeof t==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(t)
  &&Number.isSafeInteger(Date.parse(t))&&new Date(t).toISOString()===t?Date.parse(t):null;
const fp=x=>typeof x==="string"&&/^[a-f0-9]{64}$/.test(x);
const FIELDS=["version","reviewId","scope","rightsEvidenceSha256","validFrom","validUntil",
  "sourceFamilies","venueMics","fxCurrencies","approvedForAutomatedPaper"];
const stable=x=>JSON.stringify(Object.fromEntries(FIELDS.map(k=>[k,x[k]])));
export function verifyIndependentPhaseBDataRightsReview({
  envelope,reviewerPublicKeyPem,reviewerSpkiSha256,
  requiredSourceFamilies,requiredVenue,requiredCurrency,nowMs=Date.now(),
}={}) {
  const p=envelope?.payload;
  const errors=[],requireOk=(bool,code)=>{if(!bool)errors.push(code)};
  const exact=p!==null&&typeof p==="object"&&!Array.isArray(p)
    &&Object.keys(p).length===FIELDS.length&&FIELDS.every(k=>Object.hasOwn(p,k));
  requireOk(exact,"RIGHTS_REVIEW_PAYLOAD_NOT_CANONICAL");
  requireOk(Number.isSafeInteger(nowMs)&&nowMs>0
    &&p?.version===1&&p?.scope==="PRIVATE_AUTOMATED_PAPER_SIMULATION"
    &&p?.approvedForAutomatedPaper===true
    &&typeof p?.reviewId==="string"&&/^phase-b-rights-[a-z0-9-]{8,64}$/.test(p.reviewId)
    &&fp(p?.rightsEvidenceSha256),"UNVERIFIED_RIGHTS_EVIDENCE_AND_SCOPE");
  const from=iso(p?.validFrom),to=iso(p?.validUntil);
  requireOk(from!==null&&to!==null&&from<=nowMs&&nowMs<to,
    "DATA_RIGHTS_REVIEW_NOT_CURRENT");
  const familyArray=Array.isArray(p?.sourceFamilies)?p.sourceFamilies:[];
  const families=Array.isArray(requiredSourceFamilies)?requiredSourceFamilies:[];
  requireOk(families.length>=2
    &&new Set(families).size===families.length
    &&families.every(f=>typeof f==="string"&&f.length>2&&familyArray.includes(f))
    &&new Set(familyArray).size===familyArray.length,
    "INDEPENDENT_SOURCE_FAMILY_RIGHTS_MISSING");
  requireOk(typeof requiredVenue==="string"&&p?.venueMics?.includes?.(requiredVenue)===true
    &&(requiredCurrency==="EUR"
      ||(requiredCurrency==="USD"&&p?.fxCurrencies?.includes?.("USD/EUR")===true)),
    "VENUE_OR_FX_LICENSE_NOT_ATTESTED");
  let pinValid=false,signatureValid=false;
  try{
    const key=createPublicKey(reviewerPublicKeyPem);
    const observed=digest(key.export({type:"spki",format:"der"}));
    pinValid=key.asymmetricKeyType==="ed25519"&&fp(reviewerSpkiSha256)
      &&reviewerSpkiSha256===observed;
    const sig=envelope?.signatureBase64;
    signatureValid=pinValid&&typeof sig==="string"
      &&/^[A-Za-z0-9+/]{64,120}={0,2}$/.test(sig)
      &&verify(null,Buffer.from(stable(p)),key,Buffer.from(sig,"base64"));
  }catch{/* fail closed */}
  requireOk(pinValid,"INDEPENDENT_RIGHTS_REVIEWER_PIN_MISSING");
  requireOk(signatureValid,"INDEPENDENT_RIGHTS_REVIEW_SIGNATURE_INVALID");
  return {
    state:errors.length?"RIGHTS_REVIEW_UNVERIFIED":"SIGNED_REVIEW_VERIFIED_NOT_LEGAL_CERTIFICATION",
    reasons:errors,reviewId:signatureValid?p.reviewId:null,
    reviewedRightsEvidenceSha256:signatureValid?p.rightsEvidenceSha256:null,
    independentLegalOpinionSuppliedByThisModule:false,
    operationalPaperOrdersAllowedByThisModule:false,
    liveTradingAllowed:false,
  };
}
