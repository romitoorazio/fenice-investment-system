const reject=reason=>({allowed:false,reason,authorizesOrders:false,liveTradingAllowed:false});
export function gate({approval,queue,campaign,plan,now=Date.now()}={}){
  if(!Number.isSafeInteger(now)||now<0)return reject("clock-invalid");
  if(plan?.phase!=="PREPARATION_NOT_EXECUTION"||plan?.purpose!=="PREPARE_PAPER_V6_CONTINUATION_ONLY"
  ||plan?.v6?.originalApprovalId!==approval?.approvalId
  ||plan?.v6?.baselineCommit!==campaign?.baselineCommit
  ||plan?.v6?.baselineDigest!==campaign?.baselineFingerprint?.digest)return reject("baseline-invalid");
  if(campaign?.version!==6||campaign?.liveTradingAllowed!==false||campaign?.baselineFingerprint?.complete!==true
  ||approval?.approved!==true||approval?.humanConfirmation!==true||approval?.mode!=="PAPER"
  ||approval?.liveTradingAllowed!==false||approval?.brokerConnectivityAllowed!==false
  ||plan?.absoluteRestrictions?.mayRenewV6Approval!==false
  ||plan?.absoluteRestrictions?.mayStageNewProbesAfterOriginalExpiry!==false)return reject("safety-lock-invalid");
  const expiry=Date.parse(approval?.expiresAt||"");
  if(approval?.expiresAt!==plan?.v6?.originalExpiresAt||!Number.isFinite(expiry))
    return reject("expiry-invalid");
  if(now+20*60000>expiry)return reject("expiry-too-close");
  const limits=plan?.unchangedApprovalLimits;
  const keys=["targetPaperFills","maxProbeAttemptsTotal","maxOrdersPerDay","maxNotionalEuroPerOrder",
    "maxCapitalPercentPerProbe","minTcaProbeNotionalEuro","maxSingleAssetWeightPercentForProbe",
    "minCommitteeScore","minValidationDataConfidence","maxRiskScore"];
  if(!limits||keys.some(k=>typeof limits[k]!=="number"||approval[k]!==limits[k])
    ||approval.idPrefix!==limits.idPrefix
    ||JSON.stringify(approval.fxPolicy)!==JSON.stringify(limits.fxPolicy)
    ||JSON.stringify(approval.permittedCurrencies)!==JSON.stringify(limits.permittedCurrencies)
    ||JSON.stringify(approval.permittedDecisionStates)!==JSON.stringify(limits.permittedDecisionStates))
    return reject("limits-invalid");
  if(queue?.mode!=="PAPER"||!Array.isArray(queue?.orders))return reject("queue-invalid");
  if(queue.orders.length!==0)return reject("queue-pending");
  return {allowed:true,reason:"pre-dispatch-only",authorizesOrders:false,liveTradingAllowed:false};
}
if(process.argv[1]&&import.meta.url===new URL("file://"+process.argv[1]).href){
  try{console.log(JSON.stringify(gate({
    approval:JSON.parse(process.env.APPROVAL_JSON||"null"),
    queue:JSON.parse(process.env.QUEUE_JSON||"null"),
    campaign:JSON.parse(process.env.CAMPAIGN_JSON||"null"),
    plan:JSON.parse(process.env.PLAN_JSON||"null")
  })))}catch{console.log(JSON.stringify(reject("input-invalid")))}
}
