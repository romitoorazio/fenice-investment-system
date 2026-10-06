import type { Metadata } from "next";
import PaperProposalReview from "@/components/PaperProposalReview";
import { loadPaperReviewPayload } from "@/lib/ui/paper-review-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Proposte Sì / No" };

export default async function ProposalsPage() {
  return <PaperProposalReview initialData={await loadPaperReviewPayload()} />;
}
