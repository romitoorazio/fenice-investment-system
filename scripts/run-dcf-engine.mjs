import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'data', 'dcf-analysis.json');
const fundamentalPath = path.join(root, 'data', 'fundamental-research.json');
const terminalPath = path.join(root, 'data', 'terminal-intelligence.json');
const now = new Date();

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));
const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function isPreCommercial(company) {
  const sector = String(company.sector || '').toLowerCase();
  return /biotecnologia|farmaci|gene editing|scoperta di farmaci/.test(sector) && Number(company.financials?.netIncome) < 0 && Number(company.financials?.revenue || 0) < 250_000_000;
}

function inferShares(company) {
  const netIncome = Number(company.financials?.netIncome);
  const eps = Number(company.financials?.dilutedEps);
  if (!Number.isFinite(netIncome) || !Number.isFinite(eps) || eps === 0 || Math.sign(netIncome) !== Math.sign(eps)) return undefined;
  const shares = netIncome / eps;
  return Number.isFinite(shares) && shares > 0 ? shares : undefined;
}

function scenarioValue({ fcf, cash, debt, shares, startGrowth, terminalGrowth, discountRate, id, label }) {
  const forecastYears = 5;
  let presentValue = 0;
  let projectedFcf = fcf;
  const terminalTarget = Math.max(terminalGrowth + 0.5, 3);
  for (let year = 1; year <= forecastYears; year += 1) {
    const progress = (year - 1) / Math.max(1, forecastYears - 1);
    const growth = startGrowth + (terminalTarget - startGrowth) * progress;
    projectedFcf *= 1 + growth / 100;
    presentValue += projectedFcf / ((1 + discountRate / 100) ** year);
  }
  if (discountRate <= terminalGrowth) return { id, label, revenueGrowthStartPercent: startGrowth, terminalGrowthPercent: terminalGrowth, discountRatePercent: discountRate, forecastYears };
  const terminalValue = projectedFcf * (1 + terminalGrowth / 100) / ((discountRate - terminalGrowth) / 100);
  const enterpriseValue = presentValue + terminalValue / ((1 + discountRate / 100) ** forecastYears);
  const equityValue = enterpriseValue + cash - debt;
  const fairValuePerShare = equityValue > 0 && shares > 0 ? equityValue / shares : undefined;
  return {
    id,
    label,
    revenueGrowthStartPercent: round(startGrowth, 1),
    terminalGrowthPercent: terminalGrowth,
    discountRatePercent: discountRate,
    forecastYears,
    enterpriseValue: round(enterpriseValue, 0),
    equityValue: round(equityValue, 0),
    fairValuePerShare: round(fairValuePerShare, 2),
  };
}

