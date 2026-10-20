import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { retainDecisionLedgerRecords } from '../lib/intelligence/decision-ledger-retention.mjs';
import { dailyResearchMark, eligibleDecisionCheckpoint, eligibleDecisionMark } from '../lib/intelligence/decision-ledger-price-evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const ledgerPath = path.join(dataDir, 'decision-ledger.json');
const now = new Date();

async function readJson(name, fallback) {
  try {
    return JSON.parse(await readFile(path.join(dataDir, name), 'utf8'));
  } catch {
    return fallback;
  }
}

const round = (value, digits = 2) => {
  // Null, empty and boolean inputs must never become a fabricated zero return.
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
};

const committee = await readJson('investment-committee.json', { allDecisions: [], generatedAt: null });
const terminal = await readJson('terminal-intelligence.json', { assets: [] });
// Unlike optional research inputs, the existing historical ledger is
// irreplaceable certification evidence. Missing/corrupt content must halt the
// job, never silently create an empty history.
const previous = JSON.parse(await readFile(ledgerPath, 'utf8'));
if(previous?.version !== 1 || !Array.isArray(previous.records))
  throw new Error('DECISION_LEDGER_HISTORY_MISSING_OR_INVALID');

// A single unambiguous, current research daily candle is the only mark.
const researchMarks = (terminal.assets || []).map(asset => dailyResearchMark(asset, now.getTime())).filter(Boolean);
const priceBySymbol = new Map();
const duplicateSymbols = new Set();
for (const mark of researchMarks) {
  if (priceBySymbol.has(mark.symbol)) duplicateSymbols.add(mark.symbol);
  else priceBySymbol.set(mark.symbol, mark);
}
for (const symbol of duplicateSymbols) priceBySymbol.delete(symbol);
const records = Array.isArray(previous.records) ? previous.records : [];

function ageDays(date) {
  const timestamp = new Date(date || 0).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, (now.getTime() - timestamp) / 86_400_000);
}

function checkpoint(record, label, minimumDays, mark) {
  if (record.checkpoints?.[label] || !eligibleDecisionCheckpoint(record, mark, minimumDays, now.getTime())) return;
  record.checkpoints ??= {};
  record.checkpoints[label] = {
    measuredAt: now.toISOString(),
    price: round(mark.price),
    priceObservedAt: mark.observedAt,
    priceEvidenceKind: mark.evidenceKind,
    returnPercent: round(((mark.price - record.entryReferencePrice) / record.entryReferencePrice) * 100),
  };
}

for (const record of records) {
  const mark = priceBySymbol.get(String(record.symbol).toUpperCase());
  if (!eligibleDecisionMark(record, mark, now.getTime())) continue;
  // Never regress to an older session bucket.
  if (record.lastPriceObservedAt && Date.parse(record.lastPriceObservedAt) > mark.observedMs) continue;
  record.lastPrice = round(mark.price);
  record.lastPriceObservedAt = mark.observedAt;
  record.lastPriceEvidenceKind = mark.evidenceKind;
  record.lastMarkedAt = now.toISOString();
  record.markToMarketPercent = round(((mark.price - record.entryReferencePrice) / record.entryReferencePrice) * 100);
  checkpoint(record, '1d', 1, mark);
  checkpoint(record, '7d', 7, mark);
  checkpoint(record, '30d', 30, mark);
  checkpoint(record, '90d', 90, mark);
  checkpoint(record, '180d', 180, mark);
  checkpoint(record, '365d', 365, mark);
}

const cycleId = committee.generatedAt || now.toISOString();
const existingCycleKeys = new Set(records.filter((record) => record.cycleId === cycleId).map((record) => `${record.symbol}:${record.decision}`));

