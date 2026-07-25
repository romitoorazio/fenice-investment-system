import terminal from "@/data/terminal-intelligence.json";
import alerts from "@/data/terminal-alerts.json";
import type { TerminalAlert, TerminalReport } from "@/lib/terminal";
import { buildRuntimeTerminal } from "@/lib/terminal-runtime";
import { applyFinalCapitalPolicy } from "@/lib/capital-policy";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const alertsCount = (alerts as { alerts: TerminalAlert[] }).alerts.length;
  const runtime = buildRuntimeTerminal(terminal as TerminalReport, alertsCount);
  const report = applyFinalCapitalPolicy(runtime);
  return Response.json(report, {
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
