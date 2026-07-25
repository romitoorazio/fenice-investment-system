import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const reportPath = path.join(root, 'data', 'terminal-intelligence.json');
const statePath = path.join(root, 'data', 'terminal-state.json');
const alertsPath = path.join(root, 'data', 'terminal-alerts.json');
const historyDir = path.join(root, 'data', 'history');
const now = new Date();

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const round = (value, digits = 1) => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function freshnessFor(asset) {
  const timestamp = new Date(asset?.technical?.observedAt || 0).getTime();
  if (!Number.isFinite(timestamp) || timestamp <= 0) return { ageHours: 9999, status: 'non disponibile', penalty: 25 };
  const ageHours = Math.max(0, (now.getTime() - timestamp) / 3_600_000);
  const crypto = asset.assetClass === 'Criptovaluta';
  const nearLimit = crypto ? 36 : 48;
  const updatedLimit = crypto ? 72 : 96;
  const delayedLimit = crypto ? 120 : 168;
  if (ageHours <= nearLimit) return { ageHours: round(ageHours), status: 'quasi in tempo reale', penalty: 0 };
  if (ageHours <= updatedLimit) return { ageHours: round(ageHours), status: 'aggiornato', penalty: 2 };
  if (ageHours <= delayedLimit) return { ageHours: round(ageHours), status: 'ritardato', penalty: 8 };
  return { ageHours: round(ageHours), status: 'obsoleto', penalty: 20 };
}

function revisedDecision(asset) {
  if (asset.businessStage === 'pre-commerciale') return 'SPECULATIVA';
  const freshness = asset.technical.freshness?.status;
  const overvaluation = asset.valuation?.status === 'disponibile' && Number(asset.valuation?.upsideBasePercent) <= -20;
  if (freshness === 'obsoleto' || freshness === 'non disponibile') return asset.unifiedScore >= 48 ? 'ATTENDI' : 'EVITA';
  if (asset.technical.signal === 'NEGATIVO') return asset.unifiedScore >= 48 ? 'ATTENDI' : 'EVITA';
  if (asset.technical.signal === 'DEBOLE' || overvaluation) return asset.unifiedScore >= 48 ? 'ATTENDI' : 'EVITA';
  const accumulateThreshold = asset.assetClass === 'ETF' ? 72 : 76;
  const valuationAcceptable = asset.valuation?.status !== 'disponibile' || Number(asset.valuation?.upsideBasePercent) >= -10;
  if (
    asset.unifiedScore >= accumulateThreshold &&
    asset.confidence >= 75 &&
    asset.riskScore <= 58 &&
    ['FORTE', 'POSITIVO'].includes(asset.technical.signal) &&
    valuationAcceptable
  ) return 'ACCUMULA';
  if (asset.unifiedScore >= 63 && asset.riskScore <= 72 && asset.technical.signal !== 'NEGATIVO') return 'MANTIENI';
  return asset.unifiedScore >= 48 ? 'ATTENDI' : 'EVITA';
}

function decisionReason(asset, previousDecision) {
  if (asset.decision === 'ACCUMULA') return 'Convergenza positiva tra punteggio, trend, rischio, freschezza e valutazione; eventuale ingresso soltanto graduale.';
  if (asset.decision === 'MANTIENI') return 'La tesi resta valida, ma non tutte le condizioni giustificano un incremento deciso.';
  if (asset.decision === 'SPECULATIVA') return 'Società pre-commerciale o asset ad alta incertezza: eventuale esposizione minima, subordinata a catalizzatori verificati.';
  if (asset.technical.freshness?.status === 'obsoleto') return 'Dati troppo vecchi per una decisione operativa: il segnale è sospeso fino al prossimo aggiornamento.';
  if (asset.technical.signal === 'NEGATIVO' || asset.technical.signal === 'DEBOLE') return 'Il quadro tecnico non conferma ancora la tesi fondamentale o la valutazione.';
  if (asset.valuation?.status === 'disponibile' && Number(asset.valuation?.upsideBasePercent) <= -20) return 'La valutazione indica un margine di sicurezza insufficiente nonostante altri fattori positivi.';
  if (asset.decision === 'ATTENDI') return 'Il quadro complessivo non offre ancora una convergenza sufficiente per un nuovo ingresso.';
  return previousDecision === 'EVITA' ? asset.reason : 'Rapporto rischio/rendimento insufficiente secondo i dati disponibili.';
}

function classify(asset) {
  if (['ETF', 'Obbligazioni', 'Materie prime'].includes(asset.assetClass)) return 'core';
  if (asset.businessStage === 'pre-commerciale' || asset.assetClass === 'Criptovaluta') return 'speculative';
  return 'growth';
}

