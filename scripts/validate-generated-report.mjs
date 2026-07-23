import { readFile } from 'node:fs/promises';

const snapshot = JSON.parse(await readFile(new URL('../data/latest-snapshot.json', import.meta.url), 'utf8'));
const errors = [];
const warnings = [];
const markets = Array.isArray(snapshot.markets) ? snapshot.markets : [];
const providers = Array.isArray(snapshot.providers) ? snapshot.providers : [];
const discoveries = Array.isArray(snapshot.discoveries) ? snapshot.discoveries : [];

if (!snapshot.generatedAt && !snapshot.updatedAt) errors.push('timestamp rapporto mancante');
if (markets.length === 0) errors.push('nessuno strumento di mercato');
if (discoveries.length === 0) errors.push('nessun segnale emergente');
if (providers.length === 0) errors.push('nessun provider registrato');

const classes = new Set(markets.map(x => x.assetClass).filter(Boolean));
if (classes.size < 2) warnings.push(`copertura asset insufficiente: ${classes.size} classe/i`);
const traditional = markets.filter(x => x.assetClass !== 'Criptovaluta');
if (traditional.length === 0) errors.push('mancano completamente mercati tradizionali');

for (const name of ['Alpha Vantage', 'FRED', 'GDELT']) {
  const p = providers.find(x => x.name === name);
  if (!p) warnings.push(`${name}: provider non presente nel rapporto`);
  else console.log(`${name}: ${p.state} — ${p.detail}`);
}

console.log(`Report: ${markets.length} strumenti, ${classes.size} classi, ${discoveries.length} segnali, ${providers.length} provider.`);
for (const warning of warnings) console.warn(`WARNING: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
