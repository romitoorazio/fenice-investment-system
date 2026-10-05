import type { FeniceAIDecision } from "./ai-intelligence-core";

export interface FeniceProposalGuardInput {
  decision: FeniceAIDecision;
  evidenceCount: number;
  evidenceFresh: boolean;
  proposalTermsComplete: boolean;
  userApprovalRequired: boolean;
}

export interface FeniceProposalGuardResult {
  mayCreateProposal: boolean;
  mayExecute: false;
  blockedBy: string[];
}

/**
 * Bridge between intelligence and the proposal UI. It deliberately cannot
 * execute an order. Even an otherwise executable AI decision becomes only a
 * reviewable proposal and still requires the existing deterministic pipeline.
 */
export function guardFeniceAIProposal(input: FeniceProposalGuardInput): FeniceProposalGuardResult {
  const blockedBy = [...input.decision.blockedBy];
  if (input.evidenceCount < 2) blockedBy.push("INSUFFICIENT_INDEPENDENT_EVIDENCE");
  if (!input.evidenceFresh) blockedBy.push("STALE_EVIDENCE");
  if (!input.proposalTermsComplete) blockedBy.push("INCOMPLETE_PROPOSAL_TERMS");
  if (!input.userApprovalRequired) blockedBy.push("USER_APPROVAL_BYPASS_FORBIDDEN");
  return { mayCreateProposal: blockedBy.length === 0, mayExecute: false, blockedBy };
}
