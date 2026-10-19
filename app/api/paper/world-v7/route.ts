import master from "@/data/instrument-master.json";
import regionalSeeds from "@/data/world-paper-v7-research-seeds.json";
import reference from "@/data/world-equity-funnel-status.json";
import { runWorldPaperV7 } from "@/lib/trading/world-paper-v7.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Deliberately informational: never accept user-supplied quotes, entitlements,
// trading intents or portfolio writes via this GET endpoint.
export async function GET() {
  const report = runWorldPaperV7({
    nowIso: new Date().toISOString(),
    instruments: [...master.instruments, ...regionalSeeds.instruments],
    paperRunAuthorized: false,
    sessions: [], quotes: [], fx: [], entitlements: { sources: [], sessions: [], fx: [] },
  });
  return Response.json({
    generatedAt: report.generatedAt,
    mode: report.mode,
    explanation: "Worldwide V7 PAPER framework exists, but source entitlement, exact open venue, FX and two independent quotes must be proved before any simulated fill.",
    research: {
      selectedReferences: reference.selected,
      regions: reference.regions,
      status: reference.status,
      sourceObservedAt: reference.generatedAt,
      referencesAreExecutableQuotes: false,
    },
    summary: report.summary,
    regions: report.regions,
    listings: report.listings,
    paperRunAuthorized: false,
    liveTradingAllowed: false,
    brokerConnectivityAllowed: false,
    v6Modified: false,
  }, { headers: { "Cache-Control": "no-store, no-cache, max-age=0" } });
}
