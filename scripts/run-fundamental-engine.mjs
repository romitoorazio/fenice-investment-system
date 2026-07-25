import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'data', 'fundamental-research.json');
const snapshotPath = path.join(root, 'data', 'latest-snapshot.json');
const historyDir = path.join(root, 'data', 'history');
const now = new Date();
const secUserAgent = process.env.SEC_USER_AGENT || 'FeniceInvestmentSystem/3.2 romitoorazio@gmail.com';
const annualForms = new Set(['10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const universe = [
  { ticker: 'AAPL', cik: '0000320193', name: 'Apple Inc.', sector: 'Tecnologia e dispositivi' },
  { ticker: 'MSFT', cik: '0000789019', name: 'Microsoft Corp.', sector: 'Cloud e intelligenza artificiale' },
  { ticker: 'NVDA', cik: '0001045810', name: 'NVIDIA Corp.', sector: 'Semiconduttori e intelligenza artificiale' },
  { ticker: 'GOOGL', cik: '0001652044', name: 'Alphabet Inc.', sector: 'Internet, cloud e intelligenza artificiale' },
  { ticker: 'AMZN', cik: '0001018724', name: 'Amazon.com Inc.', sector: 'Cloud, commercio elettronico e logistica' },
  { ticker: 'META', cik: '0001326801', name: 'Meta Platforms Inc.', sector: 'Piattaforme digitali e intelligenza artificiale' },
  { ticker: 'TSM', cik: '0001046179', name: 'Taiwan Semiconductor Manufacturing', sector: 'Produzione di semiconduttori' },
  { ticker: 'ASML', cik: '0000937966', name: 'ASML Holding NV', sector: 'Macchinari per semiconduttori' },
  { ticker: 'CRSP', cik: '0001674416', name: 'CRISPR Therapeutics AG', sector: 'Biotecnologia e gene editing' },
  { ticker: 'RXRX', cik: '0001601830', name: 'Recursion Pharmaceuticals Inc.', sector: 'AI applicata alla scoperta di farmaci' },
  { ticker: 'NTLA', cik: '0001652130', name: 'Intellia Therapeutics Inc.', sector: 'Biotecnologia e gene editing' },
  { ticker: 'BIOX', cik: '0001769484', name: 'Bioceres Crop Solutions Corp.', sector: 'Agritech e biotecnologie agricole' },
];

const candidates = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'Revenue'],
  netIncome: ['NetIncomeLoss', 'ProfitLoss'],
  operatingIncome: ['OperatingIncomeLoss', 'ProfitLossFromOperatingActivities'],
  equity: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'Equity'],
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashAndCashEquivalents', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  debtTotal: ['LongTermDebtAndFinanceLeaseObligations', 'LongTermDebt', 'Borrowings'],
  debtCurrent: ['LongTermDebtAndFinanceLeaseObligationsCurrent', 'LongTermDebtCurrent', 'CurrentBorrowings'],
  debtNoncurrent: ['LongTermDebtAndFinanceLeaseObligationsNoncurrent', 'LongTermDebtNoncurrent', 'NoncurrentBorrowings'],
  operatingCashFlow: ['NetCashProvidedByUsedInOperatingActivities', 'CashFlowsFromUsedInOperatingActivities'],
  capitalExpenditure: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PurchaseOfPropertyPlantAndEquipment'],
  dilutedEps: ['EarningsPerShareDiluted', 'DilutedEarningsLossPerShare'],
};

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function requestJson(url, timeoutMs = 30000) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'accept-encoding': 'gzip, deflate',
          'user-agent': secUserAgent,
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(1500 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function entries(fact) {
  return Object.entries(fact?.units || {}).flatMap(([unit, values]) =>
    (Array.isArray(values) ? values : []).map((item) => ({ ...item, unit })),
  );
}

function annualSeries(fact) {
  const byEnd = new Map();
  for (const item of entries(fact)) {
    if (!annualForms.has(item.form) || !item.end || !Number.isFinite(Number(item.val))) continue;
    if (item.start) {
      const days = (new Date(item.end).getTime() - new Date(item.start).getTime()) / 86400000;
      if (!Number.isFinite(days) || days < 250) continue;
    }
    const existing = byEnd.get(item.end);
    if (!existing || String(item.filed || '') > String(existing.filed || '')) byEnd.set(item.end, item);
  }
  return [...byEnd.values()].sort((a, b) => String(b.end).localeCompare(String(a.end))).slice(0, 6);
}

function bestFact(facts, names) {
  let selected;
  let selectedEnd = '';
  let selectedCount = -1;
  for (const namespace of Object.values(facts || {})) {
    for (const name of names) {
      const fact = namespace?.[name];
      if (!fact) continue;
      const series = annualSeries(fact);
      const latestEnd = String(series[0]?.end || '');
      if (latestEnd > selectedEnd || (latestEnd === selectedEnd && series.length > selectedCount)) {
        selected = fact;
        selectedEnd = latestEnd;
        selectedCount = series.length;
      }
    }
  }
  return selected;
}

function metricForPeriod(fact, targetEnd) {
  const series = annualSeries(fact);
  if (!targetEnd) return series[0];
  return series.find((item) => item.end === targetEnd) || series.find((item) => String(item.end) < String(targetEnd));
}

const numericValue = (metric) => Number.isFinite(Number(metric?.val)) ? Number(metric.val) : undefined;
const percentage = (numerator, denominator) => Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0
  ? round((numerator / denominator) * 100, 1)
  : undefined;

function cagr(series) {
  const usable = series.filter((item) => Number(item.val) > 0).slice(0, 4);
  if (usable.length < 3) return undefined;
  const newest = usable[0];
  const oldest = usable.at(-1);
  const years = (new Date(newest.end).getTime() - new Date(oldest.end).getTime()) / (365.25 * 86400000);
  if (!Number.isFinite(years) || years < 1.5) return undefined;
  return round((Math.pow(Number(newest.val) / Number(oldest.val), 1 / years) - 1) * 100, 1);
}

function debtValue(facts, targetEnd) {
  const total = numericValue(metricForPeriod(bestFact(facts, candidates.debtTotal), targetEnd));
  const current = numericValue(metricForPeriod(bestFact(facts, candidates.debtCurrent), targetEnd));
  const noncurrent = numericValue(metricForPeriod(bestFact(facts, candidates.debtNoncurrent), targetEnd));
  if (Number.isFinite(current) && Number.isFinite(noncurrent)) return current + noncurrent;
  return Number.isFinite(total) ? total : Number.isFinite(noncurrent) ? noncurrent : current;
}

function financialsFrom(companyFacts, market) {
  const facts = companyFacts?.facts || {};
  const revenueFact = bestFact(facts, candidates.revenue);
  const revenueSeries = annualSeries(revenueFact);
  const revenueMetric = revenueSeries[0];
  const targetEnd = revenueMetric?.end;
  const metric = (names) => metricForPeriod(bestFact(facts, names), targetEnd);
  const epsMetric = metric(candidates.dilutedEps);
  const revenue = numericValue(revenueMetric);
  const netIncome = numericValue(metric(candidates.netIncome));
  const operatingIncome = numericValue(metric(candidates.operatingIncome));
  const operatingCashFlow = numericValue(metric(candidates.operatingCashFlow));
  const capexRaw = numericValue(metric(candidates.capitalExpenditure));
  const capitalExpenditure = Number.isFinite(capexRaw) ? Math.abs(capexRaw) : undefined;
  const freeCashFlow = Number.isFinite(operatingCashFlow) && Number.isFinite(capitalExpenditure)
    ? operatingCashFlow - capitalExpenditure
    : undefined;
  const cash = numericValue(metric(candidates.cash));
  const debt = debtValue(facts, targetEnd);
  const equity = numericValue(metric(candidates.equity));
  const dilutedEps = numericValue(epsMetric);
  const reportingCurrency = revenueMetric?.unit || epsMetric?.unit?.split('/')[0];
  const epsCurrency = epsMetric?.unit?.split('/')[0];
  const price = Number(market?.price);
  const priceCurrency = market?.currency;
  const comparablePrice = Number.isFinite(price) && epsCurrency && priceCurrency === epsCurrency;

  return {
    currency: reportingCurrency,
    fiscalYear: targetEnd ? new Date(targetEnd).getUTCFullYear() : undefined,
    revenue,
    revenueGrowth3YPercent: cagr(revenueSeries),
    netIncome,
    operatingIncome,
    operatingMarginPercent: percentage(operatingIncome, revenue),
    netMarginPercent: percentage(netIncome, revenue),
    operatingCashFlow,
    capitalExpenditure,
    freeCashFlow,
    freeCashFlowMarginPercent: percentage(freeCashFlow, revenue),
    cash,
    debt,
    equity,
    debtToEquity: Number.isFinite(debt) && Number.isFinite(equity) && equity !== 0 ? round(debt / equity, 2) : undefined,
    dilutedEps,
    price: Number.isFinite(price) ? price : undefined,
    priceToEarnings: comparablePrice && dilutedEps > 0 ? round(price / dilutedEps, 1) : undefined,
  };
}

function score(financials, sector, hasFiling) {
  const required = [financials.revenue, financials.netIncome, financials.operatingIncome, financials.operatingCashFlow,
    financials.capitalExpenditure, financials.cash, financials.debt, financials.equity, financials.dilutedEps, hasFiling ? 1 : undefined];
  const dataCompleteness = Math.round((required.filter((item) => Number.isFinite(item)).length / required.length) * 100);

  let profitability = 48;
  if (Number.isFinite(financials.operatingMarginPercent)) profitability += financials.operatingMarginPercent * 0.75;
  if (Number.isFinite(financials.netMarginPercent)) profitability += financials.netMarginPercent * 0.55;
  if (Number.isFinite(financials.freeCashFlowMarginPercent)) profitability += financials.freeCashFlowMarginPercent * 0.55;
  if (Number(financials.netIncome) < 0) profitability -= 18;
  if (Number(financials.freeCashFlow) < 0) profitability -= 14;
  profitability = Math.round(clamp(profitability));

  let growth = 48;
  if (Number.isFinite(financials.revenueGrowth3YPercent)) growth += financials.revenueGrowth3YPercent * 1.5;
  growth += Number(financials.netIncome) > 0 ? 6 : -10;
  growth = Math.round(clamp(growth));

  let balanceSheet = 52;
  if (Number.isFinite(financials.debtToEquity)) {
    if (financials.debtToEquity < 0.5) balanceSheet += 18;
    else if (financials.debtToEquity < 1) balanceSheet += 10;
    else if (financials.debtToEquity > 2) balanceSheet -= 22;
  }
  if (Number.isFinite(financials.cash) && Number.isFinite(financials.debt)) {
    if (financials.debt === 0) balanceSheet += 15;
    else if (financials.cash / financials.debt > 1) balanceSheet += 10;
    else if (financials.cash / financials.debt < 0.25) balanceSheet -= 10;
  }
  if (Number(financials.equity) <= 0) balanceSheet -= 25;
  balanceSheet = Math.round(clamp(balanceSheet));

  const quality = Math.round(clamp(profitability * 0.42 + balanceSheet * 0.33 + dataCompleteness * 0.25));
  let valuationPenalty = 0;
  if (Number.isFinite(financials.priceToEarnings)) {
    if (financials.priceToEarnings > 50) valuationPenalty = 12;
    else if (financials.priceToEarnings > 35) valuationPenalty = 6;
    else if (financials.priceToEarnings > 0 && financials.priceToEarnings < 15) valuationPenalty = -3;
  }
  if (/biotecnologia|farmaci/i.test(sector) && Number(financials.netIncome) < 0) valuationPenalty += 5;
  const overall = Math.round(clamp(quality * 0.35 + growth * 0.25 + profitability * 0.2 + balanceSheet * 0.2 - valuationPenalty));
  return { overall, quality, growth, profitability, balanceSheet, dataCompleteness };
}

function decision(scores) {
  if (scores.dataCompleteness < 40) return 'DATI INSUFFICIENTI';
  if (scores.overall >= 75 && scores.dataCompleteness >= 70) return 'PRIORITÀ';
  if (scores.overall >= 62) return 'APPROFONDISCI';
  if (scores.overall >= 48) return 'OSSERVA';
  return 'SCARTA';
}

function narrative(financials, scores, sector) {
  const thesis = [];
  const risks = [];
  if (Number(financials.revenueGrowth3YPercent) >= 10) thesis.push(`Ricavi cresciuti di circa ${financials.revenueGrowth3YPercent}% annuo nel periodo analizzato.`);
  if (Number(financials.operatingMarginPercent) >= 20) thesis.push(`Margine operativo elevato, circa ${financials.operatingMarginPercent}%.`);
  if (Number(financials.freeCashFlow) > 0) thesis.push(`Free cash flow positivo con margine di circa ${financials.freeCashFlowMarginPercent ?? 0}%.`);
  if (Number.isFinite(financials.debtToEquity) && financials.debtToEquity < 0.7) thesis.push('Struttura finanziaria relativamente solida rispetto al patrimonio netto.');
  if (scores.dataCompleteness >= 80) thesis.push('Copertura fondamentale sufficientemente completa per un approfondimento strutturato.');
  if (!thesis.length) thesis.push('Non emergono ancora vantaggi fondamentali abbastanza forti per una priorità.');

  if (scores.dataCompleteness < 70) risks.push('Copertura contabile incompleta o non perfettamente confrontabile.');
  if (Number(financials.freeCashFlow) < 0) risks.push('Free cash flow negativo nell’ultimo esercizio disponibile.');
  if (Number.isFinite(financials.debtToEquity) && financials.debtToEquity > 1.5) risks.push('Indebitamento elevato rispetto al patrimonio netto.');
  if (Number.isFinite(financials.priceToEarnings) && financials.priceToEarnings > 40) risks.push(`Valutazione elevata: P/E indicativo circa ${financials.priceToEarnings}.`);
  if (/biotecnologia|farmaci/i.test(sector)) risks.push('Settore soggetto a rischio clinico, regolatorio e di finanziamento.');
  if (!risks.length) risks.push('Rischi di mercato, concorrenza e revisione delle stime restano presenti.');
  return { thesis: thesis.slice(0, 5), risks: risks.slice(0, 5) };
}

function filingFrom(submissions, cik) {
  const recent = submissions?.filings?.recent || {};
  const forms = recent.form || [];
  for (let index = 0; index < forms.length; index += 1) {
    if (!annualForms.has(forms[index])) continue;
    const accession = recent.accessionNumber?.[index];
    const document = recent.primaryDocument?.[index];
    return {
      form: forms[index],
      filedAt: recent.filingDate?.[index],
      periodEnd: recent.reportDate?.[index],
      url: accession && document
        ? `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${String(accession).replaceAll('-', '')}/${document}`
        : undefined,
    };
  }
  return undefined;
}

async function main() {
  const previous = await readJson(reportPath, { companies: [], version: 0 });
  const snapshot = await readJson(snapshotPath, { markets: [], providers: [], warnings: [] });
  const previousMap = new Map((previous.companies || []).map((company) => [company.ticker, company]));
  const marketMap = new Map((snapshot.markets || []).map((market) => [String(market.symbol || '').toUpperCase(), { price: Number(market.price), currency: market.currency }]));
  const companies = [];
  const warnings = [];
  let liveSuccesses = 0;

  for (const target of universe) {
    try {
      const [companyFacts, submissions] = await Promise.all([
        requestJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${target.cik}.json`),
        requestJson(`https://data.sec.gov/submissions/CIK${target.cik}.json`),
      ]);
      const filing = filingFrom(submissions, target.cik);
      const financials = financialsFrom(companyFacts, marketMap.get(target.ticker));
      const scores = score(financials, target.sector, Boolean(filing));
      const text = narrative(financials, scores, target.sector);
      const absurdMargin = Math.abs(Number(financials.operatingMarginPercent)) > 150 || Math.abs(Number(financials.netMarginPercent)) > 150;
      if (absurdMargin) {
        scores.overall = Math.min(scores.overall, 35);
        scores.quality = Math.min(scores.quality, 35);
      }
      companies.push({
        ticker: target.ticker,
        name: companyFacts?.entityName || target.name,
        cik: target.cik,
        sector: target.sector,
        status: absurdMargin ? 'errore' : scores.dataCompleteness >= 70 ? 'operativo' : scores.dataCompleteness >= 40 ? 'parziale' : 'errore',
        observedAt: now.toISOString(),
        source: 'SEC EDGAR Company Facts',
        filing,
        financials,
        scores,
        decision: absurdMargin ? 'DATI INSUFFICIENTI' : decision(scores),
        thesis: text.thesis,
        risks: text.risks,
        warnings: [...(scores.dataCompleteness < 70 ? ['Punteggio ridotto per dati fondamentali incompleti.'] : []), ...(absurdMargin ? ['Controllo qualità fallito: margini non plausibili, punteggio bloccato.'] : [])],
      });
      liveSuccesses += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stale = previousMap.get(target.ticker);
      if (stale) companies.push({ ...stale, status: 'parziale', warnings: [...new Set([...(stale.warnings || []), `Aggiornamento SEC fallito (${message}); mantenuti i dati precedenti.`])] });
      else warnings.push(`${target.ticker}: dati fondamentali non acquisiti (${message}).`);
    }
    await sleep(500);
  }

  companies.sort((a, b) => b.scores.overall - a.scores.overall || b.scores.dataCompleteness - a.scores.dataCompleteness);
  const covered = companies.filter((company) => company.status !== 'errore').length;
  const coveragePercent = Math.round((covered / universe.length) * 100);
  const averageScore = companies.length ? Math.round(companies.reduce((sum, company) => sum + company.scores.overall, 0) / companies.length) : 0;
  const sourceState = liveSuccesses >= 9 ? 'operativo' : liveSuccesses ? 'parziale' : 'errore';
  const report = {
    version: Number(previous.version || 0) + 1,
    generatedAt: now.toISOString(),
    mode: coveragePercent >= 75 && liveSuccesses >= 6 ? 'live' : covered ? 'partial' : 'bootstrap',
    source: {
      name: 'SEC EDGAR Company Facts',
      state: sourceState,
      detail: `${liveSuccesses}/${universe.length} società aggiornate dal vivo; copertura validata ${covered}/${universe.length}.`,
      ...(liveSuccesses ? { lastSuccessAt: now.toISOString() } : {}),
    },
    universeSize: universe.length,
    companyCount: companies.length,
    coveragePercent,
    averageScore,
    methodology: [
      'Bilanci annuali 10-K, 20-F e 40-F pubblicati su SEC EDGAR.',
      'Tutte le metriche sono riallineate allo stesso periodo fiscale prima del calcolo.',
      'Crescita dei ricavi, margini, free cash flow, cassa, debito e patrimonio netto.',
      'P/E calcolato solo quando prezzo ed EPS usano la stessa valuta.',
      'Controllo qualità blocca margini impossibili e dati non coerenti.',
      'Screening quantitativo da verificare: nessun ordine viene inviato al broker.',
    ],
    companies,
    warnings: [...new Set(warnings)].slice(0, 30),
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  snapshot.providers = Array.isArray(snapshot.providers) ? snapshot.providers : [];
  snapshot.warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings : [];
  const provider = {
    id: 'sec-fundamentals',
    name: 'SEC Fundamental Research',
    state: sourceState,
    coverage: ['bilanci annuali', 'margini', 'cassa', 'debito', 'free cash flow', 'filings 10-K e 20-F'],
    detail: report.source.detail,
    ...(liveSuccesses ? { lastSuccessAt: now.toISOString() } : {}),
  };
  const providerIndex = snapshot.providers.findIndex((item) => item.id === provider.id);
  if (providerIndex >= 0) snapshot.providers[providerIndex] = provider;
  else snapshot.providers.push(provider);
  snapshot.research = {
    generatedAt: report.generatedAt,
    coveragePercent,
    averageScore,
    companyCount: report.companyCount,
    priorityCompanies: companies.filter((company) => ['PRIORITÀ', 'APPROFONDISCI'].includes(company.decision)).slice(0, 8).map((company) => company.ticker),
  };
  if (liveSuccesses) snapshot.warnings = snapshot.warnings.filter((warning) => !String(warning).startsWith('SEC EDGAR non disponibile'));
  if (coveragePercent < 70) snapshot.warnings.push('Ricerca fondamentale ancora parziale: le decisioni forti richiedono maggiore copertura SEC.');
  snapshot.warnings = [...new Set(snapshot.warnings)].slice(0, 30);
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await writeFile(path.join(historyDir, `${now.toISOString().slice(0, 10)}.json`), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  console.log(`Fenice Fundamental Research: ${liveSuccesses}/${universe.length} live, validated ${covered}/${universe.length}, average ${averageScore}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
