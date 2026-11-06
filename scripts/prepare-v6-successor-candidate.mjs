#!/usr/bin/env node
// Candidate-only transition: no mutation, no certification, no broker access.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { computePaperValidationFingerprint } from "../lib/trading/validation-fingerprint.mjs";
import { evaluatePaperBaselineEligibility } from "../lib/trading/paper-baseline.mjs";

const bytes=readFileSync("data/paper-validation-campaign.json");
const campaign=JSON.parse(bytes.toString("utf8"));
const hash=createHash("sha256").update(bytes).digest("hex");
if(hash!=="4380ab3ce24d8b59f8f2acba390fb39c0577331970fb791a5a2ae59232a93df1") throw Error("HISTORICAL_V6_CHANGED");
if(campaign.dailyEvidence?.length!==42 || campaign.liveTradingAllowed!==false) throw Error("HISTORICAL_V6_INVALID");
const archivedBytes=readFileSync("data/paper-history/v6-20260925-campaign.json");
const archiveHash=createHash("sha256").update(archivedBytes).digest("hex");
if(archiveHash!==hash || !archivedBytes.equals(bytes)) throw Error("HISTORICAL_V6_ARCHIVE_MISMATCH");
const oms=JSON.parse(readFileSync("data/paper-oms-state.json","utf8"));
if(oms.mode!=="PAPER" || oms.liveTradingAllowed!==false || oms.brokerConnectivityAllowed!==false) throw Error("PAPER_ONLY_GATE_BLOCKED");
const successorApprovalFile="data/paper-successor-operational-approval.json";
const successorApprovalPresent=existsSync(successorApprovalFile);
const approval=JSON.parse(readFileSync(successorApprovalPresent?successorApprovalFile:"data/paper-validation-approval.json","utf8"));
const operatorAuthorization=JSON.parse(readFileSync("data/paper-successor-operator-authorization.json","utf8"));
const operatorConsent=operatorAuthorization.authorized===true && operatorAuthorization.mode==="PAPER" && operatorAuthorization.liveTradingAllowed===false && operatorAuthorization.brokerConnectivityAllowed===false && operatorAuthorization.automaticActivationAllowed===false && operatorAuthorization.requiresFreshOperationalApproval===true;
const approvalExpiresAt=Date.parse(approval.expiresAt||"");
const approvalGrantedAt=Date.parse(approval.approvedAt||"");
const approvalEligible=approval.approved===true && approval.mode==="PAPER" &&
  approval.liveTradingAllowed===false && approval.brokerConnectivityAllowed===false &&
  approval.humanConfirmation===true && Number.isFinite(approvalGrantedAt) &&
  approvalGrantedAt>Date.parse("2026-11-06T00:00:00.000Z") && approvalGrantedAt<=Date.now() &&
  Number.isFinite(approvalExpiresAt) && approvalExpiresAt>Date.now()+30*24*60*60*1000 &&
  approval.approvalId!== "fenice-paper-validation-v6-2026-09-24";
const [sources,intelligence,executionMarket,executionCoverage,governance,fxEvidence]=[
  "data/global-source-health.json","data/intelligence-quality.json",
  "data/execution-market-evidence.json","data/execution-market-coverage.json",
  "data/decision-governance.json","data/paper-fx-evidence.json"
].map(path=>JSON.parse(readFileSync(path,"utf8")));
const fingerprint=await computePaperValidationFingerprint(process.cwd());
const eligibility=evaluatePaperBaselineEligibility({sources,intelligence,executionMarket,executionCoverage,governance,fxEvidence,approval,fingerprint});
if(!fingerprint.complete) throw Error("CANDIDATE_CORE_INCOMPLETE");
const head=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
const dirty=execFileSync("git",["status","--porcelain","--untracked-files=no"],{encoding:"utf8"}).trim();
if(dirty) throw Error("CANDIDATE_WORKTREE_DIRTY");
const coverageRows=Array.isArray(executionCoverage.rows)?executionCoverage.rows:[];
const eligibleCoverage=coverageRows.filter(row=>row.paperEligible===true);
const eligibleSymbols=eligibleCoverage.map(row=>row.symbol);
const nonUsEquityEligible=eligibleCoverage.filter(row=>row.symbol==="ASML" || row.symbol==="TSM");
const geographicCoverage={
  scope:"Observed execution evidence only; listing venue is not inferred from ticker or issuer domicile",
  paperEligibleSymbols:eligibleSymbols,
  paperEligibleCount:eligibleCoverage.length,
  requestedCount:coverageRows.length,
  nonUsProxySymbolsInUniverse:coverageRows.filter(row=>["ASML","TSM"].includes(row.symbol)).map(row=>({symbol:row.symbol,paperEligible:row.paperEligible===true,reasons:row.reasons||[]})),
  nonUsProxyEligibleCount:nonUsEquityEligible.length,
  globalVenueParityProven:false,
  warning:"Global exchange parity is not demonstrated by the present evidence; US-listed proxies are not proof of native Tokyo, Milan, Frankfurt or other exchange coverage."
};
const readinessBlockers=[
  ...(!operatorConsent?["OPERATOR_PAPER_CONSENT_REQUIRED"]:[]),
  ...(!approvalEligible?["FRESH_TIME_BOUND_PAPER_APPROVAL_REQUIRED"]:[]),
  ...(!eligibility.eligible?["MARKET_DATA_BASELINE_INELIGIBLE",...eligibility.reasons.map(reason=>"DATA: "+reason)]:[]),
  "SUCCESSOR_BASELINE_TRANSITION_NOT_ACTIVATED"
];
const candidate={
  kind:"PAPER_V6_SUCCESSOR_CANDIDATE_NOT_ACTIVATED",
  historicalCampaign:{sha256:hash,records:42,baselineCommit:campaign.baselineCommit},
  candidate:{baselineCommit:head,baselineFingerprint:fingerprint,startedAt:null,dailyEvidence:[],approved:false,certified:false},
  geographicCoverage,
  marketDataPreflight:{eligible:eligibility.eligible,reasons:eligibility.reasons,gates:eligibility.gates,metrics:eligibility.metrics},
  operatorConsent:{recorded:operatorConsent,authorizationDate:operatorAuthorization.authorizedOn||null,scope:"PAPER_ONLY_CONDITIONAL"},
  approvalPreflight:{eligible:approvalEligible,source:successorApprovalPresent?"SUCCESSOR_APPROVAL":"EXPIRED_V6_APPROVAL",expiresAt:approval.expiresAt||null,requiresFreshSuccessorApproval:!approvalEligible,requiresHumanConfirmation:true,minimumWindowDays:30},
  transitionReadiness:{readyForActivation:false,blockers:readinessBlockers},
  activationGates:["archive historical campaign bytes and verify sha256","fresh PAPER-only approval","independent data and FX eligibility","governance and ledger reconciliation","atomic successor activation with freeze-guard compatibility"],
  liveTradingAllowed:false,brokerConnectivityAllowed:false
};
console.log(JSON.stringify(candidate,null,2));
