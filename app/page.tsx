import Link from "next/link";
import MissionControl from "../components/MissionControl";

export default function Home() {
  return (
    <>
      <nav className="fixed right-5 top-5 z-50 flex gap-2">
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
