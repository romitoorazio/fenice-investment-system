import dcf from "@/data/dcf-analysis.json";
import type { DcfReport } from "@/lib/dcf";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return Response.json(dcf as DcfReport, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
