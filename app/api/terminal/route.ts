import terminal from "@/data/terminal-intelligence.json";
import type { TerminalReport } from "@/lib/terminal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  return Response.json(terminal as TerminalReport, {
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
