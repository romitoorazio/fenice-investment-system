// FENICE100K research-only explanation. No scoring changes or broker actions.
const isNum = x => typeof x === "number" && Number.isFinite(x);
export function explainBuyConstraints(row, fresh) {
  if (!fresh || !row || !row.symbol) return { state:"UNAVAILABLE", reasons:["Comitato non aggiornato"], executionEligible:false };
  const rules = [
    ["PUNTEGGIO", row.committeeScore, 78, "minimum"],
    ["CONFIDENZA", row.confidence, 72, "minimum"],
    ["RISCHIO", row.riskScore, 58, "maximum"],
    ["VALUTAZIONE", row.scorecard?.valuation, 55, "minimum"],
  ];
  const reasons = [];
  for (const [key, value, limit, direction] of rules) {
    if (!isNum(value)) reasons.push(key + ": dato mancante");
    else if (direction === "minimum" && value < limit) reasons.push(key + ": " + value + ", soglia " + limit);
    else if (direction === "maximum" && value > limit) reasons.push(key + ": " + value + ", limite " + limit);
  }
  if (row.terminalDecision !== "ACCUMULA") reasons.push("Segnale tecnico diverso da ACCUMULA");
  if (row.valuation?.status === "disponibile" && (!isNum(row.valuation?.upsideBasePercent) || row.valuation.upsideBasePercent < -25)) reasons.push("DCF: sopravvalutazione o dato mancante");
  return { state:"RESEARCH_ONLY", symbol:row.symbol, currentDecision:row.decision, reasons, executionEligible:false, estimatedReturn:null };
}
