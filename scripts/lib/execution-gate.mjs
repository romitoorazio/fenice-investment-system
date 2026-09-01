export function evaluateExecutionGate({ dataQuality, sourceGate, buyCandidateCount, governance }) {
  const normalizedGate = String(sourceGate || "UNKNOWN").toUpperCase();
  const quality = Number(dataQuality);
  const governanceSafe = governance?.guardrails?.blockAutonomousTrading === true
    && governance?.guardrails?.requireHumanConfirmation === true;

  if (!governanceSafe) return "BLOCCATO";
  if (!Number.isFinite(quality) || quality < 75) return "BLOCCATO";
  if (normalizedGate !== "GREEN") return "BLOCCATO";
  return Number(buyCandidateCount) > 0 ? "PRONTO_CON_CONFERMA" : "ATTENDERE";
}

export function liveTradingMustRemainBlocked(governance) {
  return governance?.guardrails?.blockAutonomousTrading === true
    && governance?.guardrails?.requireHumanConfirmation === true;
}
