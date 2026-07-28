import Link from "next/link";
import MissionControl from "../components/MissionControl";
import snapshot from "@/data/latest-snapshot.json";
import type { AutonomySnapshot } from "@/lib/autonomy";
import { buildMissionControl } from "@/lib/mission";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Home() {
  const mission = buildMissionControl(snapshot as AutonomySnapshot);

  return (
    <>
      <MissionControl initialData={mission} />
      <nav className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-lg items-center justify-around rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur">
        <Link href="/" className="rounded-xl bg-amber-300 px-4 py-3 text-xs font-black text-slate-950">Oggi</Link>
        <Link href="/portfolio" className="rounded-xl px-3 py-3 text-xs font-bold text-slate-300 transition hover:bg-white/5">Portafoglio</Link>
        <Link href="/discovery" className="rounded-xl px-3 py-3 text-xs font-bold text-violet-300 transition hover:bg-white/5">Scoperte</Link>
        <Link href="/data-hub" className="rounded-xl px-3 py-3 text-xs font-bold text-cyan-300 transition hover:bg-white/5">Dati</Link>
        <Link href="/autonomia" className="rounded-xl px-3 py-3 text-xs font-bold text-slate-300 transition hover:bg-white/5">Analisi</Link>
      </nav>
    </>
  );
}
