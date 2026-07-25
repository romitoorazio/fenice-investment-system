import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'data', 'fundamental-research.json');
const snapshotPath = path.join(root, 'data', 'latest-snapshot.json');
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const round = (value, digits = 1) => {
  if (!Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function isPreCommercial(company) {
  const financials = company.financials || {};
  const sector = String(company.sector || '').toLowerCase();
  const innovationSector = /biotecnologia|farmaci|gene editing|scoperta di farmaci/.test(sector);
  return innovationSector && Number(financials.netIncome) < 0 && Number(financials.revenue || 0) < 250_000_000;
}

function classifyStage(company) {
  if (isPreCommercial(company)) return 'pre-commerciale';
  const growth = Number(company.financials?.revenueGrowth3YPercent);
  return Number.isFinite(growth) && growth >= 10 ? 'crescita' : 'maturo';
}

function transformPreCommercial(company) {
  const financials = { ...(company.financials || {}) };
  const cash = Number(financials.cash);
  const operatingCashFlow = Number(financials.operatingCashFlow);
  const runway = Number.isFinite(cash) && Number.isFinite(operatingCashFlow) && operatingCashFlow < 0
    ? round(cash / Math.abs(operatingCashFlow), 1)
    : undefined;
  if (Number.isFinite(runway)) financials.cashRunwayYears = runway;

  const completeness = Number(company.scores?.dataCompleteness || 0);
  const balanceSheet = Number(company.scores?.balanceSheet || 0);
  const runwayScore = !Number.isFinite(runway) ? 20 : runway >= 2 ? 70 : runway >= 1 ? 50 : 20;
  const overall = Math.round(clamp(balanceSheet * 0.35 + completeness * 0.2 + runwayScore * 0.25 + 5, 20, 52));
  const quality = Math.round(clamp(balanceSheet * 0.45 + completeness * 0.35 + runwayScore * 0.2));

  const thesis = [];
  if (Number(company.financials?.revenueGrowth3YPercent) > 0) thesis.push('I ricavi sono ancora iniziali e non vengono usati come prova di solidità commerciale.');
  if (Number.isFinite(runway) && runway >= 1.5) thesis.push(`La liquidità copre indicativamente circa ${runway} anni dell’attuale consumo operativo di cassa.`);
  if (Number(company.financials?.debtToEquity) < 0.5) thesis.push('L’indebitamento finanziario appare contenuto rispetto al patrimonio netto.');
  if (!thesis.length) thesis.push('La tesi dipende soprattutto da risultati clinici, partnership e accesso futuro al capitale.');

  const risks = [
    'Società pre-commerciale: ricavi e margini tradizionali non descrivono ancora un modello economico maturo.',
    'Rischio clinico e regolatorio elevato; un singolo risultato può modificare radicalmente la valutazione.',
    'Possibile necessità di nuovo capitale e conseguente diluizione degli azionisti.',
  ];
  if (Number.isFinite(runway)) {
    risks.unshift(runway < 1 ? `Autonomia di cassa indicativa inferiore a un anno (${runway}).` : `Autonomia di cassa indicativa: circa ${runway} anni al consumo operativo attuale.`);
  }

  return {
    ...company,
    businessStage: 'pre-commerciale',
    status: completeness >= 70 ? 'operativo' : 'parziale',
    financials,
    scores: {
      ...company.scores,
      overall,
      quality,
      profitability: 0,
    },
    decision: 'SPECULATIVA',
    thesis: thesis.slice(0, 5),
    risks: risks.slice(0, 5),
    warnings: ['Punteggio specifico per società pre-commerciale: non comparabile direttamente con aziende mature.'],
  };
}

const report = JSON.parse(await readFile(reportPath, 'utf8'));
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));

report.companies = (report.companies || []).map((company) => {
  if (isPreCommercial(company)) return transformPreCommercial(company);
  return { ...company, businessStage: classifyStage(company) };
});
report.companies.sort((a, b) => b.scores.overall - a.scores.overall || b.scores.dataCompleteness - a.scores.dataCompleteness);

const validated = report.companies.filter((company) => company.status !== 'errore').length;
const speculative = report.companies.filter((company) => company.decision === 'SPECULATIVA').length;
report.coveragePercent = Math.round((validated / Math.max(1, report.universeSize)) * 100);
report.averageScore = report.companies.length
  ? Math.round(report.companies.reduce((sum, company) => sum + Number(company.scores.overall || 0), 0) / report.companies.length)
  : 0;
report.mode = report.coveragePercent >= 75 ? 'live' : validated ? 'partial' : 'bootstrap';
report.source.detail = `${report.companyCount}/${report.universeSize} società aggiornate; ${validated}/${report.universeSize} profili validati, di cui ${speculative} pre-commerciali.`;
report.methodology = [
  ...(report.methodology || []).filter((item) => !String(item).startsWith('Controllo qualità blocca')),
  'Le società pre-commerciali ricevono un modello separato basato su cassa, consumo di capitale, debito e rischio clinico.',
  'I punteggi SPECULATIVA non sono confrontabili direttamente con aziende mature e non generano segnali di acquisto.',
];
report.warnings = [...new Set(report.warnings || [])];

snapshot.research = {
  ...(snapshot.research || {}),
  generatedAt: report.generatedAt,
  coveragePercent: report.coveragePercent,
  averageScore: report.averageScore,
  companyCount: report.companyCount,
  speculativeCompanies: report.companies.filter((company) => company.decision === 'SPECULATIVA').map((company) => company.ticker),
  priorityCompanies: report.companies.filter((company) => ['PRIORITÀ', 'APPROFONDISCI'].includes(company.decision)).slice(0, 8).map((company) => company.ticker),
};
const provider = (snapshot.providers || []).find((item) => item.id === 'sec-fundamentals');
if (provider) provider.detail = report.source.detail;
snapshot.warnings = [...new Set((snapshot.warnings || []).filter((warning) => !String(warning).startsWith('Ricerca fondamentale ancora parziale')))].slice(0, 30);

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
console.log(`Fenice fundamental stage model: ${validated}/${report.universeSize} validated, ${speculative} speculative.`);
