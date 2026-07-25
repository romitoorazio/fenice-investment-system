import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.join(root, 'data', 'latest-snapshot.json');
const now = new Date();
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function run(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', file)], {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${file} exited with ${code}`)));
  });
}

async function fetchText(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/plain,*/*',
        'user-agent': 'FeniceInvestmentSystem/2.0 romitoorazio@gmail.com',
      },
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 120)}`);
    return { text, type: response.headers.get('content-type') || '' };
  } finally {
    clearTimeout(timer);
  }
}

async function gdelt(query, mode = 'ArtList') {
  const endpoints = [
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=${mode}&maxrecords=50&format=json&sort=HybridRel`,
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=${mode}&maxrecords=30&format=json`,
  ];
  let lastError;
  for (const url of endpoints) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const { text } = await fetchText(url);
        const trimmed = text.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
          throw new Error(`risposta non JSON: ${trimmed.slice(0, 100)}`);
        }
        return JSON.parse(trimmed);
      } catch (error) {
        lastError = error;
        await sleep(1800 * attempt);
      }
    }
  }
  throw lastError;
}

function parseStooq(csv) {
  const [header, row] = csv.trim().split(/\r?\n/);
  if (!header || !row || /N\/D/i.test(row)) return null;
  const keys = header.split(',');
  const values = row.split(',');
  return Object.fromEntries(keys.map((key, index) => [key, values[index]]));
}

const traditionalUniverse = [
  ['spy.us', 'SPY', 'S&P 500 ETF', 'ETF'],
  ['qqq.us', 'QQQ', 'Nasdaq 100 ETF', 'ETF'],
  ['iwm.us', 'IWM', 'Russell 2000 ETF', 'ETF'],
  ['gld.us', 'GLD', 'Oro ETF', 'Materie prime'],
  ['tlt.us', 'TLT', 'Treasury 20+ Year ETF', 'Obbligazioni'],
  ['aapl.us', 'AAPL', 'Apple', 'Azioni'],
  ['msft.us', 'MSFT', 'Microsoft', 'Azioni'],
  ['nvda.us', 'NVDA', 'NVIDIA', 'Azioni'],
  ['googl.us', 'GOOGL', 'Alphabet', 'Azioni'],
  ['amzn.us', 'AMZN', 'Amazon', 'Azioni'],
  ['meta.us', 'META', 'Meta Platforms', 'Azioni'],
  ['tsm.us', 'TSM', 'Taiwan Semiconductor', 'Semiconduttori'],
  ['asml.us', 'ASML', 'ASML Holding', 'Semiconduttori'],
  ['crsp.us', 'CRSP', 'CRISPR Therapeutics', 'Biotech'],
  ['rxrx.us', 'RXRX', 'Recursion Pharmaceuticals', 'AI Biotech'],
  ['ntla.us', 'NTLA', 'Intellia Therapeutics', 'Biotech'],
];

async function traditionalFallback() {
  const out = [];
  for (const [code, symbol, name, assetClass] of traditionalUniverse) {
    try {
      const { text } = await fetchText(`https://stooq.com/q/l/?s=${code}&f=sd2t2ohlcv&h&e=csv`);
      const row = parseStooq(text);
      const price = Number(row?.Close);
      const open = Number(row?.Open);
      if (!Number.isFinite(price)) continue;
      const changePercent = Number.isFinite(open) && open > 0 ? ((price - open) / open) * 100 : 0;
      const thematicBonus = ['Semiconduttori', 'AI Biotech', 'Biotech'].includes(assetClass) ? 4 : 0;
      const riskBase = assetClass === 'Biotech' || assetClass === 'AI Biotech' ? 68 : assetClass === 'Azioni' || assetClass === 'Semiconduttori' ? 54 : 45;
      out.push({
        symbol,
        name,
        assetClass,
        market: 'USA',
        price,
        currency: 'USD',
        changePercent: Math.round(changePercent * 100) / 100,
        source: 'Stooq public fallback',
        observedAt: row.Date,
        score: Math.round(clamp(54 + changePercent * 2.2 + thematicBonus, 25, 78)),
        risk: Math.round(clamp(riskBase + Math.abs(changePercent) * 2.5, 30, 88)),
      });
    } catch {
      // Un singolo simbolo non deve interrompere l'intera raccolta.
    }
  }
  return out;
}

const stableSymbols = new Set(['USDT', 'USDC', 'DAI', 'USDE', 'USDS', 'USD1', 'USDG', 'USYC', 'PYUSD', 'FDUSD', 'TUSD', 'USDP', 'RLUSD', 'EURC', 'EURT']);

function normalizeRanking(markets) {
  const bySymbol = new Map();
  for (const item of markets) {
    const symbol = String(item.symbol || '').toUpperCase();
    if (!symbol) continue;
    const name = String(item.name || '').toLowerCase();
    const stable = stableSymbols.has(symbol) || /stablecoin|global dollar|paypal usd/.test(name);
    const normalized = stable
      ? { ...item, classification: 'stablecoin', score: 20, risk: Math.max(40, Number(item.risk) || 40) }
      : { ...item, score: Math.round(clamp(item.score)), risk: Math.round(clamp(item.risk)) };
    const existing = bySymbol.get(symbol);
    const preferred = !existing || (existing.source === 'Stooq public fallback' && normalized.source !== 'Stooq public fallback') || normalized.score > existing.score;
    if (preferred) bySymbol.set(symbol, normalized);
  }
  return [...bySymbol.values()].sort((a, b) => {
    if (a.classification === 'stablecoin' && b.classification !== 'stablecoin') return 1;
    if (b.classification === 'stablecoin' && a.classification !== 'stablecoin') return -1;
    return b.score - a.score;
  });
}

function recalculateReliability(snapshot) {
  const providerWeights = {
    operativo: 1,
    parziale: 0.55,
    errore: 0,
    'non configurato': 0,
  };
  const providers = snapshot.providers || [];
  const providerScore = providers.length
    ? providers.reduce((sum, item) => sum + (providerWeights[item.state] ?? 0.15), 0) / providers.length
    : 0;
  const traditional = snapshot.markets.filter(item => item.assetClass !== 'Criptovaluta').length;
  const crypto = snapshot.markets.filter(item => item.assetClass === 'Criptovaluta' && item.classification !== 'stablecoin').length;
  const macro = (snapshot.macro || []).length;
  const diversityScore = clamp(traditional * 2.2 + crypto * 0.6 + macro * 3, 0, 100) / 100;
  const generatedAgeMinutes = Math.max(0, (Date.now() - new Date(snapshot.generatedAt || 0).getTime()) / 60000);
  const freshnessScore = generatedAgeMinutes <= 90 ? 1 : generatedAgeMinutes <= 360 ? 0.8 : generatedAgeMinutes <= 1440 ? 0.55 : 0.2;
  const quality = Math.round(clamp((providerScore * 0.5 + diversityScore * 0.3 + freshnessScore * 0.2) * 100));

  snapshot.pulse = snapshot.pulse || {};
  snapshot.pulse.confidence = quality;
  snapshot.dataQuality = quality;
  snapshot.freshness = {
    generatedAt: snapshot.generatedAt,
    ageMinutes: Math.round(generatedAgeMinutes),
    status: generatedAgeMinutes <= 90 ? 'near-real-time' : generatedAgeMinutes <= 360 ? 'aggiornato' : 'stale',
  };
  snapshot.mode = quality >= 75 ? 'live' : quality >= 50 ? 'partial' : 'bootstrap';
}

await run('run-knowledge-engine.mjs');
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
snapshot.providers = Array.isArray(snapshot.providers) ? snapshot.providers : [];
snapshot.markets = Array.isArray(snapshot.markets) ? snapshot.markets : [];
snapshot.discoveries = Array.isArray(snapshot.discoveries) ? snapshot.discoveries : [];
snapshot.warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings : [];

try {
  const data = await gdelt('(IPO OR funding OR acquisition OR "FDA approval" OR quantum OR fusion OR CRISPR OR sanctions OR tariffs OR cyberattack)');
  const articles = Array.isArray(data?.articles) ? data.articles.slice(0, 40) : [];
  for (const [index, article] of articles.entries()) {
    snapshot.discoveries.unshift({
      id: `gdelt-recovery-${index}-${article.seendate || Date.now()}`,
      name: article.title,
      category: 'NEWS',
      signal: `Evento globale rilevato da ${article.domain || 'GDELT'}.`,
      score: 60,
      risk: 65,
      date: article.seendate,
      source: `GDELT · ${article.domain || 'global'}`,
      url: article.url,
    });
  }
  const existing = snapshot.providers.find(item => item.name === 'GDELT');
  const value = {
    id: 'gdelt',
    name: 'GDELT',
    state: articles.length ? 'operativo' : 'parziale',
    coverage: ['notizie globali', 'geopolitica', 'società emergenti'],
    detail: `Recovery layer: ${articles.length} articoli acquisiti.`,
    ...(articles.length ? { lastSuccessAt: now.toISOString() } : {}),
  };
  if (existing) Object.assign(existing, value); else snapshot.providers.push(value);
  snapshot.warnings = snapshot.warnings.filter(item => !String(item).startsWith('GDELT'));
} catch (error) {
  snapshot.warnings.push(`GDELT recovery fallito: ${error instanceof Error ? error.message : String(error)}`);
}

const fallback = await traditionalFallback();
snapshot.markets.push(...fallback);
const existingStooq = snapshot.providers.find(item => item.id === 'stooq-recovery');
const stooqProvider = {
  id: 'stooq-recovery',
  name: 'Stooq public fallback',
  state: fallback.length >= 10 ? 'operativo' : fallback.length ? 'parziale' : 'errore',
  coverage: ['azioni', 'ETF', 'obbligazioni', 'materie prime', 'semiconduttori', 'biotech'],
  detail: `${fallback.length}/${traditionalUniverse.length} strumenti tradizionali acquisiti senza chiave.`,
  ...(fallback.length ? { lastSuccessAt: now.toISOString() } : {}),
};
if (existingStooq) Object.assign(existingStooq, stooqProvider); else snapshot.providers.push(stooqProvider);

snapshot.markets = normalizeRanking(snapshot.markets);
snapshot.discoveries = snapshot.discoveries
  .filter((item, index, array) => array.findIndex(other => (other.id || `${other.category}:${other.name}`) === (item.id || `${item.category}:${item.name}`)) === index)
  .slice(0, 300);
snapshot.warnings = [...new Set(snapshot.warnings)].filter(item => !String(item).includes('solo crypto'));
snapshot.reportVersion = Math.max(Number(snapshot.reportVersion || snapshot.version || 0) + 1, 20);
snapshot.reliability = {
  generatedAt: now.toISOString(),
  alphaSecretConfigured: Boolean(process.env.ALPHA_VANTAGE_API_KEY),
  fredSecretConfigured: Boolean(process.env.FRED_API_KEY),
  traditionalMarkets: snapshot.markets.filter(item => item.assetClass !== 'Criptovaluta').length,
  cryptoMarkets: snapshot.markets.filter(item => item.assetClass === 'Criptovaluta' && item.classification !== 'stablecoin').length,
  stablecoinsExcludedFromRanking: snapshot.markets.filter(item => item.classification === 'stablecoin').length,
  totalMarkets: snapshot.markets.length,
  cadence: 'hourly',
};
recalculateReliability(snapshot);
snapshot.headline = `${snapshot.markets.length} strumenti, ${snapshot.discoveries.length} segnali emergenti, ${(snapshot.macro || []).length} indicatori macro e ${snapshot.providers.filter(item => item.state === 'operativo').length} fonti operative.`;
await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n');
console.log('Fenice reliability layer v2 completed', snapshot.reliability, `quality=${snapshot.dataQuality}`);
