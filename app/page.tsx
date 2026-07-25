import Link from "next/link";
import MissionControl from "../components/MissionControl";

export default function Home() {
  return (
    <>
      <nav className="fixed right-5 top-5 z-50 flex flex-wrap justify-end gap-2">
        <Link
          href="/journal"
          className="rounded-2xl bg-violet-400 px-4 py-3 text-sm font-black text-slate-950 shadow-2xl transition hover:bg-violet-300"
        >
          Decision Journal
        </Link>
        <Link
          href="/alerts"
          className="rounded-2xl bg-rose-400 px-4 py-3 text-sm font-black text-slate-950 shadow-2xl transition hover:bg-rose-300"
        >
          Alert Center
        </Link>
        <Link
          href="/portfolio"
          className="rounded-2xl bg-sky-400 px-4 py-3 text-sm font-black text-slate-950 shadow-2xl transition hover:bg-sky-300"
        >
          Paper Portfolio
        </Link>
        <Link
          href="/terminal"
          className="rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950 shadow-2xl transition hover:bg-emerald-300"
        >
          World Terminal
        </Link>
        <Link
          href="/research"
          className="rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black text-slate-950 shadow-2xl transition hover:bg-amber-300"
        >
          Research Engine
        </Link>
        <Link
          href="/autonomia"
          className="rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-sm font-black text-white shadow-2xl backdrop-blur transition hover:bg-slate-800"
        >
          Motore autonomia
        </Link>
      </nav>
      <MissionControl />
    </>
  );
}
