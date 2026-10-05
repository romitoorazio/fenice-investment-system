import { readFile } from "node:fs/promises";

function positive(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function unique(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim().toUpperCase()).filter(Boolean))];
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? parsed : fallback));
}

export function explainPaperValidationCandidates({ approval, coverage, state, terminal, committee }) {
  const allowedDecisionStates = unique(Array.isArray(approval?.permittedDecisionStates)
    ? approval.permittedDecisionStates
    : ["ACCUMULA", "MANTIENI", "OSSERVA"]);
  const allowedCurrencies = unique(Array.isArray(approval?.permittedCurrencies)
    ? approval.permittedCurrencies
    : ["USD", "EUR"]);
  const minCommitteeScore = Number.isFinite(Number(approval?.minCommitteeScore)) ? Number(approval.minCommitteeScore) : 70;
  const minValidationDataConfidence = Number.isFinite(Number(approval?.minValidationDataConfidence))
    ? Number(approval.minValidationDataConfidence)
    : Number.isFinite(Number(approval?.minConfidence)) ? Number(approval.minConfidence) : 90;
  const maxRiskScore = Number.isFinite(Number(approval?.maxRiskScore)) ? Number(approval.maxRiskScore) : 75;
  const maxNotionalEuroPerOrder = boundedNumber(approval?.maxNotionalEuroPerOrder, 300, 1, 500);
  const maxCapitalPercentPerProbe = boundedNumber(approval?.maxCapitalPercentPerProbe, 3, 0.1, 5);
  const minTcaProbeNotionalEuro = boundedNumber(approval?.minTcaProbeNotionalEuro, 250, 1, maxNotionalEuroPerOrder);
  const maxSingleAssetWeightPercentForProbe = boundedNumber(approval?.maxSingleAssetWeightPercentForProbe, 15, 1, 15);

  const coverageBySymbol = new Map((Array.isArray(coverage?.rows) ? coverage.rows : [])
    .map((row) => [String(row?.symbol || "").toUpperCase(), row]));
  const terminalBySymbol = new Map((Array.isArray(terminal?.assets) ? terminal.assets : [])
    .map((asset) => [String(asset?.symbol || "").toUpperCase(), asset]));
  const positionsBySymbol = new Map((Array.isArray(state?.positions) ? state.positions : [])
    .map((position) => [String(position?.symbol || "").toUpperCase(), position]));

  const capitalEuro = Number(terminal?.capitalEuro || 0);
  const capitalProbeCapEuro = capitalEuro * maxCapitalPercentPerProbe / 100;
  const singleAssetCapEuro = capitalEuro * maxSingleAssetWeightPercentForProbe / 100;

  const rows = (Array.isArray(committee?.topDecisions) ? committee.topDecisions : []).map((decision) => {
    const symbol = String(decision?.symbol || "").toUpperCase();
    const row = coverageBySymbol.get(symbol);
    const asset = terminalBySymbol.get(symbol);
    const currency = String(decision?.currency || asset?.currency || "").toUpperCase();
    const committeeScore = Number(decision?.committeeScore || 0);
    const rawCommitteeConfidence = Number(decision?.rawConfidenceBeforeCalibration ?? decision?.confidence ?? 0);
    const terminalConfidence = Number(asset?.confidence || 0);
    const validationDataConfidence = Math.min(rawCommitteeConfidence, terminalConfidence);
    const riskScore = Math.max(Number(decision?.riskScore ?? 100), Number(asset?.riskScore ?? 100));
    const decisionState = String(decision?.decision || "").toUpperCase();
    const terminalDecision = String(asset?.decision || "").toUpperCase();
    const configuredFxToEuro = Number(approval?.riskFxToEuroByCurrency?.[currency]);
    const fxToEuro = positive(configuredFxToEuro) ? configuredFxToEuro : currency === "EUR" ? 1 : Number.NaN;
    const position = positionsBySymbol.get(symbol);
    const positionQuantity = Math.abs(Number(position?.quantity || 0));
    const positionFxToEuro = positive(position?.fxToEuro) ? Number(position.fxToEuro) : fxToEuro;
    const existingPositionNotionalEuro = row && positive(positionQuantity) && positive(positionFxToEuro) && positive(row?.medianPrice)
      ? positionQuantity * Number(row.medianPrice) * positionFxToEuro
      : 0;
    const singleAssetHeadroomEuro = Math.max(0, singleAssetCapEuro - existingPositionNotionalEuro);
    const notionalCapacityEuro = Math.max(0, Math.min(maxNotionalEuroPerOrder, capitalProbeCapEuro, singleAssetHeadroomEuro));

    const gates = [
      { code: "execution-coverage", pass: Boolean(row?.paperEligible === true && ["GREEN", "CAUTION"].includes(String(row?.state || "").toUpperCase()) && Number(row?.independentSourceFamilies || 0) >= 2 && positive(row?.medianPrice)), observed: row ? `${row.state}/${row.independentSourceFamilies}` : "missing", limit: "PAPER + GREEN/CAUTION + >=2 families + positive price" },
      { code: "fx", pass: positive(fxToEuro) && fxToEuro <= 5, observed: Number.isFinite(fxToEuro) ? fxToEuro : null, limit: "0 < FX <= 5" },
      { code: "committee-decision", pass: allowedDecisionStates.includes(decisionState), observed: decisionState, limit: allowedDecisionStates.join(",") },
      { code: "terminal-decision", pass: !["ATTENDI", "EVITA"].includes(terminalDecision) && Boolean(terminalDecision), observed: terminalDecision || "missing", limit: "not ATTENDI/EVITA" },
      { code: "committee-score", pass: committeeScore >= minCommitteeScore, observed: committeeScore, limit: minCommitteeScore },
      { code: "data-confidence", pass: validationDataConfidence >= minValidationDataConfidence, observed: validationDataConfidence, limit: minValidationDataConfidence },
      { code: "risk-score", pass: riskScore <= maxRiskScore, observed: riskScore, limit: maxRiskScore },
      { code: "currency", pass: allowedCurrencies.includes(currency), observed: currency, limit: allowedCurrencies.join(",") },
      { code: "notional-capacity", pass: notionalCapacityEuro >= minTcaProbeNotionalEuro, observed: Number(notionalCapacityEuro.toFixed(2)), limit: minTcaProbeNotionalEuro },
    ];

    return {
      symbol,
      paperEligibleMarketData: row?.paperEligible === true,
      eligible: gates.every((gate) => gate.pass),
      failedGates: gates.filter((gate) => !gate.pass).map((gate) => gate.code),
      gates,
      metrics: {
        committeeScore,
        validationDataConfidence,
        riskScore,
        existingPositionNotionalEuro: Number(existingPositionNotionalEuro.toFixed(2)),
        notionalCapacityEuro: Number(notionalCapacityEuro.toFixed(2)),
      },
    };
  });

  return {
    diagnosticOnly: true,
    liveTradingAllowed: false,
    brokerConnectivityAllowed: false,
    thresholds: { minCommitteeScore, minValidationDataConfidence, maxRiskScore, minTcaProbeNotionalEuro },
    candidates: rows,
    executionEligibleSymbols: rows.filter((row) => row.paperEligibleMarketData).map((row) => row.symbol),
    eligibleSymbols: rows.filter((row) => row.eligible).map((row) => row.symbol),
  };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [approval, coverage, state, terminal, committee] = await Promise.all([
    readJson("data/paper-validation-approval.json"),
    readJson("data/execution-market-coverage.json"),
    readJson("data/paper-oms-state.json"),
    readJson("data/terminal-intelligence.json"),
    readJson("data/investment-committee.json"),
  ]);
  const report = explainPaperValidationCandidates({ approval, coverage, state, terminal, committee });
  for (const candidate of report.candidates.filter((row) => row.paperEligibleMarketData)) {
    const status = candidate.eligible ? "ELIGIBLE" : "BLOCKED";
    const reasons = candidate.failedGates.length ? candidate.failedGates.join(",") : "none";
    console.log(`PAPER candidate ${candidate.symbol}: ${status}; failed=${reasons}; committee=${candidate.metrics.committeeScore}; confidence=${candidate.metrics.validationDataConfidence}; risk=${candidate.metrics.riskScore}; capacityEUR=${candidate.metrics.notionalCapacityEuro}.`);
  }
  console.log(`Fenice PAPER candidate diagnostics: executionEligible=${report.executionEligibleSymbols.length}; probeEligible=${report.eligibleSymbols.length}; diagnosticOnly=true; liveTradingAllowed=false; brokerConnectivityAllowed=false.`);
}
