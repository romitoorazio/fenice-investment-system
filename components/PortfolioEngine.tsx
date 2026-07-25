"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { TerminalReport, UnifiedAsset } from "@/lib/terminal";

type Position = {
  symbol: string;
  shares: number;
  averageCostEuro: number;
  note: string;
};

type FxResponse = {
  eurUsd: number | null;
  observedAt: string;
  source: string;
  status: string;
};

const STORAGE_POSITIONS = "fenice-paper-positions-v1";
const STORAGE_CASH = "fenice-paper-cash-v1";
const money = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 4 });

function percent(value?: number) {
  return Number.isFinite(value) ? `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(Number(value))}%` : "—";
}

function currentUnitEuro(asset: UnifiedAsset | undefined, eurUsd: number | null) {
  if (!asset || !Number.isFinite(asset.price)) return undefined;
  if (asset.currency === "EUR") return Number(asset.price);
  if (asset.currency === "USD" && Number.isFinite(eurUsd) && Number(eurUsd) > 0) return Number(asset.price) / Number(eurUsd);
  return undefined;
}

function riskClass(level: "alto" | "medio" | "basso") {
  if (level === "alto") return "border-rose-400/20 bg-rose-400/[0.06] text-rose-100";
  if (level === "medio") return "border-amber-300/20 bg-amber-300/[0.06] text-amber-100";
  return "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-100";
}

