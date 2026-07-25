import snapshot from "@/data/latest-snapshot.json";
import type { AutonomySnapshot } from "@/lib/autonomy";
import { buildMissionControl } from "@/lib/mission";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request: Request) {
  const mission = buildMissionControl(snapshot as AutonomySnapshot);
  const format = new URL(request.url).searchParams.get("format")?.toLowerCase();

  if (format === "csv") {
    const header = ["Symbol", "Name", "Asset Class", "Decision", "Conviction", "Risk", "Source"];
    const rows = mission.rankedAssets.map((asset) => [
      asset.symbol,
      asset.name,
      asset.assetClass,
      asset.action,
      asset.conviction,
      asset.risk,
      asset.source,
    ]);
    const csv = `\uFEFF${[header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n")}\r\n`;

    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="fenice-prorealtime-analysis.csv"',
        "cache-control": "no-store, max-age=0",
      },
    });
  }

  const symbols = `${mission.rankedAssets.map((asset) => asset.symbol).join("\r\n")}\r\n`;
  return new Response(symbols, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": 'attachment; filename="fenice-prorealtime-watchlist.txt"',
      "cache-control": "no-store, max-age=0",
    },
  });
}
