import type { FundamentalResearchReport } from "@/lib/research";
import type { TerminalReport } from "@/lib/terminal";
import type { DcfCompany, DcfReport, DcfScenario } from "@/lib/dcf";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Number(value) || 0));
const round = (value: number | undefined, digits = 2) => {
  if (!Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
};

function isPreCommercial(company: FundamentalResearchReport["companies"][number]) {
  const sector = String(company.sector || "").toLowerCase();
  return /biotecnologia|farmaci|gene editing|scoperta di farmaci/.test(sector) && Number(company.financials.netIncome) < 0 && Number(company.financials.revenue || 0) < 250_000_000;
}

function stageFor(company: FundamentalResearchReport["companies"][number]) {
  if (isPreCommercial(company)) return "pre-commerciale" as const;
  return Number(company.financials.revenueGrowth3YPercent) >= 10 ? "crescita" as const : "maturo" as const;
}

function inferredShares(company: FundamentalResearchReport["companies"][number]) {
  const netIncome = Number(company.financials.netIncome);
  const eps = Number(company.financials.dilutedEps);
  if (!Number.isFinite(netIncome) || !Number.isFinite(eps) || eps === 0 || Math.sign(netIncome) !== Math.sign(eps)) return undefined;
  const shares = netIncome / eps;
  return Number.isFinite(shares) && shares > 0 ? shares : undefined;
}

function calculateScenario(args: {
  id: DcfScenario["id"];
  label: string;
  fcf: number;
  cash: number;
  debt: number;
  shares: number;
  startGrowth: number;
  terminalGrowth: number;
  discountRate: number;
  currentPrice: number;
}): DcfScenario {
  const years = 5;
  let projected = args.fcf;
  let presentValue = 0;
  const endGrowth = Math.max(args.terminalGrowth + 0.5, 3);
  for (let year = 1; year <= years; year += 1) {
    const progress = (year - 1) / (years - 1);
    const growth = args.startGrowth + (endGrowth - args.startGrowth) * progress;
    projected *= 1 + growth / 100;
    presentValue += projected / ((1 + args.discountRate / 100) ** year);
  }
  const terminalValue = projected * (1 + args.terminalGrowth / 100) / ((args.discountRate - args.terminalGrowth) / 100);
  const enterpriseValue = presentValue + terminalValue / ((1 + args.discountRate / 100) ** years);
  const equityValue = enterpriseValue + args.cash - args.debt;
  const fairValue = equityValue > 0 ? equityValue / args.shares : undefined;
  return {
    id: args.id,
    label: args.label,
    revenueGrowthStartPercent: round(args.startGrowth, 1) ?? 0,
    terminalGrowthPercent: args.terminalGrowth,
    discountRatePercent: args.discountRate,
    forecastYears: years,
    enterpriseValue: round(enterpriseValue, 0),
    equityValue: round(equityValue, 0),
    fairValuePerShare: round(fairValue, 2),
    upsidePercent: Number.isFinite(fairValue) ? round((Number(fairValue) / args.currentPrice - 1) * 100, 1) : undefined,
  };
}

function buildCompany(
  company: FundamentalResearchReport["companies"][number],
  asset: TerminalReport["assets"][number] | undefined,
  generatedAt: string,
): DcfCompany {
  const stage = stageFor(company);
  const currency = company.financials.currency;
  const priceCurrency = asset?.currency;
  const currentPrice = Number(asset?.price);
  const revenue = Number(company.financials.revenue);
  const operatingCashFlow = Number(company.financials.operatingCashFlow);
  const capitalExpenditure = Number(company.financials.capitalExpenditure);
  const fcf = Number(company.financials.freeCashFlow);
  const cash = Math.max(0, Number(company.financials.cash || 0));
  const debt = Math.max(0, Number(company.financials.debt || 0));
  const shares = inferredShares(company);
  const completeness = Number(company.scores.dataCompleteness || 0);
  const quality = Number(company.scores.quality || 0);
  const capexRevenuePercent = Number.isFinite(capitalExpenditure) && revenue > 0 ? (capitalExpenditure / revenue) * 100 : undefined;
  const fcfMarginPercent = Number.isFinite(fcf) && revenue > 0 ? (fcf / revenue) * 100 : undefined;
  const suspiciousCapex =
    !Number.isFinite(operatingCashFlow) ||
    !Number.isFinite(capitalExpenditure) ||
    capitalExpenditure <= 0 ||
    !Number.isFinite(fcf) ||
    fcf > operatingCashFlow * 1.001 ||
    (["NVDA", "AMZN"].includes(company.ticker) && Number(capexRevenuePercent) < 2) ||
    Number(fcfMarginPercent) > 55;
  const common = {
    symbol: company.ticker,
    name: company.name,
    sector: company.sector,
    businessStage: stage,
    currency,
    observedAt: generatedAt,
    source: "SEC EDGAR + Fenice World Terminal",
    currentPrice: Number.isFinite(currentPrice) ? currentPrice : undefined,
    freeCashFlow: Number.isFinite(fcf) ? fcf : undefined,
    cash,
    debt,
    dilutedShares: round(shares, 0),
  };

  if (stage === "pre-commerciale") return {
    ...common,
    status: "non applicabile",
    confidence: Math.round(clamp(completeness * 0.65 + quality * 0.35, 0, 100)),
    score: 25,
    scenarios: [],
    rationale: ["Il DCF tradizionale non è adatto a una società pre-commerciale con free cash flow negativo."],
    warnings: ["Servono un modello probabilistico della pipeline clinica, autonomia di cassa e scenari di diluizione."],
  };
  if (suspiciousCapex) return {
    ...common,
    status: "dati insufficienti",
    confidence: Math.round(clamp(completeness * 0.45 + quality * 0.25, 0, 55)),
    score: 35,
    scenarios: [],
    rationale: ["Il free cash flow non supera il controllo di qualità su operating cash flow e investimenti."],
    warnings: [
      `Capex/ricavi indicativo: ${round(capexRevenuePercent, 2) ?? "n/d"}%; margine FCF: ${round(fcfMarginPercent, 1) ?? "n/d"}%.`,
      "Il DCF resta bloccato finché il capex non viene riconciliato con cash-flow statement e note del filing.",
    ],
  };
  if (!Number.isFinite(fcf) || fcf <= 0 || !Number.isFinite(shares) || Number(shares) <= 0) return {
    ...common,
    status: "dati insufficienti",
    confidence: Math.round(clamp(completeness * 0.6 + quality * 0.4, 0, 100)),
    score: 35,
    scenarios: [],
    rationale: ["Free cash flow positivo e azioni diluite confrontabili non sono entrambi disponibili."],
    warnings: ["Nessun fair value viene prodotto con dati incompleti."],
  };
  if (!asset || !Number.isFinite(currentPrice) || currentPrice <= 0 || (currency && priceCurrency && currency !== priceCurrency)) return {
    ...common,
    status: "non confrontabile",
    confidence: Math.round(clamp(completeness * 0.6 + quality * 0.4 - 15, 0, 100)),
    score: 50,
    scenarios: [],
    rationale: [`Bilancio espresso in ${currency || "valuta non definita"} e prezzo espresso in ${priceCurrency || "valuta non definita"}.`],
    warnings: ["ADR, rapporto di conversione o cambio devono essere verificati prima di stimare il valore per azione."],
  };

  const growth = Number(company.financials.revenueGrowth3YPercent || 0);
  const baseGrowth = clamp(growth * 0.65, 3, 18);
  const scenarios = [
    calculateScenario({ id: "prudente", label: "Prudente", fcf, cash, debt, shares: Number(shares), startGrowth: clamp(baseGrowth - 4, 0, 12), terminalGrowth: 2, discountRate: 11.5, currentPrice }),
    calculateScenario({ id: "base", label: "Base", fcf, cash, debt, shares: Number(shares), startGrowth: baseGrowth, terminalGrowth: 2.5, discountRate: 9.5, currentPrice }),
    calculateScenario({ id: "espansivo", label: "Espansivo", fcf, cash, debt, shares: Number(shares), startGrowth: clamp(baseGrowth + 3, 4, 22), terminalGrowth: 3, discountRate: 8.5, currentPrice }),
  ];
  const low = scenarios[0].fairValuePerShare;
  const base = scenarios[1].fairValuePerShare;
  const high = scenarios[2].fairValuePerShare;
  const upside = Number.isFinite(base) ? (Number(base) / currentPrice - 1) * 100 : undefined;
  const extremeValuation = Number.isFinite(base) && (Number(base) > currentPrice * 4 || Number(base) < currentPrice * 0.1);
  const confidence = Math.round(clamp(completeness * 0.5 + quality * 0.35 + 15 - Math.abs(baseGrowth - growth) * 0.3 - (extremeValuation ? 25 : 0), 0, 95));
  const warnings = [
    "Le azioni diluite sono inferite dai dati SEC e devono essere confrontate con il filing.",
    "L’intervallo di scenari è più importante del valore centrale.",
    ...(Number(fcfMarginPercent) > 35 ? [`Margine FCF elevato (${round(fcfMarginPercent, 1)}%): usare una media pluriennale prima di investire.`] : []),
    ...(extremeValuation ? ["Il valore centrale è estremo rispetto al prezzo: score e confidenza sono ridotti e il risultato richiede riconciliazione manuale."] : []),
  ];
  return {
    ...common,
    status: "disponibile",
    confidence,
    score: Math.round(clamp(50 + clamp(Number(upside), -70, 70) * 0.6 + (confidence - 60) * 0.15 - (extremeValuation ? 20 : 0), 5, 95)),
    fairValueLow: low,
    fairValueBase: base,
    fairValueHigh: high,
    upsideBasePercent: round(upside, 1),
    scenarios,
    rationale: [
      `Free cash flow di partenza ${round(fcf, 0)} ${currency}.`,
      `Capex/ricavi verificato al ${round(capexRevenuePercent, 2)}%.`,
      `Crescita iniziale scenario base ${round(baseGrowth, 1)}%, poi progressivamente ridotta.`,
      `Azioni diluite stimate da utile netto/EPS: ${round(shares, 0)}.`,
      `Scostamento scenario base rispetto al prezzo: ${round(upside, 1)}%.`,
    ],
    warnings,
  };
}

export function buildRuntimeDcf(fundamental: FundamentalResearchReport, terminal: TerminalReport): DcfReport {
  const generatedAt = new Date().toISOString();
  const assets = new Map(terminal.assets.map((asset) => [asset.symbol, asset]));
  const companies = fundamental.companies.map((company) => buildCompany(company, assets.get(company.ticker), generatedAt));
  companies.sort((left, right) => {
    const order: Record<DcfCompany["status"], number> = { disponibile: 0, "non confrontabile": 1, "dati insufficienti": 2, "non applicabile": 3 };
    return order[left.status] - order[right.status] || right.score - left.score;
  });
  const availableCount = companies.filter((company) => company.status === "disponibile").length;
  return {
    version: 2,
    generatedAt,
    mode: availableCount >= 4 ? "live" : companies.length ? "partial" : "bootstrap",
    source: {
      name: "Fenice DCF Scenario Engine",
      state: availableCount >= 4 ? "operativo" : companies.length ? "parziale" : "errore",
      detail: `${availableCount}/${companies.length} società con DCF confrontabile; gli altri casi sono bloccati per qualità FCF, valuta, fase o dati insufficienti.`,
    },
    companyCount: companies.length,
    availableCount,
    coveragePercent: companies.length ? Math.round(availableCount / companies.length * 100) : 0,
    methodology: [
      "Free cash flow annuale SEC collegato al prezzo del World Terminal.",
      "Controllo qualità obbligatorio su operating cash flow, capex, margine FCF e coerenza dei valori.",
      "Tre scenari a cinque anni con crescita progressivamente decrescente.",
      "Prudente: sconto 11,5%, crescita terminale 2%.",
      "Base: sconto 9,5%, crescita terminale 2,5%.",
      "Espansivo: sconto 8,5%, crescita terminale 3%.",
      "Cassa e debito inclusi nel ponte enterprise-equity.",
      "Azioni diluite inferite da utile netto/EPS.",
      "Blocco automatico quando valuta del bilancio e del prezzo non coincidono.",
      "Nessun DCF tradizionale per società pre-commerciali.",
    ],
    companies,
    warnings: [
      "Il DCF usa ancora un free cash flow annuale: prima di un impiego reale servirà una normalizzazione pluriennale.",
      "Non sono ancora inclusi compensi azionari, acquisizioni future e costo del capitale specifico per società.",
      "Fair value e upside sono scenari, non obiettivi garantiti.",
    ],
  };
}
