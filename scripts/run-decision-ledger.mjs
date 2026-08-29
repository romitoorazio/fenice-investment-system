import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  if (!Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
};

const committee = await readJson('investment-committee.json', { allDecisions: [], generatedAt: null });
const terminal = await readJson('terminal-intelligence.json', { assets: [] });
const previous = await readJson('decision-ledger.json', { version: 1, records: [] });

const priceBySymbol = new Map((terminal.assets || []).map((asset) => [String(asset.symbol).toUpperCase(), Number(asset.price)]));
const records = Array.isArray(previous.records) ? previous.records : [];

function ageDays(date) {
  const timestamp = new Date(date || 0).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, (now.getTime() - timestamp) / 86_400_000);
}

function checkpoint(record, label, minimumDays, currentPrice) {
  if (record.checkpoints?.[label] || ageDays(record.createdAt) < minimumDays || !Number.isFinite(currentPrice) || !Number.isFinite(record.entryReferencePrice)) return;
  record.checkpoints ??= {};
  record.checkpoints[label] = {
    measuredAt: now.toISOString(),
    price: round(currentPrice),
    returnPercent: round(((currentPrice - record.entryReferencePrice) / record.entryReferencePrice) * 100),
  };
}

for (const record of records) {
  const currentPrice = priceBySymbol.get(String(record.symbol).toUpperCase());
  if (Number.isFinite(currentPrice)) {
    record.lastPrice = round(currentPrice);
    record.lastMarkedAt = now.toISOString();
    record.markToMarketPercent = Number.isFinite(record.entryReferencePrice)
      ? round(((currentPrice - record.entryReferencePrice) / record.entryReferencePrice) * 100)
      : null;
    checkpoint(record, '1d', 1, currentPrice);
    checkpoint(record, '7d', 7, currentPrice);
    checkpoint(record, '30d', 30, currentPrice);
    checkpoint(record, '90d', 90, currentPrice);
    checkpoint(record, '180d', 180, currentPrice);
    checkpoint(record, '365d', 365, currentPrice);
  }
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
    markToMarketPercent: 0,
    checkpoints: {},
  });
}

function statsFor(decision) {
  const eligible = records.filter((record) => record.decision === decision && Number.isFinite(record.markToMarketPercent));
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
  recordCount: records.length,
  stats: {
    COMPRA: statsFor('COMPRA'),
    OSSERVA: statsFor('OSSERVA'),
    ATTENDI: statsFor('ATTENDI'),
    EVITA: statsFor('EVITA'),
  },
  records: records.slice(-5000),
};

await writeFile(ledgerPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Fenice Decision Ledger: ${report.recordCount} decisioni registrate.`);
