import alerts from "@/data/terminal-alerts.json";
import terminal from "@/data/terminal-intelligence.json";
import type { TerminalAlert, TerminalReport } from "@/lib/terminal";
import { buildRuntimeTerminal } from "@/lib/terminal-runtime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const stored = alerts as { version: number; generatedAt: string; alerts: TerminalAlert[] };
  if (stored.alerts.length) {
    return Response.json(stored, { headers: { "cache-control": "no-store, max-age=0" } });
  }

  const report = buildRuntimeTerminal(terminal as TerminalReport, 0);
  const fallback: TerminalAlert[] = [
    {
      id: `runtime-monitor-${report.version}`,
      generatedAt: report.validatedAt ?? new Date().toISOString(),
      severity: "informazione",
      type: "segnale",
      title: "Monitoraggio Fenice attivo",
      detail: `${report.assetCount} strumenti controllati; freschezza ${report.freshnessStatus ?? "non disponibile"}; allocazione validata ${report.allocationCheck?.valid ? "correttamente" : "con anomalie"}.`,
      current: report.assetCount,
    },
    ...((report.guardrails?.violations ?? []).map((violation, index): TerminalAlert => ({
      id: `runtime-risk-${report.version}-${index}`,
      generatedAt: report.validatedAt ?? new Date().toISOString(),
      severity: "critico",
      type: "rischio",
      title: "Violazione guardrail",
      detail: violation,
      current: violation,
    }))),
  ];

  return Response.json(
    { version: stored.version, generatedAt: report.validatedAt ?? stored.generatedAt, alerts: fallback },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
