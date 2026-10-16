/**
 * Read-only V6 observer. Certification counters, rather than raw dated rows,
 * determine progress. Expired queued orders require human review; this code
 * never submits, clears, backdates or validates an order.
 */
const nonnegative = x => Number.isSafeInteger(x) && x >= 0;
export function evaluateV6ObserverIntegrity({campaign,approval,plan,oms,queue,conditionalQueue,certification,now=Date.now()}={}){
  const issues=[];
  const issue=(bad,code)=>{if(bad)issues.push(code)};
  const validClock=nonnegative(now);
  const expiry=Date.parse(approval?.expiresAt||"");
  const validExpiry=typeof approval?.expiresAt==="string"
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(approval.expiresAt)
    && Number.isSafeInteger(expiry)&&expiry>=0
    && new Date(expiry).toISOString() === (approval.expiresAt.includes(".")?approval.expiresAt:approval.expiresAt.replace(/Z$/,".000Z"));
  const expired=validClock&&validExpiry?now>expiry:null;
  issue(!validClock,"OBSERVER_CLOCK_INVALID");
  issue(!validExpiry||plan?.v6?.originalExpiresAt!==approval?.expiresAt
    ||plan?.v6?.originalApprovalId!==approval?.approvalId
    ||plan?.v6?.baselineCommit!==campaign?.baselineCommit
    ||plan?.v6?.baselineDigest!==campaign?.baselineFingerprint?.digest,
    "ORIGINAL_V6_IDENTITY_CHANGED");
  issue(campaign?.liveTradingAllowed!==false||oms?.mode!=="PAPER"
    ||oms?.liveTradingAllowed!==false||oms?.brokerConnectivityAllowed!==false
    ||approval?.mode!=="PAPER"||approval?.liveTradingAllowed!==false
    ||approval?.brokerConnectivityAllowed!==false,"LIVE_OR_BROKER_LOCK_INVALID");
  issue(queue?.mode!=="PAPER"||!Array.isArray(queue?.orders),"PAPER_QUEUE_UNVERIFIABLE");
  issue(conditionalQueue?.mode!=="PAPER"||!Array.isArray(conditionalQueue?.intents),"CONDITIONAL_QUEUE_UNVERIFIABLE");
  const pendingPaper=Array.isArray(queue?.orders)?queue.orders.length:null;
  const pendingConditional=Array.isArray(conditionalQueue?.intents)?conditionalQueue.intents.length:null;
  issue(expired===true&&((pendingPaper??1)>0||(pendingConditional??1)>0),
    "EXPIRED_APPROVAL_PENDING_ORDERS_QUARANTINE");
  const {evidenceDays,safetyEvidenceDays,fingerprintEvidenceDays,state,cumulativePaperFills}=
    certification||{};
  const counters=[evidenceDays,safetyEvidenceDays,fingerprintEvidenceDays];
  const validCounters=counters.every(nonnegative)
    && safetyEvidenceDays<=evidenceDays&&fingerprintEvidenceDays<=evidenceDays;
  issue(!validCounters,"CERTIFICATION_DAY_COUNTERS_INVALID");
  issue(state==="INVALID","CERTIFICATION_INTEGRITY_INVALID");
  const validFills=nonnegative(cumulativePaperFills)&&nonnegative(campaign?.minPaperFills);
  issue(!validFills,"CERTIFICATION_FILL_COUNTERS_INVALID");
  const missingFills=validFills?Math.max(0,campaign.minPaperFills-cumulativePaperFills):null;
  const certifiedSafeDays=validCounters?Math.min(...counters):0;
  const status=issues.length?"SAFETY_REVIEW_REQUIRED"
    :expired===true
      ?missingFills>0?"PHASE_B_REQUIRED_NO_NEW_PROBES":"PASSIVE_OBSERVATION_ONLY"
      :"ORIGINAL_V6_APPROVAL_ONLY";
  return {issues,status,certifiedSafeDays,rawEvidenceDays:validCounters?evidenceDays:null,
    pendingPaperOrders:pendingPaper,pendingConditionalIntents:pendingConditional,
    originalApprovalExpiresAt:validExpiry?new Date(expiry).toISOString():null,
    approvalExpired:expired,remainingFills:missingFills,
    newOrderAuthority:false,liveTradingAllowed:false,brokerConnectivityAllowed:false,
    mutatesEvidence:false,mutatesQueue:false};
}
