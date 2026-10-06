import { loadPaperReviewPayload } from "@/lib/ui/paper-review-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Read-only: a browser decision can never enqueue or submit a broker order.
// Provider refresh is explicit (?fresh=1) to protect zero-cost API budgets.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const refreshLiveContext = url.searchParams.get("fresh") === "1";
  return Response.json(
    await loadPaperReviewPayload(process.cwd(), Date.now(), { refreshLiveContext }),
    { headers: { "Cache-Control": "no-store" } },
  );
}