function distributeWeighted(candidates, targetPercent, capPercent) {
  let remaining = targetPercent;
  const active = candidates.map((asset) => ({ asset, room: capPercent }));
  for (let iteration = 0; iteration < 10 && remaining > 0.001 && active.length; iteration += 1) {
    const totalWeight = active.reduce((sum, item) => sum + Math.max(1, item.asset.unifiedScore - 45), 0);
    let allocated = 0;
    for (let index = active.length - 1; index >= 0; index -= 1) {
      const item = active[index];
      const desired = remaining * (Math.max(1, item.asset.unifiedScore - 45) / totalWeight);
      const addition = Math.min(item.room, desired);
      item.asset.targetWeightPercent += addition;
      item.room -= addition;
      allocated += addition;
      if (item.room <= 0.001) active.splice(index, 1);
    }
    if (allocated <= 0.001) break;
    remaining -= allocated;
  }
  return Math.max(0, remaining);
}

function recomputeAllocation(report) {
  for (const asset of report.assets) {
    asset.targetWeightPercent = 0;
    asset.targetAmountEuro = 0;
  }
  const model = Object.fromEntries(report.portfolio.map((slice) => [slice.id, Number(slice.targetPercent || 0)]));
  const eligible = report.assets.filter((asset) => ['ACCUMULA', 'MANTIENI', 'SPECULATIVA'].includes(asset.decision));
  const core = eligible.filter((asset) => classify(asset) === 'core');
  const growth = eligible.filter((asset) => classify(asset) === 'growth');
  const speculative = eligible.filter((asset) => classify(asset) === 'speculative');
  let reserve = Number(model.reserve || 0);
  reserve += distributeWeighted(core, Number(model.core || 0), 20);
  reserve += distributeWeighted(growth, Number(model.growth || 0), 7);
  reserve += distributeWeighted(speculative, Number(model.speculative || 0), 2.5);

  for (const asset of report.assets) {
    asset.targetWeightPercent = round(asset.targetWeightPercent);
    asset.targetAmountEuro = Math.round(report.capitalEuro * asset.targetWeightPercent / 100);
  }
  const investedPercent = round(report.assets.reduce((sum, asset) => sum + asset.targetWeightPercent, 0));
  reserve = round(Math.max(0, 100 - investedPercent));
  const reserveSlice = report.portfolio.find((slice) => slice.id === 'reserve');
  if (reserveSlice) {
    reserveSlice.targetPercent = reserve;
    reserveSlice.targetAmountEuro = Math.round(report.capitalEuro * reserve / 100);
    reserveSlice.rationale = 'Liquidità non assegnata perché strumenti in ATTENDI/EVITA o limiti di concentrazione impediscono l’investimento completo.';
  }
  for (const slice of report.portfolio.filter((item) => item.id !== 'reserve')) {
    const actual = report.assets.filter((asset) => classify(asset) === slice.id).reduce((sum, asset) => sum + asset.targetWeightPercent, 0);
    slice.targetPercent = round(actual);
    slice.targetAmountEuro = Math.round(report.capitalEuro * slice.targetPercent / 100);
  }
  report.allocationCheck = {
    investedPercent,
    reservePercent: reserve,
    totalPercent: round(investedPercent + reserve),
    valid: Math.abs(investedPercent + reserve - 100) <= 0.2,
  };
}

function buildGuardrails(report) {
  const core = report.assets.filter((asset) => classify(asset) === 'core');
  const growth = report.assets.filter((asset) => classify(asset) === 'growth');
  const speculative = report.assets.filter((asset) => classify(asset) === 'speculative');
  const maxCore = Math.max(0, ...core.map((asset) => asset.targetWeightPercent));
  const maxGrowth = Math.max(0, ...growth.map((asset) => asset.targetWeightPercent));
  const maxSpeculative = Math.max(0, ...speculative.map((asset) => asset.targetWeightPercent));
  const cryptoTotal = report.assets.filter((asset) => asset.assetClass === 'Criptovaluta').reduce((sum, asset) => sum + asset.targetWeightPercent, 0);
  const speculativeTotal = speculative.reduce((sum, asset) => sum + asset.targetWeightPercent, 0);
  const violations = [];
  if (maxCore > 20.01) violations.push(`Singola posizione core al ${round(maxCore)}%, sopra il limite 20%.`);
  if (maxGrowth > 7.01) violations.push(`Singola posizione growth al ${round(maxGrowth)}%, sopra il limite 7%.`);
  if (maxSpeculative > 2.51) violations.push(`Singola posizione speculativa al ${round(maxSpeculative)}%, sopra il limite 2,5%.`);
  if (cryptoTotal > 5.01) violations.push(`Crypto complessive al ${round(cryptoTotal)}%, sopra il limite 5%.`);
  if (speculativeTotal > 5.01) violations.push(`Area speculativa al ${round(speculativeTotal)}%, sopra il limite 5%.`);
  if (!report.allocationCheck?.valid) violations.push('La somma delle allocazioni non è pari al 100%.');
  report.guardrails = {
    maxCoreWeightPercent: round(maxCore),
    maxGrowthWeightPercent: round(maxGrowth),
    maxSpeculativeWeightPercent: round(maxSpeculative),
    cryptoTotalPercent: round(cryptoTotal),
    speculativeTotalPercent: round(speculativeTotal),
    violations,
  };
}

