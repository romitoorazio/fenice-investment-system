import Link from "next/link";
import FeniceDashboard from "../components/FeniceDashboard";

export default function Home() {
  return (
    <>
      <Link
        href="/autonomia"
        className="fixed bottom-5 right-5 z-50 rounded-2xl bg-amber-400 px-5 py-3 text-sm font-black text-slate-950 shadow-2xl shadow-amber-500/20 transition hover:bg-amber-300"
      >
        ⚡ Apri Autonomia
      </Link>
      <FeniceDashboard />
    </>
  );
}
