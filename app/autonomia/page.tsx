import Link from "next/link";
import AutonomyPanel from "@/components/AutonomyPanel";

export const metadata = {
  title: "Autonomia",
  description: "Motore autonomo di analisi multi-mercato di Fenice Investment System.",
};

export default function AutonomiaPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 lg:py-8">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-amber-400/10 blur-3xl" />
        <div className="absolute -right-40 top-1/3 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-500 text-xl font-black text-slate-950">F</div>
            <div>
              <p className="font-black">Fenice Investment System</p>
              <p className="text-xs text-slate-500">Centro di analisi autonoma globale</p>
            </div>
          </div>
          <Link href="/" className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-center text-sm font-black text-white transition hover:border-amber-400">
            ← Torna alla dashboard
          </Link>
        </header>
        <AutonomyPanel />
      </div>
    </main>
  );
}
