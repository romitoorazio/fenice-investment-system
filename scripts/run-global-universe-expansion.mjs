import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const reportPath = path.join(dataDir, 'terminal-intelligence.json');
const universePath = path.join(dataDir, 'global-universe.json');
const now = new Date();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp = (v, min = 0, max = 100) => Math.min(max, Math.max(min, Number(v) || 0));
const round = (v, d = 1) => Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : undefined;
const avg = (v) => v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
const stdev = (v) => { if (v.length < 2) return 0; const m = avg(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)); };

async function fetchJson(url) {
  let error;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 FeniceGlobalScanner/1.0' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (e) {
      error = e;
      if (attempt < 3) await sleep(800 * attempt);
    } finally { clearTimeout(timer); }
  }
  throw error;
}

function ma(values, period) { return values.length >= period ? avg(values.slice(-period)) : undefined; }
function ret(values, days) { return values.length > days ? ((values.at(-1) / values.at(-(days + 1))) - 1) * 100 : undefined; }
function drawdown(values) { let peak = values[0] || 1; let worst = 0; for (const v of values) { peak = Math.max(peak, v); worst = Math.min(worst, v / peak - 1); } return worst * 100; }
function volatility(values) { const selected = values.slice(-61); const returns = []; for (let i = 1; i < selected.length; i += 1) returns.push(Math.log(selected[i] / selected[i - 1])); return stdev(returns) * Math.sqrt(252) * 100; }

function baseRisk(assetClass) {
  if (assetClass === 'ETF') return 22;
  if (assetClass === 'Obbligazioni') return 18;
  if (assetClass === 'Materie prime') return 30;
  if (/Biotech/.test(assetClass)) return 48;
  if (/Semiconduttori/.test(assetClass)) return 38;
  return 32;
}

async function scan(def) {
  const encoded = encodeURIComponent(def.symbol);
  let payload;
  let host = 'query1.finance.yahoo.com';
  try { payload = await fetchJson(`https://${host}/v8/finance/chart/${encoded}?interval=1d&range=2y&includeAdjustedClose=true`); }
  catch { host = 'query2.finance.yahoo.com'; payload = await fetchJson(`https://${host}/v8/finance/chart/${encoded}?interval=1d&range=2y&includeAdjustedClose=true`); }
  const result = payload?.chart?.result?.[0];
  if (!result) throw new Error('Storico vuoto');
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose || quote.close || [];
  const rows = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const close = Number(adjusted[i] ?? quote.close?.[i]);
    if (Number.isFinite(close) && close > 0) rows.push({ timestamp: timestamps[i], close });
  }
  if (rows.length < 220) throw new Error(`Storico insufficiente ${rows.length}`);
  const closes = rows.map((r) => r.close);
  const price = closes.at(-1);
  const sma20 = ma(closes, 20), sma50 = ma(closes, 50), sma200 = ma(closes, 200);
  const oneMonth = ret(closes, 21), threeMonth = ret(closes, 63), sixMonth = ret(closes, 126), oneYear = ret(closes, 252);
  const vol = volatility(closes), maxDd = drawdown(closes.slice(-252));
  let trend = 50 + (price > sma20 ? 8 : -8) + (price > sma50 ? 12 : -12) + (price > sma200 ? 18 : -18) + (sma50 > sma200 ? 12 : -12);
  trend = Math.round(clamp(trend));
  const momentum = Math.round(clamp(50 + clamp(oneMonth, -20, 20) * .7 + clamp(threeMonth, -35, 35) * .35 + clamp(sixMonth, -60, 60) * .2));
  const risk = Math.round(clamp(baseRisk(def.assetClass) + clamp(vol, 0, 120) * .42 + Math.abs(clamp(maxDd, -80, 0)) * .28));
  const technicalScore = Math.round(clamp(trend * .45 + momentum * .35 + (100 - risk) * .2));
  const signal = risk >= 82 || technicalScore < 35 ? 'NEGATIVO' : technicalScore >= 72 && risk <= 58 ? 'FORTE' : technicalScore >= 60 && risk <= 70 ? 'POSITIVO' : technicalScore >= 48 ? 'NEUTRALE' : 'DEBOLE';
  const unifiedScore = Math.round(clamp(technicalScore * .65 + (100 - risk) * .25 + 7));
  const decision = unifiedScore >= 72 && risk <= 58 && ['FORTE','POSITIVO'].includes(signal) ? 'ACCUMULA' : unifiedScore >= 63 && risk <= 72 ? 'MANTIENI' : unifiedScore >= 48 ? 'ATTENDI' : 'EVITA';
  const observedAt = new Date(rows.at(-1).timestamp * 1000).toISOString();
  return {
    symbol: def.symbol, name: def.name, assetClass: def.assetClass, region: def.region, sector: def.sector,
    themes: def.themes || [], price: round(price, price < 1 ? 6 : 2), currency: result.meta?.currency || 'USD',
    technicalScore, riskScore: risk, dataCompleteness: 100, unifiedScore, confidence: 85, decision,
    reason: 'Candidato del radar globale valutato con trend, momentum, volatilità e drawdown; nessun ordine automatico.',
    targetWeightPercent: 0, targetAmountEuro: 0,
    valuation: { status: 'non applicabile', method: 'Scanner globale tecnico; valutazione fondamentale separata quando disponibile.', score: 50, confidence: 70, warnings: ['Nessun BUY deve dipendere dal solo scanner tecnico.'] },
    technical: {
      symbol: def.symbol, yahooSymbol: def.symbol, name: def.name, assetClass: def.assetClass, market: def.region || def.market || 'Global', currency: result.meta?.currency || 'USD',
      observedAt, source: `Yahoo Finance chart (${host})`, status: 'operativo', price: round(price, price < 1 ? 6 : 2),
      returns: { oneMonthPercent: round(oneMonth), threeMonthPercent: round(threeMonth), sixMonthPercent: round(sixMonth), oneYearPercent: round(oneYear) },
      indicators: { sma20: round(sma20,2), sma50: round(sma50,2), sma200: round(sma200,2), volatility20Percent: round(vol), maxDrawdown1YPercent: round(maxDd) },
      scores: { trend, momentum, risk, technical: technicalScore, dataCompleteness: 100 }, signal,
      reasons: [`Trend ${trend}/100, momentum ${momentum}/100, rischio ${risk}/100.`, `Rendimento 6 mesi ${round(sixMonth)}%, drawdown 1Y ${round(maxDd)}%.`],
      warnings: [], strategies: []
    },
    warnings: ['Scanner globale: richiede conferma fondamentale/valutativa prima di qualsiasi COMPRA.']
  };
}

