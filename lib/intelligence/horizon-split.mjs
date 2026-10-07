const finite = (value) => Number.isFinite(Number(value));
const upper = (value) => String(value ?? "").trim().toUpperCase();
const asArray = (value) => Array.isArray(value) ? value : [];

const round = (value, digits = 2) => {
  if (!finite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
};

function isDeepOvervaluation(candidate) {
  const status = String(candidate?.valuation?.status || "").toLowerCase();
  const upside = Number(candidate?.valuation?.upsideBasePercent);
  return status === "disponibile" && finite(upside) && upside < -25;
}

function biasEvidence(decisionOutcomes) {
  const seven = decisionOutcomes?.horizons?.["7d"]?.restraintTradeoff || {};
  const thirty = decisionOutcomes?.horizons?.["30d"]?.restraintTradeoff || {};
  const sevenMature = Number(seven.sampleSize || 0) >= 30;
  const thirtyMature = Number(thirty.sampleSize || 0) >= 30;
  return {
    sevenDay: {
      sampleSize: Number(seven.sampleSize || 0),
      biasState: seven.biasState || "INSUFFICIENT",
      netPerDecisionPercent: finite(seven.netProtectionMinusMissedPerDecisionPercent)
        ? Number(seven.netProtectionMinusMissedPerDecisionPercent)
        : null,
      mature: sevenMature,
    },
    thirtyDay: {
      sampleSize: Number(thirty.sampleSize || 0),
      biasState: thirty.biasState || "INSUFFICIENT",
      netPerDecisionPercent: finite(thirty.netProtectionMinusMissedPerDecisionPercent)
        ? Number(thirty.netProtectionMinusMissedPerDecisionPercent)
        : null,
      mature: thirtyMature,
    },
    tooCautiousMediumTerm:
      (sevenMature && seven.biasState === "TOO_CAUTIOUS")
      || (thirtyMature && thirty.biasState === "TOO_CAUTIOUS"),
  };
}

function regimeEvidence(committee, regimeAccuracy) {
  const regime = upper(committee?.marketRegime);
  const one = regimeAccuracy?.horizons?.["1session"]?.byRegime?.[regime] || {};
  const five = regimeAccuracy?.horizons?.["5sessions"]?.byRegime?.[regime] || {};
  return {
    regime,
    oneSession: {
      sampleSize: Number(one.sampleSize || 0),
      utilityRatePercent: finite(one.utilityRatePercent) ? Number(one.utilityRatePercent) : null,
    },
    fiveSessions: {
      sampleSize: Number(five.sampleSize || 0),
      utilityRatePercent: finite(five.utilityRatePercent) ? Number(five.utilityRatePercent) : null,
    },
  };
}

function tacticalState(candidate, regime) {
  const decision = upper(candidate?.decision);
  if (decision === "EVITA") return "EVITA";
  if (decision === "COMPRA") return "SEGUI_COMITATO";
  if (regime === "PROTEGGERE CAPITALE") return "ATTENDERE";
  if (regime === "ATTENDERE") return "ATTENDERE";
  if (regime === "VALUTARE" && upper(candidate?.terminalDecision) === "ACCUMULA") return "VALUTA";
  return decision || "ATTENDERE";
}

function strategicBlockers(candidate, globalEvidence) {
  const blockers = [];
  const decision = upper(candidate?.decision);
  const terminalDecision = upper(candidate?.terminalDecision);
  const score = Number(candidate?.committeeScore);
  const rawConfidence = Number(candidate?.rawConfidenceBeforeCalibration ?? candidate?.confidence);
  const risk = Number(candidate?.riskScore);
  const positionType = upper(candidate?.positionType);

  if (!["OSSERVA", "ATTENDI"].includes(decision)) blockers.push("CURRENT_DECISION_NOT_WAITING");
  if (terminalDecision !== "ACCUMULA") blockers.push("TERMINAL_NOT_ACCUMULA");
  if (!finite(score) || score < 68) blockers.push("COMMITTEE_SCORE_BELOW_68");
  if (!finite(rawConfidence) || rawConfidence < 90) blockers.push("RAW_CONFIDENCE_BELOW_90");
  if (!finite(risk) || risk > 58) blockers.push("RISK_ABOVE_58");
  if (!["CORE", "GROWTH"].includes(positionType)) blockers.push("POSITION_CLASS_NOT_CORE_GROWTH");
  if (isDeepOvervaluation(candidate)) blockers.push("DEEP_OVERVALUATION");
  if (!globalEvidence.bias.tooCautiousMediumTerm) blockers.push("MEDIUM_TERM_CAUTION_NOT_CONFIRMED");
  if (upper(globalEvidence.sourceGate) !== "GREEN") blockers.push("SOURCE_GATE_NOT_GREEN");
  if (!finite(globalEvidence.dataQuality) || Number(globalEvidence.dataQuality) < 90) blockers.push("DATA_QUALITY_BELOW_90");

  return [...new Set(blockers)];
}

function strategicState(candidate, blockers) {
  if (blockers.length === 0) return "ACCUMULA_A_TRANCHE_SHADOW";
  const severe = blockers.some((code) => [
    "DEEP_OVERVALUATION",
    "RISK_ABOVE_58",
    "TERMINAL_NOT_ACCUMULA",
    "POSITION_CLASS_NOT_CORE_GROWTH",
  ].includes(code));
  if (!severe && upper(candidate?.terminalDecision) === "ACCUMULA") return "WATCHLIST_STRATEGICA";
  return "NESSUNA_AZIONE_STRATEGICA";
}

export function buildV7HorizonSplit({
  committee,
  decisionOutcomes,
  regimeAccuracy,
} = {}) {
  const bias = biasEvidence(decisionOutcomes);
  const regime = regimeEvidence(committee, regimeAccuracy);
  const globalEvidence = {
    marketRegime: upper(committee?.marketRegime) || null,
    sourceGate: upper(committee?.sourceGate) || null,
    dataQuality: finite(committee?.dataQuality) ? Number(committee.dataQuality) : null,
    bias,
    regime,
  };

  const rows = asArray(committee?.allDecisions).map((candidate) => {
    const blockers = strategicBlockers(candidate, globalEvidence);
    const tactical = tacticalState(candidate, globalEvidence.marketRegime);
    const strategic = strategicState(candidate, blockers);

    return {
      rank: finite(candidate?.rank) ? Number(candidate.rank) : null,
      symbol: upper(candidate?.symbol),
      name: candidate?.name ?? null,
      positionType: candidate?.positionType ?? null,
      currentDecision: upper(candidate?.decision) || null,
      terminalDecision: upper(candidate?.terminalDecision) || null,
      committeeScore: finite(candidate?.committeeScore) ? Number(candidate.committeeScore) : null,
      calibratedConfidence: finite(candidate?.confidence) ? Number(candidate.confidence) : null,
      rawConfidence: finite(candidate?.rawConfidenceBeforeCalibration)
        ? Number(candidate.rawConfidenceBeforeCalibration)
        : finite(candidate?.confidence) ? Number(candidate.confidence) : null,
      riskScore: finite(candidate?.riskScore) ? Number(candidate.riskScore) : null,
      valuationScore: finite(candidate?.scorecard?.valuation) ? Number(candidate.scorecard.valuation) : null,
      deepOvervaluation: isDeepOvervaluation(candidate),
      tactical: {
        horizon: "1-5 sessions",
        state: tactical,
        rationale: globalEvidence.marketRegime === "ATTENDERE"
          ? "Regime corrente prudente: il motore non anticipa il Comitato nel brevissimo."
          : "Stato tattico derivato dal regime corrente e dalla decisione del Comitato.",
      },
      strategic: {
        horizon: "7-30 days",
        state: strategic,
        structurallyEligible: blockers.length === 0,
        blockers,
        researchTranchePlan: strategic === "ACCUMULA_A_TRANCHE_SHADOW"
          ? {
              trancheCount: 3,
              horizonDays: 30,
              notionalEuro: null,
              orderCreationAllowed: false,
              purpose: "Research-only staged-entry hypothesis; never an order or PAPER certification event.",
            }
          : null,
      },
      safety: {
        diagnosticOnly: true,
        queueWritesAllowed: false,
        paperCertificationEvidenceMutationAllowed: false,
        brokerSubmissionAllowed: false,
        liveTradingAllowed: false,
      },
    };
  }).sort((a, b) =>
    Number(b.strategic.structurallyEligible) - Number(a.strategic.structurallyEligible)
    || (b.committeeScore ?? -1) - (a.committeeScore ?? -1)
    || (a.rank ?? 999) - (b.rank ?? 999)
    || a.symbol.localeCompare(b.symbol)
  );

  const shadow = rows.filter((row) => row.strategic.state === "ACCUMULA_A_TRANCHE_SHADOW");

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    purpose: "V7 diagnostic horizon split: preserve short-term caution while testing medium-term staged accumulation hypotheses.",
    safety: {
      diagnosticOnly: true,
      modifiesV6DecisionPolicy: false,
      queueWritesAllowed: false,
      paperCertificationEvidenceMutationAllowed: false,
      brokerSubmissionAllowed: false,
      liveTradingAllowed: false,
      feedsProposalReadiness: false,
    },
    methodology: {
      tacticalHorizon: "1-5 sessions",
      strategicHorizon: "7-30 days",
      strategicMinimumCommitteeScore: 68,
      strategicMinimumRawConfidence: 90,
      strategicMaximumRiskScore: 58,
      strategicRequiresTerminalAccumula: true,
      strategicRequiresMediumTermTooCautiousEvidence: true,
      strategicRequiresGreenSourceGate: true,
      strategicMinimumDataQuality: 90,
      deepOvervaluationBlocksStrategicAccumulation: true,
    },
    evidence: globalEvidence,
    candidateCount: rows.length,
    strategicShadowCount: shadow.length,
    strategicShadowSymbols: shadow.map((row) => row.symbol),
    rows,
  };
}
