import { readFile, writeFile } from "node:fs/promises";
import { verifyAuditChain } from "../lib/trading/audit-chain.ts";
import { calculateTransactionCosts } from "../lib/trading/tca.ts";

const campaignPath = "data/paper-validation-campaign.json";
const statePath = "data/paper-oms-state.json";
const campaign = JSON.parse(await readFile(campaignPath, "utf8"));
const state = JSON.parse(await readFile(statePath, "utf8"));

if (!campaign?.startedAt || !campaign?.baselineCommit) {
  throw new Error("PAPER_CAMPAIGN_NOT_STARTED: select a stable baseline before recording evidence.");
}
if (campaign.liveTradingAllowed !== false) {
  throw new Error("PAPER_CAMPAIGN_SAFETY: liveTradingAllowed must remain false.");
}
if (state?.mode !== "PAPER" || state?.liveTradingAllowed === true || state?.brokerConnectivityAllowed === true) {
  throw new Error("PAPER_CAMPAIGN_SAFETY: OMS must remain PAPER-only with broker writes disabled.");
}

const now = new Date();
const date = now.toISOString().slice(0, 10);
const executions = Array.isArray(state.executions) ? state.executions : [];
const paperFilled = executions.filter((item) => item?.status === "PAPER_FILLED").length;
const riskRejected = executions.filter((item) => item?.status === "RISK_REJECTED").length;
const positions = Array.isArray(state.positions) ? state.positions.length : 0;
const reconciliationBreaks = Array.isArray(state?.reconciliation?.breaks) ? state.reconciliation.breaks.length : 0;
const reconciliationBalanced = state?.reconciliation?.balanced === true && reconciliationBreaks === 0;
const audit = verifyAuditChain(Array.isArray(state.auditChain) ? state.auditChain : []);
const tca = calculateTransactionCosts(executions);
const existing = Array.isArray(campaign.dailyEvidence) ? campaign.dailyEvidence : [];
const row = {
  date,
  observedAt: now.toISOString(),
  paperCycles: 1,
  cumulativeExecutions: executions.length,
  cumulativePaperFilled: paperFilled,
  cumulativeRiskRejected: riskRejected,
  openPositions: positions,
  killSwitchEngaged: state?.killSwitch?.engaged === true,
  reconciliationBalanced,
  reconciliationBreaks,
  auditChainValid: audit.valid === true,
  auditChainEntries: Array.isArray(state.auditChain) ? state.auditChain.length : 0,
  consecutiveExecutionErrors: Number(state?.consecutiveExecutionErrors || 0),
  executionQuality: {
    fills: tca.fills,
    grossNotionalEuro: tca.grossNotionalEuro,
    totalFeesEuro: tca.totalFeesEuro,
    totalSlippageEuro: tca.totalSlippageEuro,
    implementationShortfallEuro: tca.implementationShortfallEuro,
    weightedSlippageBps: tca.weightedSlippageBps,
  },
  liveOrders: 0,
  liveTradingAllowed: false,
  brokerConnectivityAllowed: false,
};

const dailyEvidence = [...existing.filter((item) => item?.date !== date), row]
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));

await writeFile(campaignPath, `${JSON.stringify({ ...campaign, dailyEvidence }, null, 2)}\n`, "utf8");
console.log(`Fenice paper validation evidence recorded for ${date}; days=${dailyEvidence.length}, fills=${paperFilled}, reconciliation=${reconciliationBalanced ? "PASS" : "BREAK"}, audit=${audit.valid ? "PASS" : "FAIL"}, liveOrders=0.`);
