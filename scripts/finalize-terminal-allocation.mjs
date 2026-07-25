import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'data', 'terminal-intelligence.json');
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

function category(asset) {
  if (['ETF', 'Obbligazioni', 'Materie prime'].includes(asset.assetClass)) return 'core';
  if (asset.businessStage === 'pre-commerciale' || asset.assetClass === 'Criptovaluta') return 'speculative';
  return 'growth';
}

function trim(assets, maximum) {
  let total = round(assets.reduce((sum, asset) => sum + Number(asset.targetWeightPercent || 0), 0));
  if (total <= maximum) return;
  const ordered = [...assets].sort((left, right) => Number(left.unifiedScore || 0) - Number(right.unifiedScore || 0) || Number(right.riskScore || 0) - Number(left.riskScore || 0));
  let excess = round(total - maximum);
  for (const asset of ordered) {
    if (excess <= 0) break;
    const reduction = Math.min(Number(asset.targetWeightPercent || 0), excess);
    asset.targetWeightPercent = round(Number(asset.targetWeightPercent || 0) - reduction);
    excess = round(excess - reduction);
  }
}

const report = JSON.parse(await readFile(reportPath, 'utf8'));
const policy = /CAUTO|DIFENSIVO|ATTENDERE/i.test(String(report.marketRegime || '')) || Number(report.dataQuality) < 60
  ? { core: 55, growth: 15, speculative: 5 }
  : /OFFENSIVO/i.test(String(report.marketRegime || '')) && Number(report.dataQuality) >= 75
    ? { core: 50, growth: 35, speculative: 5 }
    : { core: 55, growth: 25, speculative: 5 };

trim(report.assets.filter((asset) => category(asset) === 'core'), policy.core);
trim(report.assets.filter((asset) => category(asset) === 'growth'), policy.growth);
trim(report.assets.filter((asset) => category(asset) === 'speculative'), policy.speculative);
trim(report.assets.filter((asset) => asset.assetClass === 'Criptovaluta'), 5);

for (const asset of report.assets) {
  asset.targetWeightPercent = round(asset.targetWeightPercent);
  asset.targetAmountEuro = Math.round(Number(report.capitalEuro || 10_000) * asset.targetWeightPercent / 100);
}

const totals = {
  core: round(report.assets.filter((asset) => category(asset) === 'core').reduce((sum, asset) => sum + asset.targetWeightPercent, 0)),
  growth: round(report.assets.filter((asset) => category(asset) === 'growth').reduce((sum, asset) => sum + asset.targetWeightPercent, 0)),
  speculative: round(report.assets.filter((asset) => category(asset) === 'speculative').reduce((sum, asset) => sum + asset.targetWeightPercent, 0)),
};
const invested = round(totals.core + totals.growth + totals.speculative);
const reserve = round(Math.max(0, 100 - invested));
const capital = Number(report.capitalEuro || 10_000);
report.portfolio = [
  { id: 'core', label: 'Nucleo diversificato', targetPercent: totals.core, targetAmountEuro: Math.round(capital * totals.core / 100), rationale: 'ETF, obbligazioni e strumenti ampi realmente eleggibili.' },
  { id: 'growth', label: 'Crescita selezionata', targetPercent: totals.growth, targetAmountEuro: Math.round(capital * totals.growth / 100), rationale: 'Azioni con decisione ACCUMULA o MANTIENI e limiti di concentrazione.' },
  { id: 'speculative', label: 'Opportunità speculative', targetPercent: totals.speculative, targetAmountEuro: Math.round(capital * totals.speculative / 100), rationale: 'Biotech pre-commerciali e crypto: massimo 2,5% per strumento e 5% complessivo.' },
  { id: 'reserve', label: 'Riserva strategica', targetPercent: reserve, targetAmountEuro: Math.round(capital * reserve / 100), rationale: 'Liquidità liberata dagli strumenti in ATTENDI/EVITA e dai limiti di rischio.' },
];
report.allocationCheck = { investedPercent: invested, reservePercent: reserve, totalPercent: round(invested + reserve), valid: Math.abs(invested + reserve - 100) <= 0.2 };
const core = report.assets.filter((asset) => category(asset) === 'core');
const growth = report.assets.filter((asset) => category(asset) === 'growth');
const speculative = report.assets.filter((asset) => category(asset) === 'speculative');
const cryptoTotal = round(report.assets.filter((asset) => asset.assetClass === 'Criptovaluta').reduce((sum, asset) => sum + asset.targetWeightPercent, 0));
const violations = [];
const maxCore = Math.max(0, ...core.map((asset) => asset.targetWeightPercent));
const maxGrowth = Math.max(0, ...growth.map((asset) => asset.targetWeightPercent));
const maxSpeculative = Math.max(0, ...speculative.map((asset) => asset.targetWeightPercent));
if (maxCore > 20.001) violations.push('Limite singola posizione core superato.');
if (maxGrowth > 7.001) violations.push('Limite singola posizione growth superato.');
if (maxSpeculative > 2.501) violations.push('Limite singola posizione speculativa superato.');
if (cryptoTotal > 5.001) violations.push('Limite crypto complessivo superato.');
if (totals.speculative > 5.001) violations.push('Limite area speculativa superato.');
if (!report.allocationCheck.valid) violations.push('Allocazione totale diversa dal 100%.');
report.guardrails = {
  maxCoreWeightPercent: round(maxCore),
  maxGrowthWeightPercent: round(maxGrowth),
  maxSpeculativeWeightPercent: round(maxSpeculative),
  cryptoTotalPercent: cryptoTotal,
  speculativeTotalPercent: totals.speculative,
  violations,
};
report.warnings = [...new Set((report.warnings || []).filter((warning) => !/Limite area speculativa superato|Limite crypto complessivo superato/.test(warning)).concat(violations))];

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Allocazione finalizzata: investito ${invested}%, riserva ${reserve}%, speculativo ${totals.speculative}%, violazioni ${violations.length}.`);
