import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'data', 'fundamental-research.json');
const snapshotPath = path.join(root, 'data', 'latest-snapshot.json');
const historyDir = path.join(root, 'data', 'history');
const now = new Date();
const annualForms = new Set(['10-K', '10-K/A', '20-F', '20-F/A', '40-F', '40-F/A']);
const secUserAgent = process.env.SEC_USER_AGENT || 'FeniceInvestmentSystem/3.0 romitoorazio@gmail.com';
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const round = (value, digits = 2) => {
  if (!Number.isFinite(value)) return undefined;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const universe = [
  { ticker: 'AAPL', sector: 'Tecnologia e dispositivi' },
  { ticker: 'MSFT', sector: 'Cloud e intelligenza artificiale' },
  { ticker: 'NVDA', sector: 'Semiconduttori e intelligenza artificiale' },
  { ticker: 'GOOGL', sector: 'Internet, cloud e intelligenza artificiale' },
  { ticker: 'AMZN', sector: 'Cloud, commercio elettronico e logistica' },
  { ticker: 'META', sector: 'Piattaforme digitali e intelligenza artificiale' },
  { ticker: 'TSM', sector: 'Produzione di semiconduttori' },
  { ticker: 'ASML', sector: 'Macchinari per semiconduttori' },
  { ticker: 'CRSP', sector: 'Biotecnologia e gene editing' },
  { ticker: 'RXRX', sector: 'AI applicata alla scoperta di farmaci' },
  { ticker: 'NTLA', sector: 'Biotecnologia e gene editing' },
  { ticker: 'BIOX', sector: 'Agritech e biotecnologie agricole' },
];

const factCandidates = {
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'Revenue'],
  netIncome: ['NetIncomeLoss', 'ProfitLoss'],
  operatingIncome: ['OperatingIncomeLoss', 'ProfitLossFromOperatingActivities'],
  assets: ['Assets'],
  liabilities: ['Liabilities'],
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

async function requestJson(url, timeoutMs = 25000) {
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
      if (attempt < 3) await sleep(attempt * 1800);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function findFact(facts, candidates) {
  for (const namespace of Object.values(facts || {})) {
    for (const candidate of candidates) {
      if (namespace?.[candidate]) return namespace[candidate];
    }
  }
  return undefined;
}

function factEntries(fact) {
  if (!fact?.units) return [];
  return Object.entries(fact.units).flatMap(([unit, entries]) =>
    (Array.isArray(entries) ? entries : []).map((entry) => ({ ...entry, unit })),
  );
}

function annualSeries(fact) {
  const byEnd = new Map();
  for (const entry of factEntries(fact)) {
    if (!annualForms.has(entry.form) || !entry.end || !Number.isFinite(Number(entry.val))) continue;
    if (entry.start) {
      const durationDays = (new Date(entry.end).getTime() - new Date(entry.start).getTime()) / 86400000;
      if (!Number.isFinite(durationDays) || durationDays < 250) continue;
    }
    const existing = byEnd.get(entry.end);
    if (!existing || String(entry.filed || '') > String(existing.filed || '')) byEnd.set(entry.end, entry);
  }
  return [...byEnd.values()].sort((left, right) => String(right.end).localeCompare(String(left.end))).slice(0, 6);
}

function latestMetric(fact) {
  return annualSeries(fact)[0];
}

function valueOf(metric) {
  const value = Number(metric?.val);
  return Number.isFinite(value) ? value : undefined;
}

function percent(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return undefined;
  return round((numerator / denominator) * 100, 1);
}

function cagrPercent(series) {
  const usable = series.filter((entry) => Number(entry.val) > 0).slice(0, 4);
  if (usable.length < 3) return undefined;
  const latest = usable[0];
  const oldest = usable.at(-1);
  const years = (new Date(latest.end).getTime() - new Date(oldest.end).getTime()) / (365.25 * 86400000);
  if (!Number.isFinite(years) || years < 1.5) return undefined;
  return round((Math.pow(Number(latest.val) / Number(oldest.val), 1 / years) - 1) * 100, 1);
}

function latestDebt(facts) {
  const total = latestMetric(findFact(facts, factCandidates.debtTotal));
  const current = latestMetric(findFact(facts, factCandidates.debtCurrent));
  const noncurrent = latestMetric(findFact(facts, factCandidates.debtNoncurrent));
  const totalValue = valueOf(total);
  const currentValue = valueOf(current);
  const noncurrentValue = valueOf(noncurrent);
  if (Number.isFinite(currentValue) && Number.isFinite(noncurrentValue)) return currentValue + noncurrentValue;
  if (Number.isFinite(totalValue)) return totalValue;
  if (Number.isFinite(noncurrentValue)) return noncurrentValue;
  return currentValue;
}

function scoreCompany(financials, sector, hasFiling) {
  const required = [
    financials.revenue,
    financials.netIncome,
    financials.operatingIncome,
    financials.operatingCashFlow,
    financials.capitalExpenditure,
    financials.cash,
    financials.debt,
    financials.equity,
    financials.dilutedEps,
    hasFiling ? 1 : undefined,
  ];
  const completeness = Math.round((required.filter(Number.isFinite).length / required.length) * 100);

  let profitability = 48;
  if (Number.isFinite(financials.operatingMarginPercent)) profitability += financials.operatingMarginPercent * 0.9;
  if (Number.isFinite(financials.netMarginPercent)) profitability += financials.netMarginPercent * 0.7;
  if (Number.isFinite(financials.freeCashFlowMarginPercent)) profitability += financials.freeCashFlowMarginPercent * 0.7;
  if (Number(financials.netIncome) < 0) profitability -= 18;
  if (Number(financials.freeCashFlow) < 0) profitability -= 14;
  profitability = Math.round(clamp(profitability));

  let growth = 48;
  if (Number.isFinite(financials.revenueGrowth3YPercent)) growth += financials.revenueGrowth3YPercent * 1.5;
  if (Number(financials.netIncome) > 0) growth += 6;
  else growth -= 10;
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

  const quality = Math.round(clamp(profitability * 0.42 + balanceSheet * 0.33 + completeness * 0.25));
  let valuationPenalty = 0;
  if (Number.isFinite(financials.priceToEarnings)) {
    if (financials.priceToEarnings > 50) valuationPenalty = 12;
    else if (financials.priceToEarnings > 35) valuationPenalty = 6;
    else if (financials.priceToEarnings > 0 && financials.priceToEarnings < 15) valuationPenalty = -3;
  }
  if (/biotecnologia|farmaci/i.test(sector) && Number(financials.netIncome) < 0) valuationPenalty += 5;
  const overall = Math.round(clamp(quality * 0.35 + growth * 0.25 + profitability * 0.2 + balanceSheet * 0.2 - valuationPenalty));

  return { overall, quality, growth, profitability, balanceSheet, dataCompleteness: completeness };
}

function decisionFor(scores) {
  if (scores.dataCompleteness < 40) return 'DATI INSUFFICIENTI';
  if (scores.overall >= 75 && scores.dataCompleteness >= 70) return 'PRIORITÀ';
  if (scores.overall >= 62) return 'APPROFONDISCI';
  if (scores.overall >= 48) return 'OSSERVA';
  return 'SCARTA';
}

function buildNarrative(financials, scores, sector) {
  const thesis = [];
  const risks = [];
  if (Number(financials.revenueGrowth3YPercent) >= 10) thesis.push(`Ricavi cresciuti di circa ${financials.revenueGrowth3YPercent}% annuo nel periodo analizzato.`);
  if (Number(financials.operatingMarginPercent) >= 20) thesis.push(`Margine operativo elevato, circa ${financials.operatingMarginPercent}%.`);
  if (Number(financials.freeCashFlow) > 0) thesis.push(`Generazione di free cash flow positiva con margine di circa ${financials.freeCashFlowMarginPercent ?? 0}%.`);
  if (Number.isFinite(financials.debtToEquity) && financials.debtToEquity < 0.7) thesis.push('Struttura finanziaria relativamente solida rispetto al patrimonio netto.');
  if (scores.dataCompleteness >= 80) thesis.push('Copertura dei dati fondamentali sufficientemente completa per un approfondimento strutturato.');
  if (!thesis.length) thesis.push('La società resta nella watchlist, ma non emergono ancora vantaggi fondamentali abbastanza forti.');

  if (scores.dataCompleteness < 70) risks.push('Copertura contabile incompleta o non perfettamente confrontabile.');
  if (Number(financials.freeCashFlow) < 0) risks.push('Free cash flow negativo nell’ultimo esercizio disponibile.');
  if (Number.isFinite(financials.debtToEquity) && financials.debtToEquity > 1.5) risks.push('Indebitamento elevato rispetto al patrimonio netto.');
  if (Number.isFinite(financials.priceToEarnings) && financials.priceToEarnings > 40) risks.push(`Valutazione elevata: P/E indicativo circa ${financials.priceToEarnings}.`);
  if (/biotecnologia|farmaci/i.test(sector)) risks.push('Settore soggetto a rischio clinico, regolatorio e di finanziamento.');
  if (!risks.length) risks.push('Rischi di mercato, concorrenza e revisione delle stime restano presenti.');
  return { thesis: thesis.slice(0, 5), risks: risks.slice(0, 5) };
}

function latestAnnualFiling(submissions, cik) {
  const recent = submissions?.filings?.recent || {};
  const forms = recent.form || [];
  for (let index = 0; index < forms.length; index += 1) {
    if (!annualForms.has(forms[index])) continue;
    const accession = recent.accessionNumber?.[index];
    const primaryDocument = recent.primaryDocument?.[index];
    const accessionClean = String(accession || '').replaceAll('-', '');
    const cikClean = String(Number(cik));
    return {
      form: forms[index],
      filedAt: recent.filingDate?.[index],
      periodEnd: recent.reportDate?.[index],
      url: accession && primaryDocument
        ? `https://www.sec.gov/Archives/edgar/data/${cikClean}/${accessionClean}/${primaryDocument}`
        : undefined,
    };
  }
  return undefined;
}

function buildFinancials(companyFacts, price) {
  const facts = companyFacts?.facts || {};
  const revenueFact = findFact(facts, factCandidates.revenue);
  const revenueSeries = annualSeries(revenueFact);
  const revenueMetric = revenueSeries[0];
  const revenue = valueOf(revenueMetric);
  const netIncome = valueOf(latestMetric(findFact(facts, factCandidates.netIncome)));
  const operatingIncome = valueOf(latestMetric(findFact(facts, factCandidates.operatingIncome)));
  const operatingCashFlow = valueOf(latestMetric(findFact(facts, factCandidates.operatingCashFlow)));
  const capexRaw = valueOf(latestMetric(findFact(facts, factCandidates.capitalExpenditure)));
  const capitalExpenditure = Number.isFinite(capexRaw) ? Math.abs(capexRaw) : undefined;
  const freeCashFlow = Number.isFinite(operatingCashFlow) && Number.isFinite(capitalExpenditure)
    ? operatingCashFlow - capitalExpenditure
    : undefined;
  const cash = valueOf(latestMetric(findFact(facts, factCandidates.cash)));
  const debt = latestDebt(facts);
  const equity = valueOf(latestMetric(findFact(facts, factCandidates.equity)));
  const dilutedEpsMetric = latestMetric(findFact(facts, factCandidates.dilutedEps));
  const dilutedEps = valueOf(dilutedEpsMetric);
  const currency = revenueMetric?.unit || dilutedEpsMetric?.unit?.split('/')[0];
  const fiscalYear = revenueMetric?.end ? new Date(revenueMetric.end).getUTCFullYear() : undefined;
  const priceToEarnings = Number.isFinite(price) && Number.isFinite(dilutedEps) && dilutedEps > 0 ? round(price / dilutedEps, 1) : undefined;

  return {
    currency,
    fiscalYear,
    revenue,
    revenueGrowth3YPercent: cagrPercent(revenueSeries),
    netIncome,
    operatingIncome,
    operatingMarginPercent: percent(operatingIncome, revenue),
    netMarginPercent: percent(netIncome, revenue),
    operatingCashFlow,
    capitalExpenditure,
    freeCashFlow,
    freeCashFlowMarginPercent: percent(freeCashFlow, revenue),
    cash,
    debt,
    equity,
    debtToEquity: Number.isFinite(debt) && Number.isFinite(equity) && equity !== 0 ? round(debt / equity, 2) : undefined,
    dilutedEps,
    price,
    priceToEarnings,
  };
}

async function main() {
  const previous = await readJson(reportPath, { companies: [], version: 0 });
  const snapshot = await readJson(snapshotPath, { markets: [], providers: [], warnings: [] });
  const previousByTicker = new Map((previous.companies || []).map((company) => [company.ticker, company]));
  const priceByTicker = new Map((snapshot.markets || []).map((market) => [String(market.symbol || '').toUpperCase(), Number(market.price)]));
  const warnings = [];
  let tickerRows = [];

  try {
    const tickerData = await requestJson('https://www.sec.gov/files/company_tickers.json');
    tickerRows = Object.values(tickerData || {});
  } catch (error) {
    warnings.push(`Mappa ticker SEC non disponibile: ${error instanceof Error ? error.message : String(error)}.`);
  }

  const tickerMap = new Map(tickerRows.map((row) => [String(row.ticker || '').toUpperCase(), row]));
  const companies = [];
  let liveSuccesses = 0;

  for (const target of universe) {
    const mapping = tickerMap.get(target.ticker);
    if (!mapping?.cik_str) {
      const stale = previousByTicker.get(target.ticker);
      if (stale) companies.push({ ...stale, status: 'parziale', warnings: [...new Set([...(stale.warnings || []), 'CIK non aggiornato nell’ultimo ciclo; mantenuti i dati precedenti.'])] });
      else warnings.push(`${target.ticker}: associazione ticker/CIK non trovata.`);
      continue;
    }

    const cik = String(mapping.cik_str).padStart(10, '0');
    try {
      const [companyFacts, submissions] = await Promise.all([
        requestJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`),
        requestJson(`https://data.sec.gov/submissions/CIK${cik}.json`),
      ]);
      const filing = latestAnnualFiling(submissions, cik);
      const financials = buildFinancials(companyFacts, priceByTicker.get(target.ticker));
      const scores = scoreCompany(financials, target.sector, Boolean(filing));
      const narrative = buildNarrative(financials, scores, target.sector);
      companies.push({
        ticker: target.ticker,
        name: companyFacts?.entityName || mapping.title || target.ticker,
        cik,
        sector: target.sector,
        status: scores.dataCompleteness >= 70 ? 'operativo' : scores.dataCompleteness >= 40 ? 'parziale' : 'errore',
        observedAt: now.toISOString(),
        source: 'SEC EDGAR Company Facts',
        filing,
        financials,
        scores,
        decision: decisionFor(scores),
        thesis: narrative.thesis,
        risks: narrative.risks,
        warnings: scores.dataCompleteness < 70 ? ['Punteggio ridotto per dati fondamentali incompleti.'] : [],
      });
      liveSuccesses += 1;
    } catch (error) {
      const stale = previousByTicker.get(target.ticker);
      const message = error instanceof Error ? error.message : String(error);
      if (stale) {
        companies.push({ ...stale, status: 'parziale', warnings: [...new Set([...(stale.warnings || []), `Aggiornamento SEC fallito (${message}); mantenuti i dati precedenti.`])] });
      } else {
        warnings.push(`${target.ticker}: dati fondamentali non acquisiti (${message}).`);
      }
    }
    await sleep(450);
  }

  companies.sort((left, right) => right.scores.overall - left.scores.overall || right.scores.dataCompleteness - left.scores.dataCompleteness);
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
      detail: `${liveSuccesses}/${universe.length} società aggiornate dal vivo; copertura disponibile ${covered}/${universe.length}.`,
      ...(liveSuccesses ? { lastSuccessAt: now.toISOString() } : {}),
    },
    universeSize: universe.length,
    companyCount: companies.length,
    coveragePercent,
    averageScore,
    methodology: [
      'Bilanci annuali 10-K, 20-F e 40-F pubblicati su SEC EDGAR.',
      'Crescita dei ricavi, margini, free cash flow, cassa, debito e patrimonio netto.',
      'Valutazione indicativa tramite P/E quando prezzo ed EPS risultano confrontabili.',
      'Penalizzazione automatica per dati mancanti, società pre-profitto e valutazioni estreme.',
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
    priorityCompanies: companies.filter((company) => company.decision === 'PRIORITÀ' || company.decision === 'APPROFONDISCI').slice(0, 8).map((company) => company.ticker),
  };
  if (liveSuccesses) {
    snapshot.warnings = snapshot.warnings.filter((warning) => !String(warning).startsWith('SEC EDGAR non disponibile'));
  }
  if (coveragePercent < 70) snapshot.warnings.push('Ricerca fondamentale ancora parziale: le decisioni forti richiedono maggiore copertura SEC.');
  snapshot.warnings = [...new Set(snapshot.warnings)].slice(0, 30);
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await writeFile(path.join(historyDir, `${now.toISOString().slice(0, 10)}.json`), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  console.log(`Fenice Fundamental Research: ${liveSuccesses}/${universe.length} live, coverage ${coveragePercent}%, average ${averageScore}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
