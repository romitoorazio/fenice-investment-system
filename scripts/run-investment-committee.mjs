import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const historyDir = path.join(dataDir, 'committee-history');
const outputPath = path.join(dataDir, 'investment-committee.json');
const now = new Date();
const CAPITAL = 10_000;
const GOAL = 100_000;
const YEARS = 10;
const REQUIRED_CAGR = (Math.pow(GOAL / CAPITAL, 1 / YEARS) - 1) * 100;

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const round = (value, digits = 1) => {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

async function readJson(name, fallback) {
  try {
    return JSON.parse(await readFile(path.join(dataDir, name), 'utf8'));
  } catch {
    return fallback;
  }
}

function freshnessScore(date) {
  if (!date) return 35;
  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return 30;
  const hours = Math.max(0, (Date.now() - timestamp) / 3_600_000);
  if (hours <= 24) return 100;
  if (hours <= 72) return 85;
  if (hours <= 168) return 65;
  return 35;
}

function valuationScore(asset, dcf) {
  if (dcf?.status === 'disponibile' && Number.isFinite(dcf.upsideBasePercent)) {
    return Math.round(clamp(50 + dcf.upsideBasePercent * 0.8));
  }
  const relative = Number(asset?.valuation?.score);
  return Number.isFinite(relative) ? Math.round(clamp(relative)) : 50;
}

function catalystFor(asset, discoveries) {
  const symbol = String(asset.symbol || '').toLowerCase();
  const nameTokens = String(asset.name || '')
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length >= 5)
    .slice(0, 3);
  const matches = discoveries.filter((item) => {
    const text = `${item.name || ''} ${item.signal || ''}`.toLowerCase();
    return text.includes(symbol) || nameTokens.some((token) => text.includes(token));
  });
  const recent = matches.filter((item) => freshnessScore(item.date) >= 65);
  const score = Math.round(clamp(48 + Math.min(28, recent.length * 7) + Math.min(10, matches.length * 2)));
  return {
    score,
    count: matches.length,
    recentCount: recent.length,
    evidence: recent.slice(0, 4).map((item) => `${item.name} · ${item.source}`),
  };
}

function positionClass(asset, fundamental) {
  const stage = String(asset.businessStage || fundamental?.businessStage || '').toLowerCase();
  const assetClass = String(asset.assetClass || '').toLowerCase();
  if (/pre-commercial|pre-commerciale|specul/.test(stage) || /crypto/.test(assetClass)) return 'SPECULATIVA';
  if (/etf|obblig/.test(assetClass)) return 'CORE';
  const quality = Number(fundamental?.scores?.quality || asset.fundamentalScore || 0);
  const risk = Number(asset.riskScore || 100);
  if (quality >= 82 && risk <= 58) return 'CORE';
  return 'GROWTH';
}

function maxWeight(positionType, risk, confidence) {
  let base = positionType === 'CORE' ? 10 : positionType === 'GROWTH' ? 6 : 2.5;
  if (risk >= 65) base -= 1.5;
  if (confidence < 75) base -= 1;
  return round(Math.max(positionType === 'SPECULATIVA' ? 1 : 2, base), 1);
}

function decisionFor({ score, confidence, risk, valuation, terminalDecision, dcf }) {
  const deepOvervaluation = dcf?.status === 'disponibile' && Number(dcf.upsideBasePercent) < -25;
  if (confidence < 55 || risk >= 80) return 'EVITA';
  if (deepOvervaluation) return 'ATTENDI';
  if (score >= 78 && confidence >= 72 && risk <= 58 && valuation >= 55 && terminalDecision === 'ACCUMULA') return 'COMPRA';
  if (score >= 68 && confidence >= 65 && risk <= 68) return terminalDecision === 'EVITA' ? 'ATTENDI' : 'OSSERVA';
  return 'ATTENDI';
}

function entryPlan(asset, dcf, decision, positionType, maxWeightPercent) {
  const price = Number(asset.price);
  const fairValue = Number(dcf?.fairValueBase);
  const fairValueHigh = Number(dcf?.fairValueHigh);
  let maxEntryPrice = null;
  if (Number.isFinite(price) && decision === 'COMPRA') {
    if (Number.isFinite(fairValue) && fairValue > price) {
      maxEntryPrice = Math.min(price * 1.01, fairValue * 0.9);
    } else if (!Number.isFinite(fairValue)) {
      maxEntryPrice = price * 0.99;
    }
  }
  const trancheFraction = decision === 'COMPRA' ? (positionType === 'SPECULATIVA' ? 0.25 : 0.33) : 0;
  const tranchePercent = round(maxWeightPercent * trancheFraction, 2);
  return {
    orderMode: decision === 'COMPRA' ? 'LIMITE' : 'NESSUN ORDINE',
    maxEntryPrice: round(maxEntryPrice, 2),
    firstTranchePercent: tranchePercent,
    firstTrancheEuro: tranchePercent ? Math.round((CAPITAL * tranchePercent) / 100) : 0,
    fairValueBase: Number.isFinite(fairValue) ? fairValue : null,
    fairValueHigh: Number.isFinite(fairValueHigh) ? fairValueHigh : null,
  };
}

