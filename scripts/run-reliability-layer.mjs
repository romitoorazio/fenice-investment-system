import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const snapshotPath = path.join(root, 'data', 'latest-snapshot.json');

function run(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts', file)], { cwd: root, env: process.env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${file} exited with ${code}`)));
  });
}

async function fetchText(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json,text/plain,*/*', 'user-agent': 'FeniceInvestmentSystem/1.2' } });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0,120)}`);
    return { text, type: response.headers.get('content-type') || '' };
  } finally { clearTimeout(timer); }
}

async function gdelt(query, mode = 'ArtList') {
  const endpoints = [
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=${mode}&maxrecords=50&format=json&sort=HybridRel`,
    `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=${mode}&maxrecords=30&format=json`
  ];
  let last;
  for (const url of endpoints) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const { text } = await fetchText(url);
        const trimmed = text.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) throw new Error(`risposta non JSON: ${trimmed.slice(0,100)}`);
        return JSON.parse(trimmed);
      } catch (error) {
        last = error;
        await new Promise(r => setTimeout(r, 900 * attempt));
      }
    }
  }
  throw last;
}

function parseStooq(csv) {
  const [header, row] = csv.trim().split(/\r?\n/);
  if (!header || !row || /N\/D/i.test(row)) return null;
  const keys = header.split(',');
  const values = row.split(',');
  return Object.fromEntries(keys.map((k,i) => [k, values[i]]));
}

async function traditionalFallback() {
  const symbols = [
    ['spy.us','SPY','S&P 500 ETF','ETF'], ['qqq.us','QQQ','Nasdaq 100 ETF','ETF'],
    ['iwm.us','IWM','Russell 2000 ETF','ETF'], ['gld.us','GLD','Gold ETF','Materie prime'],
    ['tlt.us','TLT','Treasury 20+ Year ETF','Obbligazioni'], ['aapl.us','AAPL','Apple','Azioni'],
    ['msft.us','MSFT','Microsoft','Azioni'], ['nvda.us','NVDA','NVIDIA','Azioni']
  ];
  const out = [];
  for (const [code,symbol,name,assetClass] of symbols) {
    try {
      const { text } = await fetchText(`https://stooq.com/q/l/?s=${code}&f=sd2t2ohlcv&h&e=csv`);
      const r = parseStooq(text);
      const price = Number(r?.Close);
      if (Number.isFinite(price)) out.push({ symbol, name, assetClass, market:'USA', price, currency:'USD', source:'Stooq fallback', observedAt:r.Date, score:55, risk:50 });
    } catch {}
  }
  return out;
}

await run('run-knowledge-engine.mjs');
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
snapshot.providers = Array.isArray(snapshot.providers) ? snapshot.providers : [];
snapshot.markets = Array.isArray(snapshot.markets) ? snapshot.markets : [];
snapshot.discoveries = Array.isArray(snapshot.discoveries) ? snapshot.discoveries : [];
snapshot.warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings : [];

try {
  const data = await gdelt('(IPO OR funding OR acquisition OR "FDA approval" OR quantum OR fusion OR CRISPR OR sanctions OR tariffs OR cyberattack)');
  const articles = Array.isArray(data?.articles) ? data.articles.slice(0,40) : [];
  for (const [i,a] of articles.entries()) snapshot.discoveries.unshift({ id:`gdelt-recovery-${i}-${a.seendate||Date.now()}`, name:a.title, category:'NEWS', signal:`Evento globale rilevato da ${a.domain||'GDELT'}.`, score:60, risk:65, date:a.seendate, source:`GDELT · ${a.domain||'global'}`, url:a.url });
  const p = snapshot.providers.find(x => x.name === 'GDELT');
  const value = { id:'gdelt', name:'GDELT', state:articles.length?'operativo':'parziale', coverage:['notizie globali','geopolitica','società emergenti'], detail:`Recovery layer: ${articles.length} articoli acquisiti.`, lastSuccessAt:new Date().toISOString() };
  if (p) Object.assign(p,value); else snapshot.providers.push(value);
  snapshot.warnings = snapshot.warnings.filter(x => !String(x).startsWith('GDELT'));
} catch (error) {
  snapshot.warnings.push(`GDELT recovery fallito: ${error.message}`);
}

const hasTraditional = snapshot.markets.some(x => x.assetClass !== 'Criptovaluta');
if (!hasTraditional) {
  const fallback = await traditionalFallback();
  snapshot.markets.push(...fallback);
  snapshot.providers.push({ id:'stooq-recovery', name:'Stooq public fallback', state:fallback.length?'operativo':'errore', coverage:['azioni','ETF','obbligazioni','materie prime'], detail:`${fallback.length} strumenti tradizionali acquisiti senza chiave.`, ...(fallback.length?{lastSuccessAt:new Date().toISOString()}:{}) });
  if (fallback.length) snapshot.warnings = snapshot.warnings.filter(x => !String(x).includes('solo crypto'));
}

snapshot.discoveries = snapshot.discoveries.filter((x,i,a) => a.findIndex(y => (y.id||`${y.category}:${y.name}`)===(x.id||`${x.category}:${x.name}`))===i).slice(0,300);
snapshot.reportVersion = Math.max(Number(snapshot.reportVersion||snapshot.version||0)+1, 16);
snapshot.reliability = { generatedAt:new Date().toISOString(), alphaSecretConfigured:Boolean(process.env.ALPHA_VANTAGE_API_KEY), fredSecretConfigured:Boolean(process.env.FRED_API_KEY), traditionalMarkets:snapshot.markets.filter(x=>x.assetClass!=='Criptovaluta').length, totalMarkets:snapshot.markets.length };
snapshot.headline = `${snapshot.markets.length} strumenti, ${snapshot.discoveries.length} segnali emergenti, ${(snapshot.macro||[]).length} indicatori macro e ${snapshot.providers.length} fonti controllate.`;
await writeFile(snapshotPath, JSON.stringify(snapshot,null,2)+'\n');
console.log('Fenice reliability layer completed', snapshot.reliability);
