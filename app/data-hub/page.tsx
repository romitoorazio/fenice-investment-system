import Link from "next/link";
import GlobalDataHubPanel from "@/components/GlobalDataHubPanel";

export default function GlobalDataHubPage() {
  return (
    <>
      <GlobalDataHubPanel />
      <nav className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-lg items-center justify-around rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-2xl backdrop-blur">
        <Link href="/" className="rounded-xl px-3 py-3 text-xs font-bold text-slate-300 transition hover:bg-white/5">Oggi</Link>
        <Link href="/portfolio" className="rounded-xl px-3 py-3 text-xs font-bold text-slate-300 transition hover:bg-white/5">Portafoglio</Link>
        <Link href="/autonomia" className="rounded-xl px-3 py-3 text-xs font-bold text-slate-300 transition hover:bg-white/5">Analisi</Link>
        <Link href="/data-hub" className="rounded-xl bg-cyan-300 px-4 py-3 text-xs font-black text-slate-950">Data Hub</Link>
        <Link href="/research" className="rounded-xl px-3 py-3 text-xs font-bold text-slate-300 transition hover:bg-white/5">Altro</Link>
      </nav>
    </>
  );
}
