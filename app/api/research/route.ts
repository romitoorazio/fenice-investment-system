import research from "@/data/fundamental-research.json";
import type { FundamentalCompany, FundamentalResearchReport } from "@/lib/research";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function isPreCommercial(company: FundamentalCompany) {
  const sector = company.sector.toLowerCase();
  return (
    /biotecnologia|farmaci|gene editing|scoperta di farmaci/.test(sector) &&
    Number(company.financials.netIncome) < 0 &&
    Number(company.financials.revenue ?? 0) < 250_000_000
  );
}

function applyStageModel(company: FundamentalCompany): FundamentalCompany {
  if (!isPreCommercial(company)) {
    const growth = Number(company.financials.revenueGrowth3YPercent);
    return {
      ...company,
      businessStage: Number.isFinite(growth) && growth >= 10 ? "crescita" : "maturo",
    };
  }

  const cash = Number(company.financials.cash);
  const operatingCashFlow = Number(company.financials.operatingCashFlow);
  const runway = Number.isFinite(cash) && Number.isFinite(operatingCashFlow) && operatingCashFlow < 0
    ? Math.round((cash / Math.abs(operatingCashFlow)) * 10) / 10
    : undefined;
  const completeness = Number(company.scores.dataCompleteness || 0);
  const balanceSheet = Number(company.scores.balanceSheet || 0);
  const runwayScore = runway === undefined ? 20 : runway >= 2 ? 70 : runway >= 1 ? 50 : 20;
  const overall = Math.round(clamp(balanceSheet * 0.35 + completeness * 0.2 + runwayScore * 0.25 + 5, 20, 52));
  const quality = Math.round(clamp(balanceSheet * 0.45 + completeness * 0.35 + runwayScore * 0.2));

  const thesis = [
    "I ricavi sono ancora iniziali e non vengono usati come prova di solidità commerciale.",
    ...(runway !== undefined && runway >= 1.5
      ? [`La liquidità copre indicativamente circa ${runway} anni dell’attuale consumo operativo di cassa.`]
      : []),
    ...(Number(company.financials.debtToEquity) < 0.5
      ? ["L’indebitamento finanziario appare contenuto rispetto al patrimonio netto."]
      : []),
  ];

  const risks = [
    ...(runway !== undefined
      ? [runway < 1
          ? `Autonomia di cassa indicativa inferiore a un anno (${runway}).`
          : `Autonomia di cassa indicativa: circa ${runway} anni al consumo operativo attuale.`]
      : []),
    "Società pre-commerciale: ricavi e margini tradizionali non descrivono ancora un modello economico maturo.",
    "Rischio clinico e regolatorio elevato; un singolo risultato può modificare radicalmente la valutazione.",
    "Possibile necessità di nuovo capitale e conseguente diluizione degli azionisti.",
  ];

  return {
    ...company,
    businessStage: "pre-commerciale",
    status: completeness >= 70 ? "operativo" : "parziale",
    financials: {
      ...company.financials,
      ...(runway !== undefined ? { cashRunwayYears: runway } : {}),
    },
    scores: {
      ...company.scores,
      overall,
      quality,
      profitability: 0,
    },
    decision: "SPECULATIVA",
    thesis: thesis.length ? thesis : ["La tesi dipende da risultati clinici, partnership e accesso futuro al capitale."],
    risks,
    warnings: ["Punteggio specifico per società pre-commerciale: non confrontabile direttamente con aziende mature."],
  };
}

function buildLiveReport(): FundamentalResearchReport {
  const report = structuredClone(research) as unknown as FundamentalResearchReport;
  report.companies = report.companies.map(applyStageModel).sort(
    (left, right) => right.scores.overall - left.scores.overall || right.scores.dataCompleteness - left.scores.dataCompleteness,
  );
  const validated = report.companies.filter((company) => company.status !== "errore").length;
  const speculative = report.companies.filter((company) => company.decision === "SPECULATIVA").length;
  report.coveragePercent = Math.round((validated / Math.max(1, report.universeSize)) * 100);
  report.averageScore = report.companies.length
    ? Math.round(report.companies.reduce((sum, company) => sum + company.scores.overall, 0) / report.companies.length)
    : 0;
  report.mode = report.coveragePercent >= 75 ? "live" : validated ? "partial" : "bootstrap";
  report.source.detail = `${report.companyCount}/${report.universeSize} società aggiornate; ${validated}/${report.universeSize} profili validati, di cui ${speculative} pre-commerciali.`;
  report.methodology = [
    ...report.methodology.filter((item) => !item.startsWith("Controllo qualità blocca")),
    "Le società pre-commerciali ricevono un modello separato basato su cassa, consumo di capitale, debito e rischio clinico.",
    "I punteggi SPECULATIVA non sono confrontabili direttamente con aziende mature e non generano segnali di acquisto.",
  ];
  return report;
}

export async function GET() {
  return Response.json(buildLiveReport(), {
    headers: {
      "cache-control": "no-store, max-age=0",
    },
  });
}
