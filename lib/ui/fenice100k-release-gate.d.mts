import type { HistoricalCredentialRotationAssessment } from "./credential-rotation-gate.mjs";
import type { ProductionGitHubCI } from "./github-production-checks.mjs";

/** Read-only typing contract for the pure ESM release gate used by Next.js. */
export type ReleaseStatus =
  | "SAFETY_BLOCKED"
  | "RESEARCH_USABLE_NOT_CERTIFIED"
  | "RESEARCH_CHECKS_INCOMPLETE";

export type ComparisonWindow = {pairs:number|null; independentDays:number|null};

export type ProductionCommitEvidence = {
  state:"DEPLOYMENT_METADATA_UNAVAILABLE"|"PRODUCTION_SHA_MISSING_OR_INVALID"
    |"CI_RECORD_MISSING_OR_STALE"|"MATCHES_RECORDED_MAIN_CI"|"PRODUCTION_CI_SHA_MISMATCH";
  deployedSha:string|null;
  recordedMainCiSha:string|null;
  deploymentEnvironment:"production"|"unverified";
  exactShaMatch:boolean;
  independentlyAttested:false;
  authorizesPaper:false;
  authorizesLive:false;
  note:string;
};

export declare function assessProductionCommitEvidence(engineeringEvidence?:unknown, options?:{
  deploymentCommit?:string|null;
  deploymentEnvironment?:string|null;
  now?:Date;
}):ProductionCommitEvidence;

export type Fenice100KReleaseReport = {
  version:1;
  assessedAt:string;
  overall:ReleaseStatus;
  completeForRealCapital:false;
  verifiedProfit:false;
  brokerAccountReconciled:false;
  gates:{
    credentialRotation:HistoricalCredentialRotationAssessment;
    dataQuality:{
      state:"RESEARCH_DATA_CURRENT"|"UNVERIFIED_OR_STALE";
      score:number|null;
      sourceReportAgeHours:number|null;
      committeeAgeHours:number|null;
      analyzedSymbols:number;
      timestampedSingleFamilyResearchQuotes:number;
      note:string;
    };
    riskSystem:{
      state:"HISTORICAL_MAIN_CI_VERIFIED"|"CI_EVIDENCE_STALE_OR_MISSING";
      validatedCommit:string|null;
      currentDeployedCommitVerified:false;
      productionCommitEvidence:ProductionCommitEvidence;
      externalProductionCI:ProductionGitHubCI|null;
      externalExactCIObserved:boolean;
      note:string;
    };
    paperCertification:{
      state:"NOT_CERTIFIED";
      verifiedEvidenceDays:number|null;
      requiredEvidenceDays:number|null;
      reportedFills:number|null;
      requiredFills:number|null;
      elapsedDays:number|null;
      minimumDurationDays:number|null;
      earliestMaturityAt:string|null;
      authorizationExpiresAt:string|null;
      numericalTargetsMet:boolean;
      note:string;
    };
    performance:{
      state:"NUMERICALLY_MATURE_HUMAN_REVIEW_REQUIRED"|"NOT_PROVEN";
      researchRecords:number;
      benchmark7d:ComparisonWindow;
      benchmark30d:ComparisonWindow;
      hasVerifiedRealizedProfit:false;
      note:string;
    };
    directa:{state:"LOCAL_READ_ONLY_NOT_VERIFIED";brokerWritesAllowed:false};
    liveLock:{state:"LOCKED"|"SAFETY_FAILURE";liveOrdersAllowed:false};
  };
  blockers:Array<{id:string;severity:"P0"|"P1";detail:string}>;
  safety:{
    diagnosticOnly:true;
    modifiesV6DecisionPolicy:false;
    paperCertificationEligible:false;
    brokerSubmissionAllowed:false;
    liveTradingAllowed:false;
    automaticPaperRenewalAllowed:false;
  };
};

export declare function assessFenice100KRelease(input?:{
  sourceHealth?:unknown;
  committee?:unknown;
  shadow?:unknown;
  paperWindow?:unknown;
  engineeringEvidence?:unknown;
  paperApproval?:unknown;
  deploymentCommit?:string|null;
  deploymentEnvironment?:string|null;
  externalProductionCI?:ProductionGitHubCI|null;
  now?:Date;
}):Fenice100KReleaseReport;
