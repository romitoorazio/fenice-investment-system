/**
 * Detached-signature verifier for a FUTURE V7 Phase B PAPER authorization.
 * No signing key, approval, expiry or trusted operator public key is installed
 * by this module. Never takes public keys from an approval envelope itself.
 * A valid signature is necessary but not sufficient to enable simulation.
 */
import {createPublicKey,verify,createHash} from "node:crypto";
const sha40=s=>typeof s==="string"&&/^[a-f0-9]{40}$/.test(s);
const sha64=s=>typeof s==="string"&&/^[a-f0-9]{64}$/.test(s);
const utc=s=>{
  if(typeof s!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s))return null;
  const t=Date.parse(s);
  return Number.isFinite(t)&&new Date(t).toISOString()===s?t:null;
};
const FIELDS=["version","approvalId","mode","approved","baselineSha",
  "baselineDigest","policySha256","issuedAt","notBefore","expiresAt",
  "virtualStartingCapitalEuro","maxOrdersPerDay","maxAttempts","maxNotionalEuro",
  "maxCapitalPercentPerProbe","minCalendarDays","minEvidenceDays",
  "minPaperFills","brokerSubmissionAllowed","liveTradingAllowed"];
const stablePayload=payload=>JSON.stringify(Object.fromEntries(FIELDS.map(k=>[k,payload[k]])));
export const phaseBPolicyDigest = policy => {
  if(!policy||typeof policy!=="object"||Array.isArray(policy))return null;
  const rows=[
    policy.virtualStartingCapitalEuro,policy.maxOrdersPerDay,policy.maxProbeAttemptsTotal,
    policy.minTcaProbeNotionalEuro,policy.maxNotionalEuroPerOrder,
    policy.maxCapitalPercentPerProbe,policy.maxSingleAssetWeightPercentForProbe,
    policy.minCommitteeScore,policy.minValidationDataConfidence,
    policy.maxRiskScore,policy.minCalendarDays,policy.minEvidenceDays,
    policy.minGenuineNewPhaseFills,JSON.stringify(policy.fxPolicy),
    JSON.stringify(policy.permittedDecisionStates),
    JSON.stringify(policy.permittedCurrencies),
  ];
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
};
export function verifyFuturePhaseBAuthorization({
  envelope, trustedOperatorPublicKeyPem, trustedOperatorKeySpkiSha256,
  expectedBaselineSha,
  expectedBaselineDigest, proposedRiskPolicy, nowMs=Date.now(),
}={}) {
  const reasons=[];
  const fail=(valid,code)=>{if(!valid)reasons.push(code)};
  const p=envelope?.payload;
  const exactly=!!p&&typeof p==="object"&&!Array.isArray(p)
    &&Object.keys(p).length===FIELDS.length
    &&FIELDS.every(key=>Object.hasOwn(p,key));
  fail(exactly,"SIGNED_PAYLOAD_NOT_CANONICAL");
  const issued=utc(p?.issuedAt),starts=utc(p?.notBefore),ends=utc(p?.expiresAt);
  fail(Number.isSafeInteger(nowMs)&&nowMs>=0,"INVALID_REVIEW_CLOCK");
  fail(typeof p?.approvalId==="string"&&/^fenice-v7-phase-b-[a-z0-9-]{8,72}$/.test(p.approvalId)
    &&p?.version===1&&p?.mode==="PAPER_SIMULATION_ONLY"
    &&p?.approved===true&&p?.brokerSubmissionAllowed===false
    &&p?.liveTradingAllowed===false,
    "APPROVAL_SCOPE_INVALID");
  fail(sha40(expectedBaselineSha)&&sha64(expectedBaselineDigest)
    &&p?.baselineSha===expectedBaselineSha&&p?.baselineDigest===expectedBaselineDigest,
    "PHASE_B_BASELINE_NOT_BOUND");
  const policyHash=phaseBPolicyDigest(proposedRiskPolicy);
  fail(sha64(policyHash)&&p?.policySha256===policyHash
    &&proposedRiskPolicy?.virtualStartingCapitalEuro===10000
    &&p?.virtualStartingCapitalEuro===10000
    &&p?.maxOrdersPerDay===1&&p?.maxAttempts===20
    &&p?.maxNotionalEuro===300&&p?.maxCapitalPercentPerProbe===3
    &&p?.minCalendarDays===30&&p?.minEvidenceDays===25
    &&p?.minPaperFills===10,
    "SIGNED_LIMITS_OR_POLICY_MISMATCH");
  fail(issued!==null&&starts!==null&&ends!==null&&issued<=starts&&starts<ends
    &&ends-starts>=30*86400_000
    &&Number.isSafeInteger(nowMs)&&issued<=nowMs&&starts<=nowMs&&nowMs<ends,
    "AUTHORIZATION_WINDOW_NOT_ACTIVE_OR_30_DAYS_TOO_SHORT");
  fail(typeof trustedOperatorPublicKeyPem==="string"
    &&trustedOperatorPublicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----"),
    "NO_PINNED_OPERATOR_VERIFICATION_KEY");
  // Pin the trusted key fingerprint OUTSIDE the signed envelope and outside
  // any user-provided observation bundle. A matching signature is meaningless
  // when the attacker may replace both the signature and public key.
  let keyPinned=false, signatureValid=false;
  if(exactly&&typeof envelope?.signatureBase64==="string"
    &&/^[A-Za-z0-9+/]{64,120}={0,2}$/.test(envelope.signatureBase64)
    &&typeof trustedOperatorPublicKeyPem==="string"){
    try{
      const key=createPublicKey(trustedOperatorPublicKeyPem);
      const keyHash=createHash("sha256").update(
        key.export({type:"spki",format:"der"})).digest("hex");
      keyPinned=key.asymmetricKeyType==="ed25519"
        &&sha64(trustedOperatorKeySpkiSha256)
        &&keyHash===trustedOperatorKeySpkiSha256;
      signatureValid=keyPinned&&verify(null,Buffer.from(stablePayload(p),"utf8"),
        key,Buffer.from(envelope.signatureBase64,"base64"));
    }catch{signatureValid=false}
  }
  fail(keyPinned,"TRUSTED_OPERATOR_KEY_FINGERPRINT_NOT_PINNED");
  fail(signatureValid,"OPERATOR_SIGNATURE_NOT_VERIFIED");
  return {
    state:reasons.length?"AUTHORIZATION_UNVERIFIED":"SIGNATURE_AND_SCOPE_VALID_REVIEW_ONLY",
    reasons,approvalId:signatureValid?p.approvalId:null,
    checkedPolicySha256:policyHash,
    externallyPinnedOperatorKeyMatch:keyPinned,
    // Cryptography alone cannot attest real market-data licensing, persisted
    // journal atomicity, selected code SHA on runner or human identity.
    independentOwnerIdentityVerifiedByThisModule:false,
    realMarketDataRightsVerified:false,
    currentDeployedBaselineVerified:false,
    canCreatePaperFills:false,canSendBrokerOrders:false,
    liveTradingAllowed:false,
  };
}
