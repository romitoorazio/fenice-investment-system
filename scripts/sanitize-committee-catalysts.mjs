import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');

const STOP_TOKENS = new Set([
  'company', 'corporation', 'corp', 'incorporated', 'limited', 'holdings', 'holding',
  'group', 'plc', 'ag', 'nv', 'sa', 'se', 'ltd', 'class', 'common', 'stock',
  'technology', 'technologies', 'energy', 'financial', 'health', 'healthcare',
  'semiconductor', 'semiconductors', 'systems', 'international', 'global',
]);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalize = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export function freshnessScore(date, now = Date.now()) {
  if (!date) return 35;
  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return 30;
  const hours = Math.max(0, (now - timestamp) / 3_600_000);
  if (hours <= 24) return 100;
  if (hours <= 72) return 85;
  if (hours <= 168) return 65;
  return 35;
}

function distinctiveNameTokens(asset) {
  const symbol = normalize(asset?.symbol);
  return [...new Set(normalize(asset?.name)
    .split(/\s+/)
    .filter((token) => token.length >= 5 && token !== symbol && !STOP_TOKENS.has(token)))]
    .slice(0, 6);
}

export function catalystMatchesAsset(asset, discovery) {
  const symbol = normalize(asset?.symbol);
  const text = normalize(`${discovery?.name || ''} ${discovery?.signal || ''}`);
  if (!text || !symbol) return false;

  // A ticker is accepted only as a standalone token. This prevents substring matches.
  const tickerPattern = new RegExp(`(?:^|\\s)${escapeRegExp(symbol)}(?:$|\\s)`);
  if (tickerPattern.test(text)) return true;

  // Company-name matching requires two distinctive tokens. One generic industry word
  // (e.g. "semiconductor") must never be enough to attach evidence to a security.
  const tokens = distinctiveNameTokens(asset);
  if (tokens.length < 2) return false;
  const hits = tokens.filter((token) => new RegExp(`(?:^|\\s)${escapeRegExp(token)}(?:$|\\s)`).test(text));
  return hits.length >= 2;
}

export function matchCatalysts(asset, discoveries, now = Date.now()) {
  const matches = (discoveries || []).filter((item) => catalystMatchesAsset(asset, item));
  const recent = matches.filter((item) => freshnessScore(item.date, now) >= 65);
  const score = Math.max(0, Math.min(100, Math.round(48 + Math.min(28, recent.length * 7) + Math.min(10, matches.length * 2))));
  return {
    score,
    count: matches.length,
    recentCount: recent.length,
    evidence: recent.slice(0, 4).map((item) => `${item.name} · ${item.source}`),
  };
}

function conservativeDecision(item) {
  const score = Number(item.committeeScore || 0);
  const confidence = Number(item.confidence || 0);
  const risk = Number(item.riskScore || 100);
  const valuation = Number(item.scorecard?.valuation ?? 50);
  const terminalDecision = item.terminalDecision;
  const upside = Number(item.valuation?.upsideBasePercent);
  const dcfAvailable = item.valuation?.status === 'disponibile' && Number.isFinite(upside);
  const deepOvervaluation = dcfAvailable && upside < -25;

  if (confidence < 55 || risk >= 80) return 'EVITA';
  if (deepOvervaluation) return 'ATTENDI';
  if (score >= 78 && confidence >= 72 && risk <= 58 && valuation >= 55 && terminalDecision === 'ACCUMULA') return 'COMPRA';
  if (score >= 68 && confidence >= 65 && risk <= 68) return terminalDecision === 'EVITA' ? 'ATTENDI' : 'OSSERVA';
  return 'ATTENDI';
}

export function sanitizeCommittee(report, terminal, discoveries, now = Date.now()) {
  const assetBySymbol = new Map((terminal?.assets || []).map((asset) => [String(asset.symbol || '').toUpperCase(), asset]));
  const original = Array.isArray(report?.allDecisions) ? report.allDecisions : [];

  const allDecisions = original.map((item) => {
    const asset = assetBySymbol.get(String(item.symbol || '').toUpperCase()) || item;
    const safe = matchCatalysts(asset, discoveries, now);
    const oldCatalystScore = Number(item.scorecard?.catalysts ?? item.catalyst?.score ?? 48);
    const scoreDelta = (safe.score - oldCatalystScore) * 0.06;
    const committeeScore = Math.max(0, Math.min(100, Math.round(Number(item.committeeScore || 0) + scoreDelta)));
    const bullCase = (item.bullCase || []).filter((line) => !String(line).startsWith('Catalizzatori recenti verificati:'));
    if (safe.evidence.length) bullCase.push(`Catalizzatori recenti verificati: ${safe.evidence.join(' | ')}`);

    const updated = {
      ...item,
      committeeScore,
      scorecard: { ...item.scorecard, catalysts: safe.score },
      catalyst: {
        score: safe.score,
        matchedEvents: safe.count,
        recentEvents: safe.recentCount,
        evidence: safe.evidence,
        matcher: 'strict-entity-v2',
      },
      bullCase,
    };
    updated.decision = conservativeDecision(updated);
    if (updated.decision !== 'COMPRA') {
      updated.entryPlan = {
        ...updated.entryPlan,
        orderMode: 'NESSUN ORDINE',
        maxEntryPrice: null,
        firstTranchePercent: 0,
        firstTrancheEuro: 0,
      };
    }
    return updated;
  })
    .sort((a, b) => b.committeeScore - a.committeeScore || b.confidence - a.confidence || a.riskScore - b.riskScore)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const buyCandidates = allDecisions.filter((item) => item.decision === 'COMPRA');
  const sourceGate = report?.sourceGate || 'UNKNOWN';
  const dataQuality = Number(report?.dataQuality || 0);
  const executionGate = dataQuality < 65 || sourceGate === 'RED'
    ? 'BLOCCATO'
    : buyCandidates.length ? 'PRONTO_CON_CONFERMA' : 'ATTENDERE';
  const firstTrancheEuro = buyCandidates.reduce((sum, item) => sum + Number(item.entryPlan?.firstTrancheEuro || 0), 0);

  return {
    ...report,
    catalystMatcher: 'strict-entity-v2',
    executionGate,
    buyCandidateCount: buyCandidates.length,
    proposedFirstTrancheEuro: executionGate === 'PRONTO_CON_CONFERMA' ? Math.min(1500, firstTrancheEuro) : 0,
    topDecisions: allDecisions.slice(0, 12),
    allDecisions,
  };
}

async function main() {
  const committeePath = path.join(dataDir, 'investment-committee.json');
  const [report, terminal, snapshot] = await Promise.all([
    readFile(committeePath, 'utf8').then(JSON.parse),
    readFile(path.join(dataDir, 'terminal-intelligence.json'), 'utf8').then(JSON.parse),
    readFile(path.join(dataDir, 'latest-snapshot.json'), 'utf8').then(JSON.parse),
  ]);
  const sanitized = sanitizeCommittee(report, terminal, snapshot.discoveries || []);
  await writeFile(committeePath, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8');
  console.log(`Catalyst evidence sanitized with strict-entity-v2; BUY ${sanitized.buyCandidateCount}; gate ${sanitized.executionGate}.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
