// Read-only diagnosis of why current global candidates cannot pass PAPER gates.
// Does not change committee decisions, market evidence, or approval thresholds.
import { readFileSync } from "node:fs";
const read = name => JSON.parse(readFileSync("data/" + name, "utf8"));
const coverage = read("execution-market-coverage.json");
const committee = read("investment-committee.json");
const bySymbol = new Map((coverage.rows ?? []).map(row => [String(row.symbol).toUpperCase(), row]));
const minCommitteeScore = 70;
const decisions = (committee.topDecisions ?? []).map(item => {
  const symbol = String(item.symbol ?? "").toUpperCase();
  const market = bySymbol.get(symbol);
  const score = Number(item.committeeScore);
  const decision = String(item.decision ?? "").toUpperCase();
  const reasons = [];
  if (!market?.paperEligible || Number(market.independentSourceFamilies) < 2)
    reasons.push("MARKET_DATA_QUORUM");
  if (!Number.isFinite(score) || score < minCommitteeScore)
    reasons.push("COMMITTEE_SCORE");
  if (["ATTENDI", "EVITA"].includes(decision))
    reasons.push("COMMITTEE_VETO");
  return { symbol, score, decision, independentSourceFamilies: market?.independentSourceFamilies ?? 0,
    paperEligible: market?.paperEligible === true, reasons };
});
const counts = {};
for (const row of decisions) for (const reason of row.reasons) counts[reason] = (counts[reason] ?? 0) + 1;
const output = {
  mode: "PAPER_GLOBAL_READ_ONLY", coverageGeneratedAt: coverage.generatedAt,
  committeeGeneratedAt: committee.generatedAt,
  coverageEligible: coverage.paperEligibleSymbols,
  decisionsChecked: decisions.length, blockers: counts,
  candidatesPassingTheseThreeGates: decisions.filter(x => x.reasons.length === 0).map(x => x.symbol),
  decisions, liveTradingAllowed: false, brokerConnectivityAllowed: false,
};
console.log(JSON.stringify(output, null, 2));