function alertId(parts) {
  return parts.join(':').replace(/[^a-zA-Z0-9:_-]/g, '-');
}

function makeAlert(severity, type, symbol, title, detail, previous, current) {
  return {
    id: alertId([now.toISOString().slice(0, 13), type, symbol || 'system', String(current ?? '')]),
    generatedAt: now.toISOString(),
    severity,
    type,
    ...(symbol ? { symbol } : {}),
    title,
    detail,
    ...(previous !== undefined ? { previous } : {}),
    ...(current !== undefined ? { current } : {}),
  };
}

const report = await readJson(reportPath, null);
if (!report || !Array.isArray(report.assets)) throw new Error('Terminal report non valido');
const previousState = await readJson(statePath, { assets: {} });
const previousAlerts = await readJson(alertsPath, { alerts: [] });
const newAlerts = [];
const initialRun = !previousState.assets || Object.keys(previousState.assets).length === 0;

for (const asset of report.assets) {
  const freshness = freshnessFor(asset);
  asset.technical.freshness = { ageHours: freshness.ageHours, status: freshness.status };
  asset.technical.warnings = [...new Set([
    ...(asset.technical.warnings || []),
    ...(freshness.status === 'ritardato' ? [`Prezzo giornaliero ritardato di circa ${freshness.ageHours} ore.`] : []),
    ...(['obsoleto', 'non disponibile'].includes(freshness.status) ? [`Dato non utilizzabile operativamente: freschezza ${freshness.status}.`] : []),
  ])];
  asset.unifiedScore = Math.round(clamp(Number(asset.unifiedScore) - freshness.penalty));
  asset.confidence = Math.round(clamp(Number(asset.confidence) - freshness.penalty * 1.2));
  const oldDecision = asset.decision;
  asset.decision = revisedDecision(asset);
  asset.reason = decisionReason(asset, oldDecision);
  asset.warnings = [...new Set([...(asset.warnings || []), ...(asset.technical.warnings || [])])];

  const previous = previousState.assets?.[asset.symbol];
  if (!initialRun && previous) {
    if (previous.decision !== asset.decision) newAlerts.push(makeAlert(
      ['ACCUMULA', 'EVITA'].includes(asset.decision) ? 'critico' : 'attenzione',
      'decisione', asset.symbol, `Decisione ${previous.decision} → ${asset.decision}`,
      asset.reason, previous.decision, asset.decision,
    ));
    if (previous.signal !== asset.technical.signal) newAlerts.push(makeAlert(
      ['NEGATIVO', 'FORTE'].includes(asset.technical.signal) ? 'attenzione' : 'informazione',
      'segnale', asset.symbol, `Segnale tecnico ${previous.signal} → ${asset.technical.signal}`,
      asset.technical.reasons?.[0] || 'Il quadro tecnico è cambiato.', previous.signal, asset.technical.signal,
    ));
    if (Math.abs(Number(previous.unifiedScore) - asset.unifiedScore) >= 8) newAlerts.push(makeAlert(
      'attenzione', 'punteggio', asset.symbol, 'Variazione rilevante del Fenice Score',
      `Il punteggio è passato da ${previous.unifiedScore} a ${asset.unifiedScore}.`, previous.unifiedScore, asset.unifiedScore,
    ));
    const oldPrice = Number(previous.price);
    const newPrice = Number(asset.price);
    const priceThreshold = asset.assetClass === 'Criptovaluta' ? 10 : 5;
    if (oldPrice > 0 && newPrice > 0) {
      const move = ((newPrice / oldPrice) - 1) * 100;
      if (Math.abs(move) >= priceThreshold) newAlerts.push(makeAlert(
        'attenzione', 'prezzo', asset.symbol, `Movimento prezzo ${round(move)}%`,
        `Il prezzo monitorato è passato da ${oldPrice} a ${newPrice} ${asset.currency || ''}.`, oldPrice, newPrice,
      ));
    }
  }
  if (['obsoleto', 'non disponibile'].includes(freshness.status)) newAlerts.push(makeAlert(
    'critico', 'freschezza', asset.symbol, 'Dati di prezzo non aggiornati',
    `Ultima osservazione vecchia di circa ${freshness.ageHours} ore: decisione operativa sospesa.`, freshness.ageHours, freshness.status,
  ));
}

