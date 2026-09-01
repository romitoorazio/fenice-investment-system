import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const now = new Date();

async function readJson(name, fallback = {}) {
  try {
    return JSON.parse(await readFile(path.join(dataDir, name), 'utf8'));
  } catch {
    return fallback;
  }
}

const ledger = await readJson('decision-ledger.json', { records: [] });
const strategyLab = await readJson('strategy-lab.json', {});
const records = Array.isArray(ledger.records) ? ledger.records : [];
const buys = records.filter((record) => record.decision === 'COMPRA');
const sevenDay = buys.filter((record) => Number.isFinite(record?.checkpoints?.['7d']?.returnPercent));
const thirtyDay = buys.filter((record) => Number.isFinite(record?.checkpoints?.['30d']?.returnPercent));
const distinctBuySymbols = new Set(buys.map((record) => String(record.symbol || '').toUpperCase()).filter(Boolean)).size;

const methodology = Array.isArray(strategyLab.methodology) ? strategyLab.methodology.join(' ').toLowerCase() : '';
const backtestReady = Number(strategyLab.coveragePercent) >= 90
  && Number(strategyLab.robustCount) >= 3
  && /fuori campione/.test(methodology)
  && /look-ahead/.test(methodology);

const paperReady = sevenDay.length >= 20
  && thirtyDay.length >= 10
  && distinctBuySymbols >= 5;

const report = {
  version: 1,
  generatedAt: now.toISOString(),
  status: backtestReady && paperReady ? 'VALIDATED' : 'INSUFFICIENT_EVIDENCE',
  validated: backtestReady && paperReady,
  backtest: {
    ready: backtestReady,
    coveragePercent: Number(strategyLab.coveragePercent || 0),
    robustFamilies: Number(strategyLab.robustCount || 0),
    outOfSampleDeclared: /fuori campione/.test(methodology),
    noLookAheadDeclared: /look-ahead/.test(methodology),
  },
  paper: {
    buyRecords: buys.length,
    distinctBuySymbols,
    evaluated7d: sevenDay.length,
    evaluated30d: thirtyDay.length,
    minimumRequired: {
      evaluated7d: 20,
      evaluated30d: 10,
      distinctBuySymbols: 5
    }
  },
  blockers: [
    ...(!backtestReady ? ['Backtest robusto/out-of-sample non ancora sufficiente.'] : []),
    ...(!paperReady ? ['Storico paper COMPRA ancora insufficiente per validare il comportamento reale del motore.'] : []),
  ],
  note: 'VALIDATED indica evidenza tecnica sufficiente per il paper mode; non garantisce rendimenti futuri e non abilita il live trading.'
};

await writeFile(path.join(dataDir, 'paper-validation.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Fenice paper validation: ${report.status}; 7d=${sevenDay.length}, 30d=${thirtyDay.length}, symbols=${distinctBuySymbols}.`);
