import alerts from "@/data/terminal-alerts.json";
import type { TerminalAlert } from "@/lib/terminal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return Response.json(alerts as { version: number; generatedAt: string; alerts: TerminalAlert[] }, {
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