function buildCompany(company, asset) {
  const currency = company.financials?.currency;
  const priceCurrency = asset?.currency;
  const fcf = Number(company.financials?.freeCashFlow);
  const cash = Math.max(0, Number(company.financials?.cash || 0));
  const debt = Math.max(0, Number(company.financials?.debt || 0));
  const shares = inferShares(company);
  const currentPrice = Number(asset?.price);
  const growth = Number(company.financials?.revenueGrowth3YPercent || 0);
  const completeness = Number(company.scores?.dataCompleteness || 0);
  const quality = Number(company.scores?.quality || 0);
  const warnings = [];
  const rationale = [];

  if (isPreCommercial(company)) {
    return {
      symbol: company.ticker,
      name: company.name,
      sector: company.sector,
      businessStage: 'pre-commerciale',
      status: 'non applicabile',
      currency,
      observedAt: now.toISOString(),
      source: 'SEC EDGAR + Fenice World Terminal',
      currentPrice: Number.isFinite(currentPrice) ? currentPrice : undefined,
      freeCashFlow: Number.isFinite(fcf) ? fcf : undefined,
      cash,
      debt,
      dilutedShares: shares,
      confidence: Math.round(clamp(completeness * 0.65 + quality * 0.35, 0, 100)),
      score: 25,
      scenarios: [],
      rationale: ['Il DCF tradizionale non è adatto a una società pre-commerciale con free cash flow negativo.'],
      warnings: ['Servono un modello probabilistico della pipeline clinica, autonomia di cassa e scenari di diluizione.'],
    };
  }

  if (!Number.isFinite(fcf) || fcf <= 0 || !Number.isFinite(shares) || shares <= 0) {
    return {
      symbol: company.ticker,
      name: company.name,
      sector: company.sector,
      businessStage: company.businessStage,
      status: 'dati insufficienti',
      currency,
      observedAt: now.toISOString(),
      source: 'SEC EDGAR + Fenice World Terminal',
      currentPrice: Number.isFinite(currentPrice) ? currentPrice : undefined,
      freeCashFlow: Number.isFinite(fcf) ? fcf : undefined,
      cash,
      debt,
      dilutedShares: shares,
      confidence: Math.round(clamp(completeness * 0.6 + quality * 0.4, 0, 100)),
      score: 35,
      scenarios: [],
      rationale: ['Free cash flow positivo e azioni diluite comparabili non sono entrambi disponibili.'],
      warnings: ['Nessun fair value viene prodotto con dati incompleti.'],
    };
  }

  if (!asset || !Number.isFinite(currentPrice) || currentPrice <= 0 || (currency && priceCurrency && currency !== priceCurrency)) {
    return {
      symbol: company.ticker,
      name: company.name,
      sector: company.sector,
      businessStage: company.businessStage,
      status: 'non confrontabile',
      currency,
      observedAt: now.toISOString(),
      source: 'SEC EDGAR + Fenice World Terminal',
      currentPrice: Number.isFinite(currentPrice) ? currentPrice : undefined,
      freeCashFlow: fcf,
      cash,
      debt,
      dilutedShares: shares,
      confidence: Math.round(clamp(completeness * 0.6 + quality * 0.4 - 15, 0, 100)),
      score: 50,
      scenarios: [],
      rationale: [`Bilancio espresso in ${currency || 'valuta non definita'} e prezzo espresso in ${priceCurrency || 'valuta non definita'}.`],
      warnings: ['ADR, rapporto di conversione o cambio valutario devono essere verificati prima di stimare il valore per azione.'],
    };
  }

  const baseGrowth = clamp(growth * 0.65, 3, 18);
  const scenarios = [
    scenarioValue({ fcf, cash, debt, shares, startGrowth: clamp(baseGrowth - 4, 0, 12), terminalGrowth: 2, discountRate: 11.5, id: 'prudente', label: 'Prudente' }),
    scenarioValue({ fcf, cash, debt, shares, startGrowth: baseGrowth, terminalGrowth: 2.5, discountRate: 9.5, id: 'base', label: 'Base' }),
    scenarioValue({ fcf, cash, debt, shares, startGrowth: clamp(baseGrowth + 3, 4, 22), terminalGrowth: 3, discountRate: 8.5, id: 'espansivo', label: 'Espansivo' }),
  ].map((scenario) => ({
    ...scenario,
    ...(Number.isFinite(scenario.fairValuePerShare) ? { upsidePercent: round(((scenario.fairValuePerShare / currentPrice) - 1) * 100, 1) } : {}),
  }));
  const low = scenarios[0]?.fairValuePerShare;
  const base = scenarios[1]?.fairValuePerShare;
  const high = scenarios[2]?.fairValuePerShare;
  const upside = Number.isFinite(base) ? ((base / currentPrice) - 1) * 100 : undefined;
  const confidence = Math.round(clamp(completeness * 0.5 + quality * 0.35 + 15 - Math.abs(baseGrowth - growth) * 0.3, 0, 95));
  const score = Math.round(clamp(50 + clamp(upside, -70, 70) * 0.6 + (confidence - 60) * 0.15, 5, 95));
  rationale.push(`Free cash flow di partenza ${round(fcf, 0)} ${currency}.`);
  rationale.push(`Crescita iniziale scenario base ${round(baseGrowth, 1)}%, in progressiva convergenza verso il tasso terminale.`);
  rationale.push(`Azioni diluite stimate da utile netto/EPS: ${round(shares, 0)}.`);
  if (Number.isFinite(upside)) rationale.push(`Scostamento scenario base rispetto al prezzo: ${round(upside, 1)}%.`);
  warnings.push('Le azioni diluite sono inferite dai dati SEC e devono essere confrontate con il filing annuale.');
  warnings.push('Il DCF è molto sensibile a crescita, tasso di sconto e terminal value; l’intervallo è più importante del valore centrale.');

  return {
    symbol: company.ticker,
    name: company.name,
    sector: company.sector,
    businessStage: company.businessStage,
    status: 'disponibile',
    currency,
    observedAt: now.toISOString(),
    source: 'SEC EDGAR + Fenice World Terminal',
    currentPrice,
    freeCashFlow: fcf,
    cash,
    debt,
    dilutedShares: round(shares, 0),
    confidence,
    score,
    fairValueLow: low,
    fairValueBase: base,
    fairValueHigh: high,
    upsideBasePercent: round(upside, 1),
    scenarios,
    rationale,
    warnings,
  };
}