export default function PortfolioEngine() {
  const [terminal, setTerminal] = useState<TerminalReport | null>(null);
  const [eurUsd, setEurUsd] = useState<number | null>(null);
  const [fxStatus, setFxStatus] = useState("caricamento");
  const [positions, setPositions] = useState<Position[]>([]);
  const [cashEuro, setCashEuro] = useState(10_000);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [averageCost, setAverageCost] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    try {
      const storedPositions = window.localStorage.getItem(STORAGE_POSITIONS);
      const storedCash = window.localStorage.getItem(STORAGE_CASH);
      if (storedPositions) setPositions(JSON.parse(storedPositions) as Position[]);
      if (storedCash && Number.isFinite(Number(storedCash))) setCashEuro(Number(storedCash));
    } catch {
      setError("Non è stato possibile leggere il portafoglio salvato nel browser.");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(STORAGE_POSITIONS, JSON.stringify(positions));
    window.localStorage.setItem(STORAGE_CASH, String(cashEuro));
  }, [positions, cashEuro, loaded]);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [terminalResponse, fxResponse] = await Promise.all([
          fetch("/api/terminal", { cache: "no-store" }),
          fetch("/api/fx", { cache: "no-store" }),
        ]);
        if (!terminalResponse.ok) throw new Error(`Terminal HTTP ${terminalResponse.status}`);
        const terminalData = await terminalResponse.json() as TerminalReport;
        const fxData = await fxResponse.json() as FxResponse;
        if (!active) return;
        setTerminal(terminalData);
        setSymbol((current) => current || terminalData.assets[0]?.symbol || "");
        setEurUsd(Number.isFinite(fxData.eurUsd) ? Number(fxData.eurUsd) : null);
        setFxStatus(fxData.status);
        setError("");
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : "Dati portafoglio non disponibili");
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 10 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const assetsBySymbol = useMemo(() => new Map((terminal?.assets ?? []).map((asset) => [asset.symbol, asset])), [terminal]);

  const rows = useMemo(() => positions.map((position) => {
    const asset = assetsBySymbol.get(position.symbol);
    const unitEuro = currentUnitEuro(asset, eurUsd);
    const costValue = position.shares * position.averageCostEuro;
    const currentValue = Number.isFinite(unitEuro) ? position.shares * Number(unitEuro) : undefined;
    const profitLoss = Number.isFinite(currentValue) ? Number(currentValue) - costValue : undefined;
    const profitLossPercent = costValue > 0 && Number.isFinite(profitLoss) ? (Number(profitLoss) / costValue) * 100 : undefined;
    return { position, asset, unitEuro, costValue, currentValue, profitLoss, profitLossPercent };
  }), [positions, assetsBySymbol, eurUsd]);

  const positionsValue = rows.reduce((sum, row) => sum + (Number.isFinite(row.currentValue) ? Number(row.currentValue) : 0), 0);
  const portfolioValue = cashEuro + positionsValue;
  const totalCost = rows.reduce((sum, row) => sum + row.costValue, 0);
  const totalProfitLoss = positionsValue - totalCost;
  const reserveTarget = terminal?.portfolio.find((slice) => slice.id === "reserve")?.targetPercent ?? 15;
  const cashWeight = portfolioValue > 0 ? (cashEuro / portfolioValue) * 100 : 100;

  const enrichedRows = rows.map((row) => ({
    ...row,
    weightPercent: portfolioValue > 0 && Number.isFinite(row.currentValue) ? (Number(row.currentValue) / portfolioValue) * 100 : 0,
    targetAmount: row.asset ? (portfolioValue * row.asset.targetWeightPercent) / 100 : 0,
    gapAmount: row.asset && Number.isFinite(row.currentValue) ? (portfolioValue * row.asset.targetWeightPercent) / 100 - Number(row.currentValue) : undefined,
  }));

  const cryptoWeight = enrichedRows.filter((row) => row.asset?.assetClass === "Criptovaluta").reduce((sum, row) => sum + row.weightPercent, 0);
  const speculativeWeight = enrichedRows.filter((row) => row.asset?.businessStage === "pre-commerciale" || row.asset?.decision === "SPECULATIVA").reduce((sum, row) => sum + row.weightPercent, 0);
  const unpricedCount = enrichedRows.filter((row) => !Number.isFinite(row.currentValue)).length;
  const concentration = Math.max(0, ...enrichedRows.map((row) => row.weightPercent));

  const risks: Array<{ level: "alto" | "medio" | "basso"; title: string; detail: string }> = [];
  if (concentration > 15) risks.push({ level: "alto", title: "Concentrazione elevata", detail: `La posizione maggiore pesa circa ${percent(concentration)}. Fenice suggerisce di restare sotto il 12-15%.` });
  else if (concentration > 10) risks.push({ level: "medio", title: "Concentrazione da sorvegliare", detail: `La posizione maggiore pesa circa ${percent(concentration)}.` });
  else risks.push({ level: "basso", title: "Concentrazione controllata", detail: `La posizione maggiore pesa circa ${percent(concentration)}.` });
  if (cryptoWeight > 5) risks.push({ level: "alto", title: "Crypto oltre limite", detail: `Le criptovalute pesano ${percent(cryptoWeight)}, sopra il limite prudenziale del 5%.` });
  if (speculativeWeight > 5) risks.push({ level: "alto", title: "Speculativo oltre limite", detail: `Le posizioni speculative pesano ${percent(speculativeWeight)}, sopra il tetto Fenice del 5%.` });
  if (cashWeight + 0.5 < reserveTarget) risks.push({ level: "medio", title: "Riserva sotto obiettivo", detail: `Liquidità ${percent(cashWeight)} contro obiettivo ${reserveTarget}%.` });
  if (unpricedCount > 0) risks.push({ level: "medio", title: "Valutazioni incomplete", detail: `${unpricedCount} posizioni non possono essere convertite correttamente in euro.` });
  if (!risks.some((risk) => risk.level === "alto") && cryptoWeight <= 5 && speculativeWeight <= 5 && cashWeight >= reserveTarget) risks.push({ level: "basso", title: "Guardrail principali rispettati", detail: "Liquidità e limiti speculativi risultano coerenti con il modello corrente." });

  function addPosition() {
    const parsedShares = Number(shares.replace(",", "."));
    const parsedCost = Number(averageCost.replace(",", "."));
    if (!symbol || !Number.isFinite(parsedShares) || parsedShares <= 0 || !Number.isFinite(parsedCost) || parsedCost < 0) {
      setError("Inserisci strumento, quantità e costo medio in euro validi.");
      return;
    }
    setPositions((current) => {
      const existing = current.find((position) => position.symbol === symbol);
      if (!existing) return [...current, { symbol, shares: parsedShares, averageCostEuro: parsedCost, note: note.trim() }];
      const combinedShares = existing.shares + parsedShares;
      const combinedCost = existing.shares * existing.averageCostEuro + parsedShares * parsedCost;
      return current.map((position) => position.symbol === symbol ? {
        ...position,
        shares: combinedShares,
        averageCostEuro: combinedShares > 0 ? combinedCost / combinedShares : 0,
        note: note.trim() || position.note,
      } : position);
    });
    setShares("");
    setAverageCost("");
    setNote("");
    setError("");
  }

  function removePosition(positionSymbol: string) {
    setPositions((current) => current.filter((position) => position.symbol !== positionSymbol));
  }

  if (!terminal) return <main className="min-h-screen bg-slate-950 p-8 text-white">Fenice sta caricando il Paper Portfolio… {error}</main>;

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-[1500px] space-y-8">
        <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">Fenice Paper Portfolio</p>
              <h1 className="mt-3 text-3xl font-black sm:text-5xl">Portafoglio, rischio e ribilanciamento</h1>
              <p className="mt-4 max-w-4xl leading-7 text-slate-300">Registra le posizioni senza collegare il broker. Fenice calcola valore indicativo in euro, P&L, concentrazione e scostamento dal portafoglio modello.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/" className="rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-sm font-black">Mission Control</Link>
              <Link href="/terminal" className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-black text-slate-950">World Terminal →</Link>
            </div>
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {[
            ["Valore portafoglio", money.format(portfolioValue)],
            ["Posizioni", String(positions.length)],
            ["Liquidità", `${money.format(cashEuro)} · ${percent(cashWeight)}`],
            ["P&L indicativo", money.format(totalProfitLoss)],
            ["Crypto", percent(cryptoWeight)],
            ["Cambio EUR/USD", Number.isFinite(eurUsd) ? number.format(Number(eurUsd)) : "n/d"],
          ].map(([label, value]) => (
            <article key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-3 text-xl font-black">{value}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-xl font-black">Aggiungi posizione</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Strumento
                <select value={symbol} onChange={(event) => setSymbol(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white">
                  <option value="">Seleziona</option>
                  {terminal.assets.map((asset) => <option key={asset.symbol} value={asset.symbol}>{asset.symbol} · {asset.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Quantità
                <input value={shares} onChange={(event) => setShares(event.target.value)} inputMode="decimal" placeholder="es. 10" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white" />
              </label>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Costo medio per unità (€)
                <input value={averageCost} onChange={(event) => setAverageCost(event.target.value)} inputMode="decimal" placeholder="es. 150,50" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white" />
              </label>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Nota
                <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Tesi o data di ingresso" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white" />
              </label>
            </div>
            <button type="button" onClick={addPosition} className="mt-4 w-full rounded-xl bg-emerald-400 px-4 py-3 font-black text-slate-950 hover:bg-emerald-300">Registra nel paper portfolio</button>
            {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
          </article>

          <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
            <h2 className="text-xl font-black">Liquidità disponibile</h2>
            <p className="mt-2 text-sm text-slate-500">Il saldo viene salvato solo in questo browser.</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1 text-xs font-bold uppercase tracking-wider text-slate-500">Contanti (€)
                <input value={cashEuro} onChange={(event) => setCashEuro(Math.max(0, Number(event.target.value) || 0))} type="number" min="0" step="10" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-white" />
              </label>
              <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-4 py-3 text-sm text-amber-100">Obiettivo corrente: {reserveTarget}%</div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-950/60 p-4"><p className="text-xs text-slate-500">Cambio</p><p className="mt-2 font-black">{fxStatus === "operativo" ? `1 € = ${number.format(Number(eurUsd))} $` : "Cambio non disponibile"}</p></div>
              <div className="rounded-xl bg-slate-950/60 p-4"><p className="text-xs text-slate-500">Costo storico posizioni</p><p className="mt-2 font-black">{money.format(totalCost)}</p></div>
            </div>
          </article>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/10">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10 text-sm">
              <thead className="bg-white/[0.05] text-left text-[10px] uppercase tracking-wider text-slate-500">
                <tr><th className="px-4 py-4">Posizione</th><th className="px-4 py-4">Quantità</th><th className="px-4 py-4">Costo medio</th><th className="px-4 py-4">Prezzo €</th><th className="px-4 py-4">Valore</th><th className="px-4 py-4">P&L</th><th className="px-4 py-4">Peso</th><th className="px-4 py-4">Modello</th><th className="px-4 py-4"></th></tr>
              </thead>
              <tbody className="divide-y divide-white/10 bg-white/[0.02]">
                {enrichedRows.map((row) => (
                  <tr key={row.position.symbol}>
                    <td className="px-4 py-4"><p className="font-black text-emerald-300">{row.position.symbol}</p><p className="mt-1 max-w-xs text-xs text-slate-500">{row.asset?.name ?? "Non presente nel terminale"}</p>{row.position.note ? <p className="mt-1 text-xs text-slate-600">{row.position.note}</p> : null}</td>
                    <td className="px-4 py-4">{number.format(row.position.shares)}</td>
                    <td className="px-4 py-4">{money.format(row.position.averageCostEuro)}</td>
                    <td className="px-4 py-4">{Number.isFinite(row.unitEuro) ? money.format(Number(row.unitEuro)) : "n/d"}</td>
                    <td className="px-4 py-4 font-black">{Number.isFinite(row.currentValue) ? money.format(Number(row.currentValue)) : "n/d"}</td>
                    <td className={`px-4 py-4 font-black ${Number(row.profitLoss) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{Number.isFinite(row.profitLoss) ? `${money.format(Number(row.profitLoss))} · ${percent(row.profitLossPercent)}` : "n/d"}</td>
                    <td className="px-4 py-4">{percent(row.weightPercent)}</td>
                    <td className="px-4 py-4"><p>{row.asset?.targetWeightPercent ?? 0}%</p><p className={`mt-1 text-xs ${Number(row.gapAmount) >= 0 ? "text-sky-300" : "text-amber-300"}`}>{Number.isFinite(row.gapAmount) ? `${Number(row.gapAmount) >= 0 ? "sotto" : "sopra"} di ${money.format(Math.abs(Number(row.gapAmount)))}` : "n/d"}</p></td>
                    <td className="px-4 py-4"><button type="button" onClick={() => removePosition(row.position.symbol)} className="rounded-lg border border-rose-400/20 px-3 py-2 text-xs font-black text-rose-300">Rimuovi</button></td>
                  </tr>
                ))}
                {!enrichedRows.length ? <tr><td colSpan={9} className="px-6 py-10 text-center text-slate-500">Nessuna posizione registrata. Il capitale resta interamente in liquidità.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-2xl font-black">Risk Manager</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {risks.map((risk) => <article key={`${risk.title}-${risk.detail}`} className={`rounded-2xl border p-5 ${riskClass(risk.level)}`}><p className="text-xs font-black uppercase tracking-wider">{risk.level}</p><h3 className="mt-2 text-lg font-black">{risk.title}</h3><p className="mt-3 text-sm leading-6 opacity-80">{risk.detail}</p></article>)}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-xl font-black">Regole del Paper Portfolio</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {[
              "I costi medi sono inseriti in euro; i prezzi USD vengono convertiti con EUR/USD.",
              "Il portafoglio resta memorizzato solo nel browser corrente e non viene inviato a un broker.",
              "Fenice non compra, vende o modifica le posizioni: mostra soltanto rischi e scostamenti.",
              "Prezzi gratuiti, cambio e P&L possono essere ritardati e devono essere verificati sull’estratto del broker.",
            ].map((item) => <p key={item} className="rounded-xl bg-slate-950/50 p-4 text-sm leading-6 text-slate-300">{item}</p>)}
          </div>
        </section>
      </div>
    </main>
  );
}