const report = JSON.parse(await readFile(reportPath, 'utf8'));
const universe = JSON.parse(await readFile(universePath, 'utf8'));
const existing = new Set((report.assets || []).map((a) => String(a.symbol).toUpperCase()));
const pending = (universe.instruments || []).filter((d) => !existing.has(String(d.symbol).toUpperCase()));
const additions = [];
const failures = [];
for (let i = 0; i < pending.length; i += 4) {
  const batch = pending.slice(i, i + 4);
  const results = await Promise.allSettled(batch.map(scan));
  results.forEach((r, idx) => r.status === 'fulfilled' ? additions.push(r.value) : failures.push(`${batch[idx].symbol}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`));
  if (i + 4 < pending.length) await sleep(450);
}
report.assets = [...(report.assets || []), ...additions].sort((a,b) => Number(b.unifiedScore || 0) - Number(a.unifiedScore || 0));
report.universeSize = (report.assets || []).length + failures.length;
report.assetCount = report.assets.length;
report.coveragePercent = report.universeSize ? Math.round(report.assetCount / report.universeSize * 100) : 0;
report.globalCoverage = {
  configured: (universe.instruments || []).length,
  addedThisCycle: additions.length,
  failedThisCycle: failures.length,
  regions: [...new Set(report.assets.map((a) => a.region || a.technical?.market).filter(Boolean))],
  sectors: [...new Set(report.assets.map((a) => a.sector).filter(Boolean))],
  note: 'Universo globale di ricerca; inclusione non equivale a raccomandazione.'
};
if (failures.length) report.warnings = [...new Set([...(report.warnings || []), `Scanner globale: ${failures.length} strumenti non aggiornati (${failures.slice(0,5).join('; ')}).`])];
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Global universe expansion: +${additions.length}, failures ${failures.length}, total ${report.assetCount}, regions ${report.globalCoverage.regions.length}, sectors ${report.globalCoverage.sectors.length}.`);
