import { validateFeniceAIThesis, type FeniceAIDecision } from "./ai-intelligence-core.ts";

export interface FeniceProposalGuardInput {
  decision: FeniceAIDecision;
  evidenceCount: number;
  evidenceFamilies: readonly string[];
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
 * execute an order. Eligibility permits only a reviewable proposal and still
 * requires the deterministic risk and human-consent pipeline.
 */
export function guardFeniceAIProposal(input: FeniceProposalGuardInput, now = Date.now()): FeniceProposalGuardResult {
  const decision = input?.decision;
  const validBlockers = Array.isArray(decision?.blockedBy) && decision.blockedBy.every((item) => typeof item === "string");
  const blockedBy = validBlockers ? [...decision.blockedBy] : ["INVALID_AI_DECISION"];
  if (decision?.advisoryOnly !== true || decision?.executable !== false || decision?.proposalEligible !== true) blockedBy.push("AI_PROPOSAL_NOT_ELIGIBLE");
  blockedBy.push(...validateFeniceAIThesis(decision?.thesis, now));
  if (!(decision?.thesis?.confidence >= 90) || !["BUY", "ACCUMULATE"].includes(decision?.thesis?.action)) blockedBy.push("AI_PROPOSAL_NOT_ELIGIBLE");
  const families = Array.isArray(input?.evidenceFamilies) && input.evidenceFamilies.every((item) => typeof item === "string" && item.trim())
    ? new Set(input.evidenceFamilies.map((item) => item.trim().toLowerCase())) : new Set();
  if (!Number.isSafeInteger(input?.evidenceCount) || input.evidenceCount < 2 || families.size < 2 || families.size > input.evidenceCount) {
    blockedBy.push("INSUFFICIENT_INDEPENDENT_EVIDENCE");
  }
  if (input?.evidenceFresh !== true) blockedBy.push("STALE_EVIDENCE");
  if (input?.proposalTermsComplete !== true) blockedBy.push("INCOMPLETE_PROPOSAL_TERMS");
  if (input?.userApprovalRequired !== true) blockedBy.push("USER_APPROVAL_BYPASS_FORBIDDEN");
  return { mayCreateProposal: blockedBy.length === 0, mayExecute: false, blockedBy: [...new Set(blockedBy)] };
}
