import { loadPaperReviewPayload } from "@/lib/ui/paper-review-data";
import { isPublicPaperRefreshAttempt } from "@/lib/ui/proposal-route-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public GETs must NEVER make billable provider calls. The 10-second in-memory
// loader cache is not a distributed quota guard and cannot prevent abuse.
// Keep the PAPER diagnostic read available; reject refresh before loading.
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (isPublicPaperRefreshAttempt(url)) {
    return Response.json(
      { error: "PAPER_REFRESH_RESTRICTED", message: "Aggiornamento diretto dei provider non disponibile da browser pubblico. Usa le evidenze PAPER archiviate." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    await loadPaperReviewPayload(process.cwd(), Date.now()),
    { headers: { "Cache-Control": "no-store" } },
  );
}