if (initialRun) newAlerts.push(makeAlert(
  'informazione', 'segnale', undefined, 'Monitoraggio Fenice inizializzato',
  `${report.assets.length} strumenti sono entrati nel controllo continuo di decisioni, segnali, prezzi e freschezza.`, undefined, report.assets.length,
));

report.assets.sort((left, right) => right.unifiedScore - left.unifiedScore || left.riskScore - right.riskScore);
recomputeAllocation(report);
buildGuardrails(report);
const freshAssets = report.assets.filter((asset) => ['quasi in tempo reale', 'aggiornato'].includes(asset.technical.freshness?.status)).length;
const delayedAssets = report.assets.filter((asset) => asset.technical.freshness?.status === 'ritardato').length;
const obsoleteAssets = report.assets.filter((asset) => ['obsoleto', 'non disponibile'].includes(asset.technical.freshness?.status)).length;
report.freshAssetCount = freshAssets;
report.freshnessStatus = obsoleteAssets ? 'obsoleto' : delayedAssets ? 'ritardato' : freshAssets === report.assets.length ? 'aggiornato' : 'non disponibile';
report.averageUnifiedScore = report.assets.length ? Math.round(report.assets.reduce((sum, asset) => sum + asset.unifiedScore, 0) / report.assets.length) : 0;
report.dataQuality = Math.round(clamp(Number(report.dataQuality) - obsoleteAssets * 4 - delayedAssets * 1.5));
report.alertsCount = newAlerts.length;
report.source.detail = `${report.source.detail} Freschi/aggiornati ${freshAssets}/${report.assets.length}; alert nuovi ${newAlerts.length}.`;
report.methodology = [...new Set([
  ...(report.methodology || []),
  'La freschezza applica una penalità automatica a punteggio e confidenza; i fine settimana sono gestiti con soglie specifiche per dati giornalieri.',
  'Gli strumenti in ATTENDI o EVITA non ricevono capitale nel portafoglio modello.',
  'I cambi di decisione, segnale, punteggio e prezzo vengono registrati nell’Alert Center.',
])];
report.warnings = [...new Set([
  ...(report.warnings || []),
  ...(report.guardrails.violations || []),
  ...(delayedAssets ? [`${delayedAssets} strumenti hanno dati ritardati.`] : []),
  ...(obsoleteAssets ? [`${obsoleteAssets} strumenti hanno dati obsoleti o non disponibili.`] : []),
])];

const nextState = {
  version: Number(previousState.version || 0) + 1,
  generatedAt: now.toISOString(),
  assets: Object.fromEntries(report.assets.map((asset) => [asset.symbol, {
    decision: asset.decision,
    signal: asset.technical.signal,
    unifiedScore: asset.unifiedScore,
    riskScore: asset.riskScore,
    price: asset.price,
    currency: asset.currency,
    observedAt: asset.technical.observedAt,
  }])),
};
const mergedAlerts = [...newAlerts, ...(previousAlerts.alerts || [])]
  .filter((alert, index, collection) => collection.findIndex((candidate) => candidate.id === alert.id) === index)
  .sort((left, right) => String(right.generatedAt).localeCompare(String(left.generatedAt)))
  .slice(0, 200);
const alertsReport = {
  version: Number(previousAlerts.version || 0) + 1,
  generatedAt: now.toISOString(),
  alerts: mergedAlerts,
};

await mkdir(historyDir, { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(statePath, `${JSON.stringify(nextState, null, 2)}\n`);
await writeFile(alertsPath, `${JSON.stringify(alertsReport, null, 2)}\n`);
await writeFile(path.join(historyDir, `${now.toISOString().slice(0, 10)}-terminal-validated.json`), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Terminal validato: ${report.assets.length} asset, freschi ${freshAssets}, ritardati ${delayedAssets}, obsoleti ${obsoleteAssets}, investito ${report.allocationCheck.investedPercent}%, riserva ${report.allocationCheck.reservePercent}%, alert ${newAlerts.length}.`);
