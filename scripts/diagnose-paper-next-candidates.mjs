// Read-only multi-market PAPER gate diagnosis. Never stages or fills orders.
import { readFileSync } from "node:fs";
const read = name => JSON.parse(readFileSync("data/" + name, "utf8"));
const coverage = read("execution-market-coverage.json");
const committee = read("investment-committee.json");
const terminal = read("terminal-intelligence.json");
const session = read("paper-market-session.json");
const approval = read("paper-next-approval.json");
const nowMs = Date.now();
const ageMinutes = time => {
  const ms = Date.parse(String(time ?? ""));
  return Number.isFinite(ms) && ms <= nowMs ? Math.round((nowMs - ms) / 60000) : null;
};
const bySymbol = new Map((coverage.rows ?? []).map(row => [String(row.symbol).toUpperCase(), row]));
const terminalBySymbol = new Map((terminal.assets ?? []).map(row => [String(row.symbol).toUpperCase(), row]));
const minScore = approval.minCommitteeScore;
const minConfidence = approval.minValidationDataConfidence;
const maxRisk = approval.maxRiskScore;
const decisions = (committee.topDecisions ?? []).map(item => {
  const symbol = String(item.symbol ?? "").toUpperCase();
  const market = bySymbol.get(symbol);
  const asset = terminalBySymbol.get(symbol);
  const score = Number(item.committeeScore);
  const decision = String(item.decision ?? "").toUpperCase();
  const terminalDecision = String(asset?.decision ?? "").toUpperCase();
  const rawConfidence = Number(item.rawConfidenceBeforeCalibration ?? item.confidence);
  const terminalConfidence = Number(asset?.confidence);
  const riskScore = Math.max(Number(item.riskScore ?? 100), Number(asset?.riskScore ?? 100));
  const reasons = [];
  if (!market?.paperEligible || Number(market.independentSourceFamilies) < 2)
    reasons.push("MARKET_DATA_QUORUM");
  if (!Number.isFinite(score) || score < minScore)
    reasons.push("COMMITTEE_SCORE");
  if (["ATTENDI", "EVITA"].includes(decision)) reasons.push("COMMITTEE_VETO");
  if (!["ACCUMULA", "MANTIENI", "OSSERVA"].includes(terminalDecision))
    reasons.push("TERMINAL_DECISION");
  if (!Number.isFinite(rawConfidence) || !Number.isFinite(terminalConfidence)
      || Math.min(rawConfidence, terminalConfidence) < minConfidence)
    reasons.push("DATA_CONFIDENCE");
  if (!Number.isFinite(riskScore) || riskScore > maxRisk)
    reasons.push("RISK_SCORE");
  return {symbol, score, decision, terminalDecision, independentSourceFamilies: market?.independentSourceFamilies ?? 0,
    paperEligible: market?.paperEligible === true, riskScore, reasons};
});
const blockers = {};
for (const row of decisions) for (const reason of row.reasons)
  blockers[reason] = (blockers[reason] ?? 0) + 1;
const evidenceAge = {
  coverageMinutes: ageMinutes(coverage.generatedAt),
  committeeMinutes: ageMinutes(committee.generatedAt),
  terminalMinutes: ageMinutes(terminal.generatedAt),
  sessionMinutes: ageMinutes(session.evidence?.observedAt),
};
const stale = evidenceAge.coverageMinutes === null || evidenceAge.coverageMinutes > 2
  || evidenceAge.sessionMinutes === null || evidenceAge.sessionMinutes > 2
  || evidenceAge.committeeMinutes === null || evidenceAge.committeeMinutes > 1440
  || evidenceAge.terminalMinutes === null || evidenceAge.terminalMinutes > 1440;
const output = {
  mode: "PAPER_GLOBAL_READ_ONLY", checkedAt: new Date(nowMs).toISOString(),
  sessionVenue: session.evidence?.venue ?? null, sessionStateAtEvidence: session.evidence?.state ?? null,
  evidenceAge, staleEvidence: stale,
  coverageEligible: coverage.paperEligibleSymbols, coverageTotal: coverage.rows?.length ?? 0,
  decisionsChecked: decisions.length, blockers,
  candidatesPassingStaticGates: decisions.filter(x => x.reasons.length === 0).map(x => x.symbol),
  actionableNow: false, // diagnostic never authorizes an order, even when evidence is fresh
  approvalGranted: approval.approved === true,
  decisions, liveTradingAllowed: false, brokerConnectivityAllowed: false,
};
console.log(JSON.stringify(output, null, 2));