function buildCandidate(asset, fundamental, dcf, discoveries, dataQuality) {
  const fundamentalScore = Math.round(clamp(fundamental?.scores?.overall ?? asset.fundamentalScore ?? asset.unifiedScore ?? 50));
  const qualityScore = Math.round(clamp(fundamental?.scores?.quality ?? fundamentalScore));
  const technicalScore = Math.round(clamp(asset.technicalScore ?? asset.technical?.scores?.technical ?? 50));
  const risk = Math.round(clamp(asset.riskScore ?? 60));
  const riskAdjusted = 100 - risk;
  const valuation = valuationScore(asset, dcf);
  const catalyst = catalystFor(asset, discoveries);
  const fresh = freshnessScore(asset.technical?.observedAt ?? asset.observedAt);
  const sourceConfidence = Math.round(clamp((asset.confidence ?? dataQuality) * 0.55 + dataQuality * 0.25 + fresh * 0.2));
  const contradictionPenalty = dcf?.status === 'disponibile' && Number(dcf.upsideBasePercent) < -20 ? Math.min(20, Math.abs(Number(dcf.upsideBasePercent)) * 0.25) : 0;
  const committeeScore = Math.round(clamp(
    fundamentalScore * 0.24 +
    qualityScore * 0.14 +
    valuation * 0.2 +
    technicalScore * 0.12 +
    riskAdjusted * 0.14 +
    catalyst.score * 0.06 +
    sourceConfidence * 0.1 -
    contradictionPenalty,
  ));
  const positionType = positionClass(asset, fundamental);
  const maxWeightPercent = maxWeight(positionType, risk, sourceConfidence);
  const decision = decisionFor({
    score: committeeScore,
    confidence: sourceConfidence,
    risk,
    valuation,
    terminalDecision: asset.decision,
    dcf,
  });
  const entry = entryPlan(asset, dcf, decision, positionType, maxWeightPercent);
  const valuationConflict = dcf?.status === 'disponibile' && Number(dcf.upsideBasePercent) < -20;

  const bullCase = [
    ...(fundamental?.thesis || []).slice(0, 3),
    ...(catalyst.evidence.length ? [`Catalizzatori recenti verificati: ${catalyst.evidence.join(' | ')}`] : []),
    Number.isFinite(dcf?.fairValueHigh) ? `Scenario DCF espansivo: ${round(dcf.fairValueHigh, 2)} ${dcf.currency || asset.currency || ''}.` : null,
  ].filter(Boolean);

  const bearCase = [
    ...(fundamental?.risks || []).slice(0, 3),
    ...(valuationConflict ? [`DCF base indica ${round(dcf.upsideBasePercent, 1)}% rispetto al prezzo corrente: rischio di valutazione elevato.`] : []),
    ...(risk >= 65 ? [`Rischio quantitativo elevato (${risk}/100).`] : []),
    ...(asset.warnings || []).slice(0, 2),
  ].filter(Boolean);

  const invalidation = [
    'Deterioramento strutturale dei fondamentali o revisione significativa della crescita attesa.',
    risk >= 65 ? 'Aumento ulteriore di volatilità/drawdown oltre i guardrail Fenice.' : 'Rottura persistente del profilo rischio/rendimento rispetto alle alternative globali.',
    valuationConflict ? 'Nessun ingresso finché il margine di sicurezza di valutazione non migliora.' : 'Riduzione del vantaggio di valutazione o comparsa di un’alternativa con score nettamente superiore.',
  ];

  return {
    rank: 0,
    symbol: asset.symbol,
    name: asset.name,
    assetClass: asset.assetClass,
    sector: fundamental?.sector || asset.sector || asset.assetClass,
    positionType,
    currentPrice: Number.isFinite(Number(asset.price)) ? Number(asset.price) : null,
    currency: asset.currency || dcf?.currency || fundamental?.financials?.currency || null,
    decision,
    committeeScore,
    confidence: sourceConfidence,
    riskScore: risk,
    terminalDecision: asset.decision,
    maxWeightPercent,
    scorecard: {
      fundamental: fundamentalScore,
      quality: qualityScore,
      valuation,
      technical: technicalScore,
      riskAdjusted,
      catalysts: catalyst.score,
      dataConfidence: sourceConfidence,
    },
    valuation: {
      status: dcf?.status || asset.valuation?.status || 'non disponibile',
      fairValueLow: Number.isFinite(Number(dcf?.fairValueLow)) ? Number(dcf.fairValueLow) : null,
      fairValueBase: Number.isFinite(Number(dcf?.fairValueBase)) ? Number(dcf.fairValueBase) : null,
      fairValueHigh: Number.isFinite(Number(dcf?.fairValueHigh)) ? Number(dcf.fairValueHigh) : null,
      upsideBasePercent: Number.isFinite(Number(dcf?.upsideBasePercent)) ? Number(dcf.upsideBasePercent) : null,
      confidence: Number.isFinite(Number(dcf?.confidence)) ? Number(dcf.confidence) : null,
    },
    catalyst: {
      score: catalyst.score,
      matchedEvents: catalyst.count,
      recentEvents: catalyst.recentCount,
      evidence: catalyst.evidence,
    },
    entryPlan: entry,
    bullCase,
    bearCase,
    invalidation,
    reviewTriggers: [
      'Trimestrale, guidance o filing societario rilevante.',
      'Shock macro/geopolitico che modifica tassi, energia o premio per il rischio.',
      'Movimento prezzo >8% o variazione Fenice Score >8 punti.',
    ],
  };
}

