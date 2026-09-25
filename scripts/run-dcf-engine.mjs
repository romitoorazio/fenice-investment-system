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
  return /biotecnologia|farmaci|gene editing|scoperta di farmaci/.test(sector)
    && Number(company.financials?.netIncome) < 0
    && Number(company.financials?.revenue || 0) < 250_000_000;
}

function stageFor(company) {
  if (isPreCommercial(company)) return 'pre-commerciale';
  return Number(company.financials?.revenueGrowth3YPercent) >= 10 ? 'crescita' : 'maturo';
}

function inferShares(company) {
  const netIncome = Number(company.financials?.netIncome);
  const eps = Number(company.financials?.dilutedEps);
  if (!Number.isFinite(netIncome) || !Number.isFinite(eps) || eps === 0 || Math.sign(netIncome) !== Math.sign(eps)) return undefined;
  const shares = netIncome / eps;
  return Number.isFinite(shares) && shares > 0 ? shares : undefined;
}

function scenarioValue({ fcf, cash, debt, shares, startGrowth, terminalGrowth, discountRate, id, label, currentPrice }) {
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
  if (discountRate <= terminalGrowth) {
    return { id, label, revenueGrowthStartPercent: round(startGrowth, 1), terminalGrowthPercent: terminalGrowth, discountRatePercent: discountRate, forecastYears };
  }
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
    ...(Number.isFinite(fairValuePerShare) && Number.isFinite(currentPrice) && currentPrice > 0
      ? { upsidePercent: round((fairValuePerShare / currentPrice - 1) * 100, 1) }
      : {}),
  };
}

function buildRobustness({ fcf, cash, debt, shares, startGrowth, currentPrice }) {
  const discountRates = [8.5, 9.5, 10.5];
  const terminalGrowthRates = [1.5, 2.5, 3.5];
  const sensitivityCells = [];

  for (const discountRate of discountRates) {
    for (const terminalGrowth of terminalGrowthRates) {
      const scenario = scenarioValue({
        fcf,
        cash,
        debt,
        shares,
        startGrowth,
        terminalGrowth,
        discountRate,
        id: 'base',
        label: 'Sensitivity',
        currentPrice,
      });
      sensitivityCells.push({
        discountRatePercent: discountRate,
        terminalGrowthPercent: terminalGrowth,
        fairValuePerShare: scenario.fairValuePerShare,
        upsidePercent: scenario.upsidePercent,
      });
    }
  }

  const fairValues = sensitivityCells
    .map((cell) => cell.fairValuePerShare)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);

  if (fairValues.length !== sensitivityCells.length || fairValues.length === 0) {
    return {
      state: 'NON DISPONIBILE',
      sensitivityCells,
      supportingCells: 0,
      totalCells: sensitivityCells.length,
      supportPercent: 0,
      note: 'La matrice non è completa: Fenice non classifica la robustezza della valutazione.',
    };
  }

  const fairValueMin = fairValues[0];
  const fairValueMax = fairValues[fairValues.length - 1];
  const middle = Math.floor(fairValues.length / 2);
  const fairValueMedian = fairValues.length % 2
    ? fairValues[middle]
    : (fairValues[middle - 1] + fairValues[middle]) / 2;
  const supportingCells = sensitivityCells.filter((cell) => Number(cell.fairValuePerShare) >= currentPrice).length;
  const supportPercent = sensitivityCells.length ? (supportingCells / sensitivityCells.length) * 100 : 0;
  const valuationSpreadPercent = fairValueMedian > 0 ? ((fairValueMax - fairValueMin) / fairValueMedian) * 100 : undefined;
  const prudentMarginPercent = currentPrice > 0 ? (fairValueMin / currentPrice - 1) * 100 : undefined;
  const state = !Number.isFinite(valuationSpreadPercent)
    ? 'NON DISPONIBILE'
    : valuationSpreadPercent <= 35
      ? 'BASSA FRAGILITÀ'
      : valuationSpreadPercent <= 70
        ? 'MEDIA FRAGILITÀ'
        : 'ALTA FRAGILITÀ';

  return {
    state,
    sensitivityCells,
    supportingCells,
    totalCells: sensitivityCells.length,
    supportPercent: round(supportPercent, 1),
    fairValueMin: round(fairValueMin, 2),
    fairValueMedian: round(fairValueMedian, 2),
    fairValueMax: round(fairValueMax, 2),
    valuationSpreadPercent: round(valuationSpreadPercent, 1),
    prudentMarginPercent: round(prudentMarginPercent, 1),
    note: 'Sensibilità 3×3: crescita iniziale invariata; Fenice varia solo tasso di sconto (8,5/9,5/10,5%) e crescita terminale (1,5/2,5/3,5%). Non modifica score o decisioni.',
  };
}

