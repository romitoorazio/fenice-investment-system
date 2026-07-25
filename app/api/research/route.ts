import research from "@/data/fundamental-research.json";
import type { FundamentalResearchReport } from "@/lib/research";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return Response.json(research as FundamentalResearchReport, {
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