const terminal = await readJson('terminal-intelligence.json', { assets: [], dataQuality: 0, marketRegime: 'ATTENDERE' });
const fundamentals = await readJson('fundamental-research.json', { companies: [] });
const dcf = await readJson('dcf-analysis.json', { companies: [] });
const snapshot = await readJson('latest-snapshot.json', { discoveries: [], warnings: [] });
const sourceHealth = await readJson('global-source-health.json', { qualityScore: null, gate: 'UNKNOWN' });

const fundamentalBySymbol = new Map((fundamentals.companies || []).map((item) => [String(item.ticker).toUpperCase(), item]));
const dcfBySymbol = new Map((dcf.companies || []).map((item) => [String(item.symbol).toUpperCase(), item]));
const dataQuality = Math.round(clamp(
  Number.isFinite(Number(sourceHealth.qualityScore))
    ? Number(terminal.dataQuality || 0) * 0.65 + Number(sourceHealth.qualityScore) * 0.35
    : Number(terminal.dataQuality || 0),
));

const candidates = (terminal.assets || [])
  .map((asset) => buildCandidate(
    asset,
    fundamentalBySymbol.get(String(asset.symbol).toUpperCase()),
    dcfBySymbol.get(String(asset.symbol).toUpperCase()),
    snapshot.discoveries || [],
    dataQuality,
  ))
  .sort((a, b) => b.committeeScore - a.committeeScore || b.confidence - a.confidence || a.riskScore - b.riskScore)
  .map((item, index) => ({ ...item, rank: index + 1 }));

const buyCandidates = candidates.filter((item) => item.decision === 'COMPRA');
const firstTrancheEuro = buyCandidates.reduce((sum, item) => sum + Number(item.entryPlan.firstTrancheEuro || 0), 0);
const sourceGate = sourceHealth.gate || sourceHealth.institutionalGate || 'UNKNOWN';
const executionGate = dataQuality < 65 || sourceGate === 'RED' ? 'BLOCCATO' : buyCandidates.length ? 'PRONTO_CON_CONFERMA' : 'ATTENDERE';

const report = {
  version: 1,
  generatedAt: now.toISOString(),
  engine: 'Fenice Investment Committee v1',
  capitalEuro: CAPITAL,
  goal: {
    targetEuro: GOAL,
    horizonYears: YEARS,
    requiredCagrPercent: round(REQUIRED_CAGR, 2),
    warning: 'Target ambizioso, non garantito. Non aumenta automaticamente la tolleranza al rischio.',
  },
  marketRegime: terminal.marketRegime || 'ATTENDERE',
  dataQuality,
  sourceGate,
  executionGate,
  candidateCount: candidates.length,
  buyCandidateCount: buyCandidates.length,
  proposedFirstTrancheEuro: executionGate === 'PRONTO_CON_CONFERMA' ? Math.min(Math.round(CAPITAL * 0.15), firstTrancheEuro) : 0,
  committeeRules: [
    'Nessun BUY con confidenza dati insufficiente o source gate RED.',
    'Il DCF profondamente sotto il prezzo blocca il BUY anche se trend e qualità sono forti.',
    'Ogni BUY deve avere peso massimo, prima tranche, tesi contraria e condizioni di invalidazione.',
    'Le posizioni speculative restano piccole anche quando il potenziale teorico è elevato.',
    'Fenice confronta ogni candidato con le alternative globali e può decidere di investire zero euro.',
    'Nessun ordine viene trasmesso automaticamente al broker.',
  ],
  topDecisions: candidates.slice(0, 12),
  allDecisions: candidates,
  warnings: [
    ...(snapshot.warnings || []).slice(0, 6),
    ...(dcf.coveragePercent < 70 ? [`Copertura DCF ancora limitata al ${dcf.coveragePercent || 0}%.`] : []),
    ...(sourceGate !== 'GREEN' ? [`Institutional Source Gate: ${sourceGate}.`] : []),
    ...(dataQuality < 75 ? [`Qualità dati Investment Committee ${dataQuality}/100: mantenere prudenza.`] : []),
  ],
};

await mkdir(historyDir, { recursive: true });
const serialized = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(outputPath, serialized, 'utf8');
await writeFile(path.join(historyDir, `${now.toISOString().replaceAll(':', '-')}.json`), serialized, 'utf8');
console.log(`Fenice Investment Committee: ${candidates.length} candidati, BUY ${buyCandidates.length}, gate ${executionGate}, qualità ${dataQuality}.`);
