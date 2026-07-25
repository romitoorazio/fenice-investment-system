import fundamental from "@/data/fundamental-research.json";
import terminal from "@/data/terminal-intelligence.json";
import type { FundamentalResearchReport } from "@/lib/research";
import type { TerminalReport } from "@/lib/terminal";
import { buildRuntimeDcf } from "@/lib/dcf-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const report = buildRuntimeDcf(fundamental as FundamentalResearchReport, terminal as TerminalReport);
  return Response.json(report, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
