import { loadPaperReviewPayload } from "@/lib/ui/paper-review-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Read-only: a browser decision can never enqueue or submit a broker order.
export async function GET() {
  return Response.json(await loadPaperReviewPayload(), { headers: { "Cache-Control": "no-store" } });
}