for (const decision of committee.allDecisions || []) {
  const key = `${decision.symbol}:${decision.decision}`;
  if (existingCycleKeys.has(key)) continue;
  const price = Number(decision.currentPrice);
  records.push({
    id: `${cycleId}:${decision.symbol}:${decision.decision}`,
    cycleId,
    createdAt: now.toISOString(),
    symbol: decision.symbol,
    name: decision.name,
    decision: decision.decision,
    committeeScore: decision.committeeScore,
    // Research vintage at decision time, never a BUY signal.
    strategyResearch: decision.strategyResearch ?? null,
    confidence: decision.confidence,
    riskScore: decision.riskScore,
    positionType: decision.positionType,
    maxWeightPercent: decision.maxWeightPercent,
    entryReferencePrice: Number.isFinite(price) ? round(price) : null,
    currency: decision.currency,
    fairValueBase: decision.valuation?.fairValueBase ?? null,
    proposedFirstTrancheEuro: decision.entryPlan?.firstTrancheEuro ?? 0,
    sourceGate: committee.sourceGate,
    executionGate: committee.executionGate,
    lastPrice: Number.isFinite(price) ? round(price) : null,
    lastMarkedAt: now.toISOString(),
    markToMarketPercent: null, // not a return until a later candle is observed
    checkpoints: {},
  });
}

// Preserve genuine decisions long enough to reach the required 30-day
// certification horizon. Refuse any future eviction that would destroy
// unmeasured checkpoint evidence. No dates, prices or fills are backfilled.
const retention=retainDecisionLedgerRecords(records,{nowIso:now.toISOString()});
const preservedRecords=retention.records;

function statsFor(decision) {
  // Historical rows without a verified post-decision price vintage are not outcomes.
  const eligible = preservedRecords.filter(record => record.decision === decision
    && Number.isFinite(record.markToMarketPercent)
    && eligibleDecisionMark(record, {price: record.lastPrice, observedAt: record.lastPriceObservedAt}, now.getTime()));
  const wins = eligible.filter((record) => record.markToMarketPercent > 0).length;
  const average = eligible.length ? eligible.reduce((sum, record) => sum + record.markToMarketPercent, 0) / eligible.length : null;
  return {
    observations: eligible.length,
    positivePercent: eligible.length ? round((wins / eligible.length) * 100, 1) : null,
    averageReturnPercent: round(average, 2),
  };
}

const report = {
  version: 1,
  generatedAt: now.toISOString(),
  purpose: 'Registro immutabile delle decisioni Fenice per misurare qualità, calibrazione e rendimento nel tempo.',
  recordCount: preservedRecords.length,
  retentionPolicy: {
    maxRecords:retention.maxRecords,
    requiredCheckpointDays:retention.requiredCheckpointDays,
    safelyEvictedRecords:retention.safelyEvictedRecords,
    pending30dRecords:retention.pending30dRecords,
    oldestRetainedCreatedAt:retention.oldestRetainedCreatedAt,
    noSyntheticCheckpoints:retention.noSyntheticCheckpoints,
    noPaperMutations:retention.noPaperMutations,
    liveTradingAllowed:false,
    brokerConnectivityAllowed:false,
  },
  stats: {
    COMPRA: statsFor('COMPRA'),
    OSSERVA: statsFor('OSSERVA'),
    ATTENDI: statsFor('ATTENDI'),
    EVITA: statsFor('EVITA'),
  },
  records:preservedRecords,
};

// Same-directory rename is atomic on the GitHub Linux runner. An interrupted
// write must never replace 25+ days of valid evidence with half a JSON file.
const tmpPath = path.join(dataDir, '.decision-ledger-'+randomUUID()+'.tmp');
try {
  await writeFile(tmpPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(tmpPath,ledgerPath);
} catch(error) {
  await rm(tmpPath,{force:true}).catch(()=>{});
  throw error;
}
console.log(`Fenice Decision Ledger: ${report.recordCount} decisioni conservate, ${retention.pending30dRecords} in attesa di 30d; evictions=${retention.safelyEvictedRecords}; LIVE=false.`);
