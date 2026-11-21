import snapshot from "@/data/latest-snapshot.json";
import {readLatestPublicMissionSnapshot} from "@/lib/ui/public-mission-snapshot-runtime.mjs";
import type { AutonomySnapshot } from "@/lib/autonomy";
import { buildMissionControl } from "@/lib/mission";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const latest=await readLatestPublicMissionSnapshot({fallback:snapshot});
  let mission;
  let bundled=latest.source==='BUNDLED';
  try{
    mission=buildMissionControl(latest.snapshot as AutonomySnapshot);
  }catch{
    mission=buildMissionControl(snapshot as AutonomySnapshot);
    bundled=true;
  }
  if(bundled)mission.warnings=[...new Set([...mission.warnings,
    "Snapshot incorporato nel sito: aggiornamento GitHub non verificabile."
  ])];

  return Response.json(mission, {
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
