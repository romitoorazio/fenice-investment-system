import strategies from "@/data/strategy-lab.json";
import terminal from "@/data/terminal-intelligence.json";
import type { StrategyLabReport } from "@/lib/strategy";
import type { TerminalReport } from "@/lib/terminal";
import { buildRuntimeStrategyLab } from "@/lib/strategy-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET() {
  const fallback = strategies as StrategyLabReport;
  try {
    const report = await buildRuntimeStrategyLab(terminal as TerminalReport);
    if (report.assetCount < 10) throw new Error(`Copertura runtime insufficiente: ${report.assetCount}/${report.universeSize}`);
    return Response.json(report, {
      headers: { "cache-control": "public, s-maxage=21600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Calcolo runtime non disponibile";
    const usableFallback = Array.isArray(fallback.assets) && fallback.assets.length >= 10;
    return Response.json(
      {
        ...fallback,
        mode: usableFallback ? fallback.mode : "bootstrap",
        source: {
          ...fallback.source,
          state: usableFallback ? "parziale" : "errore",
          detail: usableFallback
            ? `${fallback.source.detail} Runtime temporaneamente non disponibile; usata l’ultima analisi persistente.`
            : `Strategy Lab non ancora disponibile: ${detail}`,
        },
        warnings: [...new Set([...(fallback.warnings ?? []), `Calcolo runtime fallito: ${detail}`])],
      },
      {
        status: usableFallback ? 200 : 503,
        headers: { "cache-control": usableFallback ? "public, s-maxage=3600, stale-while-revalidate=21600" : "no-store" },
      },
    );
  }
}
