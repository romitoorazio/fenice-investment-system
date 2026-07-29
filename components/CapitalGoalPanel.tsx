"use client";

import { useEffect, useState } from "react";
import type { CapitalGoalPlan } from "@/lib/capital-goal";

const money = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const decimal = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

function riskStyle(level: string) {
  if (level === "molto alto") return "border-rose-400/30 bg-rose-400/[0.08] text-rose-100";
  if (level === "alto") return "border-orange-400/30 bg-orange-400/[0.08] text-orange-100";
  if (level === "medio") return "border-amber-300/30 bg-amber-300/[0.08] text-amber-100";
  return "border-emerald-400/30 bg-emerald-400/[0.08] text-emerald-100";
}

export default function CapitalGoalPanel() {
  const [plan, setPlan] = useState<CapitalGoalPlan | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/capital-goal", { cache: "no-store" });
        if (!response.ok) throw new Error(`Piano capitale HTTP ${response.status}`);
        const payload = await response.json() as CapitalGoalPlan;
        if (active) {
          setPlan(payload);
          setError("");
        }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Piano capitale non disponibile");
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  if (!plan) {
    return (
      <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-white">
        <p className="text-sm text-slate-300">Calcolo del percorso €10.000 → €100.000… {error}</p>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-cyan-300/20 bg-cyan-300/[0.04] p-6 text-white sm:p-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">Obiettivo capitale Fenice</p>
          <h2 className="mt-3 text-2xl font-black sm:text-4xl">
            {money.format(plan.input.initialCapital)} → {money.format(plan.input.targetCapital)}
          </h2>
          <p className="mt-3 max-w-3xl leading-7 text-slate-300">
            Orizzonte {plan.input.horizonYears} anni. Per raggiungere l’obiettivo senza nuovi versamenti servirebbe un rendimento composto medio del {decimal.format(plan.requiredAnnualReturnPercent)}% annuo.
          </p>
        </div>
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] px-5 py-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-200">Valutazione</p>
          <p className="mt-2 text-lg font-black text-rose-100">{plan.verdict}</p>
        </div>
      </div>

      <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plan.scenarios.map((scenario) => (
          <article key={scenario.id} className={`rounded-2xl border p-5 ${riskStyle(scenario.riskLevel)}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{scenario.label}</p>
            <p className="mt-3 text-2xl font-black">{money.format(scenario.projectedCapital)}</p>
            <p className="mt-2 text-sm">Rendimento annuo {decimal.format(scenario.annualReturnPercent)}%</p>
            <p className="mt-1 text-sm">Avanzamento obiettivo {decimal.format(scenario.targetProgressPercent)}%</p>
          </article>
        ))}
      </div>

      <div className="mt-7 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
          <h3 className="font-black">Limiti di rischio</h3>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-300">
            <p>Singola posizione: <strong className="text-white">max {plan.guardrails.maximumSinglePositionPercent}%</strong></p>
            <p>Speculativo: <strong className="text-white">max {plan.guardrails.maximumSpeculativePercent}%</strong></p>
            <p>Liquidità: <strong className="text-white">min {plan.guardrails.minimumCashReservePercent}%</strong></p>
            <p>Crypto: <strong className="text-white">max {plan.guardrails.maximumCryptoPercent}%</strong></p>
          </div>
        </article>
        <article className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
          <h3 className="font-black">Avvertenze operative</h3>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-slate-300">
            {plan.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
          </ul>
        </article>
      </div>
    </section>
  );
}
