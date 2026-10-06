export type V7ProposalReadinessRow = {
  symbol: string;
  rank: number | null;
  name: string;
  currency: string | null;
  committeeDecision: string | null;
  terminalDecision: string | null;
  committeeScore: number | null;
  calibratedConfidence: number | null;
  rawCommitteeConfidence: number | null;
  terminalConfidence: number | null;
  validationDataConfidence: number | null;
  riskScore: number | null;
  executionCoverage: {
    paperEligible: boolean;
    independentSourceFamilies: number;
    state: string;
  };
  gaps: Record<string, number | null>;
  validationStructurallyReady: boolean;
  reviewProposalStructurallyReady: boolean;
  validationCandidateReady: boolean;
  reviewProposalCandidateReady: boolean;
  validationLocalBlockers: string[];
  reviewProposalLocalBlockers: string[];
  validationCandidateBlockers: string[];
  reviewProposalCandidateBlockers: string[];
};

export type V7ProposalReadinessReport = {
  version: number;
  generatedAt: string;
  purpose: string;
  safety: {
    diagnosticOnly: boolean;
    queueWritesAllowed: boolean;
    paperCertificationEvidenceMutationAllowed: boolean;
    brokerSubmissionAllowed: boolean;
    liveTradingAllowed: boolean;
    userApprovalStillRequired: boolean;
    finalProposalRecheckStillRequired: boolean;
  };
  sharedGlobalBlockers: string[];
  validationGlobalBlockers: string[];
  candidateCount: number;
  validationStructurallyReadyCount: number;
  reviewProposalStructurallyReadyCount: number;
  validationCandidateReadyCount: number;
  reviewProposalCandidateReadyCount: number;
  rows: V7ProposalReadinessRow[];
};

export function buildV7ProposalReadiness(
  input?: {
    approval?: unknown;
    committee?: unknown;
    terminal?: unknown;
    coverage?: unknown;
    marketSession?: unknown;
  },
  now?: number,
): V7ProposalReadinessReport;
