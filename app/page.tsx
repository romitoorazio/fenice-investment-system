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
      <nav
        className="fixed inset-x-3 z-50 mx-auto flex max-w-4xl items-center gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur sm:justify-around"
        style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        aria-label="Navigazione principale Fenice"
      >
        <Link href="/" className="shrink-0 rounded-xl bg-amber-300 px-4 py-3 text-xs font-black text-slate-950">Oggi</Link>
        <Link href="/radar" className="shrink-0 rounded-xl px-3 py-3 text-xs font-black text-cyan-300 transition hover:bg-white/5">Radar</Link>
        <Link href="/dossier" className="shrink-0 rounded-xl px-3 py-3 text-xs font-black text-emerald-300 transition hover:bg-white/5">Dossier</Link>
        <Link href="/memos" className="shrink-0 rounded-xl px-3 py-3 text-xs font-black text-indigo-300 transition hover:bg-white/5">Memo IC</Link>
        <Link href="/portfolio" className="shrink-0 rounded-xl px-3 py-3 text-xs font-bold text-slate-300 transition hover:bg-white/5">Portafoglio</Link>
        <Link href="/discovery" className="shrink-0 rounded-xl px-3 py-3 text-xs font-bold text-violet-300 transition hover:bg-white/5">Scoperte</Link>
        <Link href="/data-hub" className="shrink-0 rounded-xl px-3 py-3 text-xs font-bold text-cyan-300 transition hover:bg-white/5">Dati</Link>
        <Link href="/readiness" className="shrink-0 rounded-xl px-3 py-3 text-xs font-black text-rose-300 transition hover:bg-white/5">Sicurezza</Link>
      </nav>
    </>
  );
}
