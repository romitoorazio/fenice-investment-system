import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateParameterStability } from '../lib/intelligence/strategy-robustness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'data', 'strategy-lab.json');
const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const round = (value, digits = 1) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
function verdict(score, positive, count, stabilityState) {
  if (stabilityState === 'FRAGILE') return count ? 'FRAGILE' : 'INSUFFICIENTE';
  if (score >= 70 && positive >= Math.ceil(count * 2 / 3) && stabilityState === 'STABLE') return 'ROBUSTA';
  if (score >= 55 && positive >= Math.ceil(count / 2)) return 'PROMETTENTE';
  return count ? 'FRAGILE' : 'INSUFFICIENTE';
}

const report = JSON.parse(await readFile(reportPath, 'utf8'));
for (const asset of report.assets || []) {
  for (const family of asset.families || []) {
    const variants = family.variants || [];
    const positive = variants.filter((variant) => Number(variant.outOfSample?.excessAnnualizedReturnPercent) > 0 && Number(variant.outOfSample?.sharpe) > 0).length;
    const medianExcess = median(variants.map((variant) => Number(variant.outOfSample?.excessAnnualizedReturnPercent)));
    const medianImprovement = median(variants.map((variant) => Number(variant.outOfSample?.maxDrawdownPercent) - Number(variant.outOfSample?.benchmarkMaxDrawdownPercent)));
    const tradePenalty = variants.some((variant) => Number(variant.outOfSample?.trades) < 2) ? 8 : 0;
    const parameterStability = evaluateParameterStability(variants.map((variant) => ({
      excessAnnualizedReturnPercent: Number(variant.outOfSample?.excessAnnualizedReturnPercent),
      sharpe: Number(variant.outOfSample?.sharpe),
    })));
    const stabilityPenalty = parameterStability.state === 'FRAGILE' ? 20 : parameterStability.state === 'WATCH' ? 8 : 0;
    const score = Math.round(clamp(42 + clamp(medianExcess, -20, 20) * 1.5 + (variants.length ? positive / variants.length : 0) * 28 + clamp(medianImprovement, -20, 30) * 0.6 - tradePenalty - stabilityPenalty));
    const selected = [...variants].sort((left, right) => (Number(right.outOfSample?.excessAnnualizedReturnPercent) + Number(right.outOfSample?.sharpe) * 3) - (Number(left.outOfSample?.excessAnnualizedReturnPercent) + Number(left.outOfSample?.sharpe) * 3))[0];
    family.positiveOutOfSampleVariants = positive;
    family.medianOutOfSampleExcessPercent = round(medianExcess);
    family.medianOutOfSampleDrawdownImprovementPercent = round(medianImprovement);
    family.parameterStability = parameterStability;
    family.robustnessScore = score;
    family.verdict = verdict(score, positive, variants.length, parameterStability.state);
    family.selectedVariantId = selected?.id || variants[0]?.id;
    family.rationale = [
      `${positive}/${variants.length} varianti battono SPY fuori campione con Sharpe positivo.`,
      `Eccesso annuo mediano fuori campione: ${round(medianExcess)}%.`,
      `Miglioramento mediano del drawdown rispetto a SPY: ${round(medianImprovement)} punti percentuali.`,
      `Stabilità del vicinato parametri: ${parameterStability.state} (${parameterStability.score}/100).`,
    ];
    family.warnings = [
      ...(positive < Math.ceil(variants.length / 2) ? ['La maggioranza dei parametri non conferma un vantaggio fuori campione.'] : []),
      ...(variants.some((variant) => Number(variant.outOfSample?.trades) < 2) ? ['Alcune varianti hanno poche operazioni fuori campione: significatività ridotta.'] : []),
      ...(medianExcess < 0 ? ['Il risultato mediano fuori campione è inferiore al benchmark SPY.'] : []),
      ...(parameterStability.state !== 'STABLE' ? [`Stabilità dei parametri ${parameterStability.state}: robustezza ridotta.`] : []),
    ];
  }
  const best = [...(asset.families || [])].sort((left, right) => Number(right.robustnessScore) - Number(left.robustnessScore))[0];
  asset.bestFamily = best?.id;
  asset.bestRobustnessScore = Number(best?.robustnessScore || 0);
  asset.conclusion = best?.verdict || 'INSUFFICIENTE';
}
report.assets = (report.assets || []).sort((left, right) => Number(right.bestRobustnessScore) - Number(left.bestRobustnessScore));
report.robustCount = report.assets.filter((asset) => asset.conclusion === 'ROBUSTA').length;
report.methodology = [...new Set([
  ...(report.methodology || []),
  'Il miglioramento del drawdown è positivo quando la strategia perde meno del benchmark SPY.',
  'La robustezza viene penalizzata se piccole variazioni dei parametri producono risultati instabili; la stabilità non può aumentare artificialmente un risultato fragile.',
])];
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Strategy Lab finalizzato: robusti ${report.robustCount}/${report.assetCount}.`);