const previous = await readJson(reportPath, { version: 0 });
const fundamental = await readJson(fundamentalPath, { companies: [] });
const terminal = await readJson(terminalPath, { assets: [] });
const assets = new Map((terminal.assets || []).map((asset) => [asset.symbol, asset]));
const companies = (fundamental.companies || []).map((company) => buildCompany(company, assets.get(company.ticker)));
companies.sort((left, right) => {
  const statusOrder = { disponibile: 0, 'non confrontabile': 1, 'dati insufficienti': 2, 'non applicabile': 3 };
  return (statusOrder[left.status] ?? 9) - (statusOrder[right.status] ?? 9) || Number(right.score || 0) - Number(left.score || 0);
});
const availableCount = companies.filter((company) => company.status === 'disponibile').length;
const report = {
  version: Number(previous.version || 0) + 1,
  generatedAt: now.toISOString(),
  mode: availableCount >= 5 ? 'live' : companies.length ? 'partial' : 'bootstrap',
  source: {
    name: 'Fenice DCF Scenario Engine',
    state: availableCount >= 5 ? 'operativo' : companies.length ? 'parziale' : 'errore',
    detail: `${availableCount}/${companies.length} società con DCF per azione confrontabile; le altre sono bloccate per valuta, fase aziendale o dati insufficienti.`,
  },
  companyCount: companies.length,
  availableCount,
  coveragePercent: companies.length ? Math.round((availableCount / companies.length) * 100) : 0,
  methodology: [
    'Free cash flow annuale normalizzato da SEC EDGAR e collegato al prezzo del World Terminal.',
    'Tre scenari a cinque anni con crescita iniziale che converge progressivamente verso un livello terminale.',
    'Scenario prudente: tasso di sconto 11,5% e crescita terminale 2%.',
    'Scenario base: tasso di sconto 9,5% e crescita terminale 2,5%.',
    'Scenario espansivo: tasso di sconto 8,5% e crescita terminale 3%.',
    'Cassa e debito sono inclusi nel ponte da enterprise value a equity value.',
    'Azioni diluite inferite da utile netto diviso EPS; il dato viene segnalato come stima.',
    'Nessun confronto per azione quando valuta del bilancio e valuta del prezzo non coincidono.',
    'Nessun DCF tradizionale per società pre-commerciali.',
  ],
  companies,
  warnings: [
    'Il DCF non incorpora ancora compensi azionari, acquisizioni future, ciclicità dettagliata o costo del capitale specifico per società.',
    'Fair value e upside sono scenari quantitativi, non obiettivi di prezzo garantiti.',
  ],
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Fenice DCF: ${availableCount}/${companies.length} disponibili, copertura ${report.coveragePercent}%.`);
