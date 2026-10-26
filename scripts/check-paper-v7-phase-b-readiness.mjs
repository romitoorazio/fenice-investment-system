/**
 * Safe non-executable Phase B status assembled from ORIGINAL V6 evidence,
 * existing V7 venue engine, future signed approval verifier and fixture
 * accounting. Never consumes provider secrets, queues, invokes broker or writes.
 */
import {readFile} from "node:fs/promises";
import {assessV7PhaseBPreparation} from "../lib/ui/paper-v7-phase-b-preparation.mjs";
import {verifyFuturePhaseBAuthorization}
  from "../lib/trading/paper-v7-phase-b-authorization.mjs";
import {newFixturePhaseBLedger,replayFixturePhaseBLedger}
  from "../lib/trading/paper-v7-phase-b-fixture-ledger.mjs";
import {runWorldPaperV7} from "../lib/trading/world-paper-v7.mjs";
import {computePaperValidationFingerprint} from "../lib/trading/validation-fingerprint.mjs";

const root = new URL("../",import.meta.url);
const read = async p => JSON.parse(await readFile(new URL(p,root),"utf8"));
const [manifest,candidate,v6Approval,v6Campaign,v6Ledger,v6Queue,v6Continuation,
  master,seeds] = await Promise.all([
  "data/paper-v7-phase-b-preparation.json",
  "data/paper-v7-phase-b-candidate-reference.json",
  "data/paper-validation-approval.json",
  "data/paper-validation-campaign.json",
  "data/paper-oms-state.json",
  "data/paper-order-queue.json",
  "data/paper-v6-continuation-plan.json",
  "data/instrument-master.json",
  "data/world-paper-v7-research-seeds.json",
].map(read));
const nowIso=new Date().toISOString();
const v6Core=await computePaperValidationFingerprint(new URL(".",root).pathname);
const custodyMatches=v6Core.complete===true
  &&v6Core.digest===v6Campaign?.baselineFingerprint?.digest;
const preparation=assessV7PhaseBPreparation({
  manifest,approvalV6:v6Approval,campaignV6:v6Campaign,
  ledgerV6:v6Ledger,queueV6:v6Queue,continuationV6:v6Continuation,
});
const noOperatorApproval=verifyFuturePhaseBAuthorization({
  envelope:null,trustedOperatorPublicKeyPem:null,
  expectedBaselineSha:manifest.candidate.candidateBaselineCommit,
  expectedBaselineDigest:manifest.candidate.candidateFingerprintSha256,
  proposedRiskPolicy:manifest.proposedRiskLimits,
});
const model=runWorldPaperV7({
  nowIso,instruments:[...master.instruments,...seeds.instruments],
  sessions:[],quotes:[],fx:[],entitlements:{sources:[],sessions:[],fx:[]},
  intents:[],paperRunAuthorized:false,
});
const fixture=replayFixturePhaseBLedger(newFixturePhaseBLedger());
const readiness={
  generatedAt:nowIso,
  state:"PHASE_B_BLOCKED_AWAITING_EXTERNAL_APPROVAL_AND_EXECUTION_EVIDENCE",
  proposedVirtualSeedEuro:10000,
  fixtureLedgerValid:fixture.valid,
  fixtureFills:fixture.summary?.fixtureFills??null,
  genuinePhaseBFills:0,
  approvedPhaseBBaseline:manifest.candidate.candidateBaselineCommit,
  candidateCodeReferenceSha:candidate.referenceCommitSha,
  candidateReferenceIsCertification:false,
  preparation:preparation.state,
  v6FrozenFingerprintMatches:custodyMatches,
  v6HistoricalFills:v6Ledger.executions.filter(e=>e.status==="PAPER_FILLED").length,
  historicalFillsCreditedToPhaseB:0,
  signedOperatorApproval:noOperatorApproval.state,
  approvalExpiry:manifest.authorization.expiresAt,
  worldMarketListingsExamined:model.summary.pilotListings,
  realtimePAPERVerifiedListings:model.summary.independentlyVerifiedListings,
  independentlyAttestedMarketDataRights:false,
  blockers:[
    "FINAL_PHASE_B_CODE_BASELINE_AND_AUDIT_SIGNOFF_MISSING",
    "SPECIFIC_TIME_BOUNDED_OPERATOR_SIGNATURE_MISSING",
    "INDEPENDENT_SOURCE_RIGHTS_AND_FRESH_EXECUTION_QUORUM_MISSING",
    "ATOMIC_OPERATIONAL_PHASE_B_JOURNAL_NOT_CONNECTED",
  ],
  readsCredentialValues:false,modifiesProviderKeys:false,
  generatesOrderQueue:false,canRunNewPaperProbes:false,
  canBookGenuinePhaseBFills:false,brokerConnectivityAllowed:false,
  liveTradingAllowed:false,updatesV6:false,
};
if(preparation.state!=="PREPARATION_SAFE_UNAPPROVED"
  ||custodyMatches!==true||fixture.valid!==true
  ||fixture.summary.fixtureFills!==0
  ||model.summary.filledPaperOrders!==0||model.paperRunAuthorized!==false
  ||readiness.canRunNewPaperProbes!==false)
  throw new Error("PHASE_B_READ_ONLY_PREFLIGHT_SAFETY_INVARIANT");
console.log(JSON.stringify(readiness,null,2));