function commonFields(company, asset, fcf, cash, debt, shares) {
  return {
    symbol: company.ticker,
    name: company.name,
    sector: company.sector,
    businessStage: stageFor(company),
    currency: company.financials?.currency,
    observedAt: now.toISOString(),
    source: 'SEC EDGAR + Fenice World Terminal',
    currentPrice: Number.isFinite(Number(asset?.price)) ? Number(asset.price) : undefined,
    freeCashFlow: Number.isFinite(fcf) ? fcf : undefined,
    cash,
    debt,
    dilutedShares: round(shares, 0),
  };
}

function buildCompany(company, asset) {
  const currency = company.financials?.currency;
  const priceCurrency = asset?.currency;
  const currentPrice = Number(asset?.price);
  const revenue = Number(company.financials?.revenue);
  const operatingCashFlow = Number(company.financials?.operatingCashFlow);
  const capitalExpenditure = Number(company.financials?.capitalExpenditure);
  const fcf = Number(company.financials?.freeCashFlow);
  const cash = Math.max(0, Number(company.financials?.cash || 0));
  const debt = Math.max(0, Number(company.financials?.debt || 0));
  const shares = inferShares(company);
  const growth = Number(company.financials?.revenueGrowth3YPercent || 0);
  const completeness = Number(company.scores?.dataCompleteness || 0);
  const quality = Number(company.scores?.quality || 0);
  const capexRevenuePercent = Number.isFinite(capitalExpenditure) && revenue > 0 ? (capitalExpenditure / revenue) * 100 : undefined;
  const fcfMarginPercent = Number.isFinite(fcf) && revenue > 0 ? (fcf / revenue) * 100 : undefined;
  const suspiciousCapex =
    !Number.isFinite(operatingCashFlow)
    || !Number.isFinite(capitalExpenditure)
    || capitalExpenditure <= 0
    || !Number.isFinite(fcf)
    || fcf > operatingCashFlow * 1.001
    || (['NVDA', 'AMZN'].includes(company.ticker) && Number(capexRevenuePercent) < 2)
    || Number(fcfMarginPercent) > 55;
  const common = commonFields(company, asset, fcf, cash, debt, shares);

  if (isPreCommercial(company)) {
    return {
      ...common,
      status: 'non applicabile',
      confidence: Math.round(clamp(completeness * 0.65 + quality * 0.35, 0, 100)),
      score: 25,
      scenarios: [],
      rationale: ['Il DCF tradizionale non è adatto a una società pre-commerciale con free cash flow negativo.'],
      warnings: ['Servono un modello probabilistico della pipeline clinica, autonomia di cassa e scenari di diluizione.'],
    };
  }

  if (suspiciousCapex) {
    return {
      ...common,
      status: 'dati insufficienti',
      confidence: Math.round(clamp(completeness * 0.45 + quality * 0.25, 0, 55)),
      score: 35,
      scenarios: [],
      rationale: ['Il free cash flow non supera il controllo di qualità su operating cash flow e investimenti.'],
      warnings: [
        `Capex/ricavi indicativo: ${round(capexRevenuePercent, 2) ?? 'n/d'}%; margine FCF: ${round(fcfMarginPercent, 1) ?? 'n/d'}%.`,
        'Il DCF resta bloccato finché il capex non viene riconciliato con cash-flow statement e note del filing.',
      ],
    };
  }

  if (!Number.isFinite(fcf) || fcf <= 0 || !Number.isFinite(shares) || shares <= 0) {
    return {
      ...common,
      status: 'dati insufficienti',
      confidence: Math.round(clamp(completeness * 0.6 + quality * 0.4, 0, 100)),
      score: 35,
      scenarios: [],
      rationale: ['Free cash flow positivo e azioni diluite confrontabili non sono entrambi disponibili.'],
      warnings: ['Nessun fair value viene prodotto con dati incompleti.'],
    };
  }

  if (!asset || !Number.isFinite(currentPrice) || currentPrice <= 0 || (currency && priceCurrency && currency !== priceCurrency)) {
    return {
      ...common,
      status: 'non confrontabile',
      confidence: Math.round(clamp(completeness * 0.6 + quality * 0.4 - 15, 0, 100)),
      score: 50,
      scenarios: [],
      rationale: [`Bilancio espresso in ${currency || 'valuta non definita'} e prezzo espresso in ${priceCurrency || 'valuta non definita'}.`],
      warnings: ['ADR, rapporto di conversione o cambio devono essere verificati prima di stimare il valore per azione.'],
    };
  }

  const baseGrowth = clamp(growth * 0.65, 3, 18);
  const scenarios = [
    scenarioValue({ fcf, cash, debt, shares, startGrowth: clamp(baseGrowth - 4, 0, 12), terminalGrowth: 2, discountRate: 11.5, id: 'prudente', label: 'Prudente', currentPrice }),
    scenarioValue({ fcf, cash, debt, shares, startGrowth: baseGrowth, terminalGrowth: 2.5, discountRate: 9.5, id: 'base', label: 'Base', currentPrice }),
    scenarioValue({ fcf, cash, debt, shares, startGrowth: clamp(baseGrowth + 3, 4, 22), terminalGrowth: 3, discountRate: 8.5, id: 'espansivo', label: 'Espansivo', currentPrice }),
  ];
  const low = scenarios[0]?.fairValuePerShare;
  const base = scenarios[1]?.fairValuePerShare;
  const high = scenarios[2]?.fairValuePerShare;
  const upside = Number.isFinite(base) ? (base / currentPrice - 1) * 100 : undefined;
  const extremeValuation = Number.isFinite(base) && (base > currentPrice * 4 || base < currentPrice * 0.1);
  const confidence = Math.round(clamp(completeness * 0.5 + quality * 0.35 + 15 - Math.abs(baseGrowth - growth) * 0.3 - (extremeValuation ? 25 : 0), 0, 95));
  const robustness = buildRobustness({ fcf, cash, debt, shares, startGrowth: baseGrowth, currentPrice });
  const warnings = [
    'Le azioni diluite sono inferite dai dati SEC e devono essere confrontate con il filing.',
    'L’intervallo di scenari è più importante del valore centrale.',
    ...(Number(fcfMarginPercent) > 35 ? [`Margine FCF elevato (${round(fcfMarginPercent, 1)}%): usare una media pluriennale prima di investire.`] : []),
    ...(extremeValuation ? ['Il valore centrale è estremo rispetto al prezzo: score e confidenza sono ridotti e il risultato richiede riconciliazione manuale.'] : []),
    ...(robustness.state === 'ALTA FRAGILITÀ' ? ['La valutazione è molto sensibile a tasso di sconto e crescita terminale: evitare di trattare il fair value base come stima puntuale affidabile.'] : []),
  ];

  return {
    ...common,
    status: 'disponibile',
    confidence,
    score: Math.round(clamp(50 + clamp(Number(upside), -70, 70) * 0.6 + (confidence - 60) * 0.15 - (extremeValuation ? 20 : 0), 5, 95)),
    fairValueLow: low,
    fairValueBase: base,
    fairValueHigh: high,
    upsideBasePercent: round(upside, 1),
    scenarios,
    robustness,
    rationale: [
      `Free cash flow di partenza ${round(fcf, 0)} ${currency}.`,
      `Capex/ricavi verificato al ${round(capexRevenuePercent, 2)}%.`,
      `Crescita iniziale scenario base ${round(baseGrowth, 1)}%, poi progressivamente ridotta.`,
      `Azioni diluite stimate da utile netto/EPS: ${round(shares, 0)}.`,
      `Scostamento scenario base rispetto al prezzo: ${round(upside, 1)}%.`,
      `Robustezza: ${robustness.supportingCells}/${robustness.totalCells} celle della matrice di sensibilità hanno fair value almeno pari al prezzo corrente; fragilità ${robustness.state.toLowerCase()}.`,
    ],
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
  mode: availableCount >= 4 ? 'live' : companies.length ? 'partial' : 'bootstrap',
  source: {
    name: 'Fenice DCF Scenario Engine',
    state: availableCount >= 4 ? 'operativo' : companies.length ? 'parziale' : 'errore',
    detail: `${availableCount}/${companies.length} società con DCF confrontabile; gli altri casi sono bloccati per qualità FCF, valuta, fase o dati insufficienti.`,
  },
  companyCount: companies.length,
  availableCount,
  coveragePercent: companies.length ? Math.round((availableCount / companies.length) * 100) : 0,
  methodology: [
    'Free cash flow annuale SEC collegato al prezzo del World Terminal.',
    'Controllo qualità obbligatorio su operating cash flow, capex, margine FCF e coerenza dei valori.',
    'Tre scenari a cinque anni con crescita progressivamente decrescente.',
    'Prudente: sconto 11,5%, crescita terminale 2%.',
    'Base: sconto 9,5%, crescita terminale 2,5%.',
    'Espansivo: sconto 8,5%, crescita terminale 3%.',
    'Matrice di sensibilità 3×3 separata: crescita base invariata, tasso di sconto 8,5/9,5/10,5% e crescita terminale 1,5/2,5/3,5%.',
    'La fragilità della valutazione misura la dispersione dei fair value nella matrice e non modifica il DCF score.',
    'Cassa e debito inclusi nel ponte enterprise-equity.',
    'Azioni diluite inferite da utile netto/EPS.',
    'Blocco automatico quando valuta del bilancio e del prezzo non coincidono.',
    'Nessun DCF tradizionale per società pre-commerciali.',
  ],
  companies,
  warnings: [
    'Il DCF usa ancora un free cash flow annuale: il dataset corrente non contiene una serie pluriennale FCF sufficiente per una normalizzazione storica difendibile.',
    'Non sono ancora inclusi compensi azionari, acquisizioni future e costo del capitale specifico per società.',
    'La matrice di sensibilità misura quanto il fair value dipende dalle ipotesi, ma non sostituisce una normalizzazione pluriennale del free cash flow.',
    'Fair value, upside e supporto della matrice sono scenari di ricerca, non obiettivi garantiti né segnali di acquisto.',
  ],
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Fenice DCF: ${availableCount}/${companies.length} disponibili, copertura ${report.coveragePercent}%.`);
