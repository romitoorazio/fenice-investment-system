import { appendFile, readFile, writeFile } from "node:fs/promises";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const pct = (value, target) => target > 0 ? Math.min(100, Math.round((value / target) * 1000) / 10) : 100;
const utcDay = (value) => {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
};

const [campaign, oms, approval, ledger] = await Promise.all([
  readJson("data/paper-validation-campaign.json"),
  readJson("data/paper-oms-state.json"),
  readJson("data/paper-validation-approval.json"),
  readJson("data/decision-ledger.json"),
]);

const now = Date.now();
const today = new Date(now).toISOString().slice(0, 10);
const evidence = Array.isArray(campaign.dailyEvidence) ? [...campaign.dailyEvidence] : [];
const sortedEvidence = evidence.sort((a, b) => String(a?.date || "").localeCompare(String(b?.date || "")));
const latest = sortedEvidence.at(-1) || null;
const evidenceDates = sortedEvidence.map((row) => String(row?.date || "")).filter(Boolean);
const uniqueEvidenceDates = [...new Set(evidenceDates)];
const duplicateEvidenceDates = [...new Set(evidenceDates.filter((date, index) => evidenceDates.indexOf(date) !== index))];
const futureEvidenceDates = uniqueEvidenceDates.filter((date) => date > today);

const baselineDigest = String(campaign?.baselineFingerprint?.digest || "");
const evidenceFingerprintDrift = sortedEvidence
  .filter((row) => String(row?.validationFingerprint?.digest || "") !== baselineDigest)
  .map((row) => ({ date: row.date || null, digest: row?.validationFingerprint?.digest || null }));

const executions = Array.isArray(oms.executions) ? oms.executions : [];
const prefix = String(approval?.idPrefix || "fenice-paper-validation-");
const validationExecutions = executions.filter((row) => {
  const id = String(row?.clientOrderId || "");
  return row?.validationProbe === true || id.startsWith(prefix) || id.startsWith("fenice-paper-validation-");
});
const probesPerDay = new Map();
for (const row of validationExecutions) {
  const date = utcDay(row?.filledAt || row?.createdAt);
  if (!date) continue;
  probesPerDay.set(date, (probesPerDay.get(date) || 0) + 1);
}
const duplicateProbeDays = [...probesPerDay.entries()]
  .filter(([, count]) => count > 1)
  .map(([date, count]) => ({ date, count }));

const requiredDays = finite(campaign.requiredDays, 30);
const minEvidenceDays = finite(campaign.minEvidenceDays, 25);
const minPaperFills = finite(campaign.minPaperFills, 10);
const evidenceDays = uniqueEvidenceDates.length;
const cumulativePaperFills = latest
  ? finite(latest.cumulativePaperFilled, validationExecutions.filter((row) => row?.status === "PAPER_FILLED").length)
  : validationExecutions.filter((row) => row?.status === "PAPER_FILLED").length;
const elapsedDays = campaign.startedAt
  ? Math.max(0, Math.floor((now - Date.parse(campaign.startedAt)) / 86_400_000) + 1)
  : 0;

// Keep these thresholds exactly aligned with check-certification-readiness.mjs.
const historicalThresholds = {
  records: 100,
  markedRecords: 75,
  checkpoint7d: 30,
  checkpoint30d: 10,
  decisionClasses: 3,
};
const records = Array.isArray(ledger?.records) ? ledger.records : [];
const markedRecords = records.filter((record) => Number.isFinite(record?.entryReferencePrice)
  && Number.isFinite(record?.lastPrice)
  && record?.lastMarkedAt);
const checkpoint7d = markedRecords.filter((record) => record?.checkpoints?.["7d"]?.measuredAt).length;
const checkpoint30d = markedRecords.filter((record) => record?.checkpoints?.["30d"]?.measuredAt).length;
const decisionClasses = new Set(markedRecords.map((record) => record?.decision).filter(Boolean));
const unsafeExecutionEvidence = records.some((record) => /live|broker|ordine inviato|executed/i.test(String(record?.executionGate || "")));
const historicalPaperEvidence = records.length >= historicalThresholds.records
  && markedRecords.length >= historicalThresholds.markedRecords
  && checkpoint7d >= historicalThresholds.checkpoint7d
  && checkpoint30d >= historicalThresholds.checkpoint30d
  && decisionClasses.size >= historicalThresholds.decisionClasses
  && !unsafeExecutionEvidence;

const safetyIssues = [];
const active = Boolean(
  campaign?.version === 6
  && campaign?.startedAt
  && campaign?.baselineCommit
  && campaign?.baselineFingerprint?.complete === true
  && baselineDigest
);
if (!active) safetyIssues.push("V6 campaign baseline is not active/complete");
if (campaign?.baselineFingerprint?.algorithm !== "sha256") safetyIssues.push("baseline fingerprint algorithm is not sha256");
if (campaign?.liveTradingAllowed !== false) safetyIssues.push("campaign LIVE lock is not closed");
if (oms?.mode !== "PAPER") safetyIssues.push(`OMS mode is ${String(oms?.mode || "UNKNOWN")}, expected PAPER`);
if (oms?.liveTradingAllowed !== false) safetyIssues.push("OMS LIVE lock is not closed");
if (oms?.brokerConnectivityAllowed !== false) safetyIssues.push("broker connectivity is not explicitly disabled");
if (duplicateEvidenceDates.length) safetyIssues.push(`duplicate evidence dates: ${duplicateEvidenceDates.join(", ")}`);
if (futureEvidenceDates.length) safetyIssues.push(`future-dated evidence: ${futureEvidenceDates.join(", ")}`);
if (evidenceFingerprintDrift.length) safetyIssues.push(`validation fingerprint drift on ${evidenceFingerprintDrift.map((row) => row.date).join(", ")}`);
if (duplicateProbeDays.length) safetyIssues.push(`more than one validation probe on ${duplicateProbeDays.map((row) => `${row.date}(${row.count})`).join(", ")}`);
if (latest?.killSwitchEngaged === true) safetyIssues.push("kill switch is engaged in latest evidence");
if (latest && latest?.reconciliationBalanced !== true) safetyIssues.push("latest reconciliation is not balanced");
if (latest && latest?.auditChainValid !== true) safetyIssues.push("latest audit chain is not valid");
if (finite(latest?.liveOrders, 0) !== 0) safetyIssues.push("latest evidence reports live orders");
if (latest?.liveTradingAllowed !== false) safetyIssues.push("latest evidence LIVE lock is not closed");
if (latest?.brokerConnectivityAllowed !== false) safetyIssues.push("latest evidence broker connectivity is not disabled");
if (finite(latest?.newPaperFills, 0) > 0 && latest?.fillEvidenceProof?.complete !== true) {
  safetyIssues.push("latest fill evidence proof is incomplete");
}

const campaignBlockers = [];
if (elapsedDays < requiredDays) campaignBlockers.push(`calendar duration ${elapsedDays}/${requiredDays}`);
if (evidenceDays < minEvidenceDays) campaignBlockers.push(`evidence days ${evidenceDays}/${minEvidenceDays}`);
if (cumulativePaperFills < minPaperFills) campaignBlockers.push(`PAPER fills ${cumulativePaperFills}/${minPaperFills}`);
if (latest?.executionQuality?.state === "INSUFFICIENT") campaignBlockers.push("execution-quality sample still insufficient");

const historicalBlockers = [];
if (records.length < historicalThresholds.records) historicalBlockers.push(`historical records ${records.length}/${historicalThresholds.records}`);
if (markedRecords.length < historicalThresholds.markedRecords) historicalBlockers.push(`marked records ${markedRecords.length}/${historicalThresholds.markedRecords}`);
if (checkpoint7d < historicalThresholds.checkpoint7d) historicalBlockers.push(`7d checkpoints ${checkpoint7d}/${historicalThresholds.checkpoint7d}`);
if (checkpoint30d < historicalThresholds.checkpoint30d) historicalBlockers.push(`30d checkpoints ${checkpoint30d}/${historicalThresholds.checkpoint30d}`);
if (decisionClasses.size < historicalThresholds.decisionClasses) historicalBlockers.push(`decision classes ${decisionClasses.size}/${historicalThresholds.decisionClasses}`);
if (unsafeExecutionEvidence) historicalBlockers.push("historical ledger contains execution-gate text excluded by the certification checker");

const report = {
  generatedAt: new Date(now).toISOString(),
  state: safetyIssues.length ? "SAFETY_ALERT" : "HEALTHY_VALIDATING",
  campaign: {
    version: campaign.version,
    startedAt: campaign.startedAt || null,
    baselineCommit: campaign.baselineCommit || null,
    baselineFingerprintDigest: baselineDigest || null,
    elapsedDays,
    requiredDays,
    evidenceDays,
    minEvidenceDays,
    evidenceProgressPercent: pct(evidenceDays, minEvidenceDays),
    paperFills: cumulativePaperFills,
    minPaperFills,
    fillProgressPercent: pct(cumulativePaperFills, minPaperFills),
  },
  historicalCertification: {
    ready: historicalPaperEvidence,
    thresholds: historicalThresholds,
    records: records.length,
    markedRecords: markedRecords.length,
    checkpoint7d,
    checkpoint30d,
    decisionClasses: [...decisionClasses].sort(),
    decisionClassCount: decisionClasses.size,
    unsafeExecutionEvidence,
    progress: {
      recordsPercent: pct(records.length, historicalThresholds.records),
      markedRecordsPercent: pct(markedRecords.length, historicalThresholds.markedRecords),
      checkpoint7dPercent: pct(checkpoint7d, historicalThresholds.checkpoint7d),
      checkpoint30dPercent: pct(checkpoint30d, historicalThresholds.checkpoint30d),
      decisionClassesPercent: pct(decisionClasses.size, historicalThresholds.decisionClasses),
    },
    blockers: historicalBlockers,
  },
  latestEvidence: latest ? {
    date: latest.date || null,
    observedAt: latest.observedAt || null,
    paperEligibleSymbols: latest?.executionMarketCoverage?.paperEligibleSymbols ?? null,
    requestedSymbols: latest?.executionMarketCoverage?.requestedSymbols ?? null,
    paperEligiblePercent: latest?.executionMarketCoverage?.paperEligiblePercent ?? null,
    paperSourceFamilies: latest?.executionMarketCoverage?.paperEligibleSourceFamilies ?? null,
    intelligenceConfidence: latest?.decisionDataGate?.confidence ?? null,
    crossChecks: latest?.decisionDataGate?.crossChecks ?? null,
    divergent: latest?.decisionDataGate?.divergent ?? null,
    executionQualityState: latest?.executionQuality?.state ?? null,
    executionQualityFills: latest?.executionQuality?.fills ?? null,
    reconciliationBalanced: latest?.reconciliationBalanced ?? null,
    auditChainValid: latest?.auditChainValid ?? null,
  } : null,
  safety: {
    liveTradingAllowed: campaign?.liveTradingAllowed ?? null,
    omsMode: oms?.mode ?? null,
    omsLiveTradingAllowed: oms?.liveTradingAllowed ?? null,
    brokerConnectivityAllowed: oms?.brokerConnectivityAllowed ?? null,
    duplicateEvidenceDates,
    futureEvidenceDates,
    evidenceFingerprintDrift,
    duplicateProbeDays,
    issues: safetyIssues,
  },
  maturityBlockers: {
    campaign: campaignBlockers,
    historicalCertification: historicalBlockers,
  },
};

const reportJson = `${JSON.stringify(report, null, 2)}\n`;
console.log(reportJson.trimEnd());

if (process.env.FENICE_OBSERVER_REPORT_PATH) {
  await writeFile(process.env.FENICE_OBSERVER_REPORT_PATH, reportJson, "utf8");
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const latestQuality = latest?.executionQuality?.state || "N/A";
  const rows = [
    "# Fenice PAPER V6 Campaign Observer",
    "",
    `**State:** ${report.state}`,
    `**Started:** ${campaign.startedAt || "not started"}`,
    `**Baseline:** ${String(campaign.baselineCommit || "N/A").slice(0, 12)} · fingerprint ${baselineDigest ? baselineDigest.slice(0, 16) : "N/A"}`,
    "",
    "## V6 campaign",
    "",
    "| Metric | Progress |",
    "| --- | ---: |",
    `| Calendar | ${elapsedDays}/${requiredDays} days |`,
    `| Valid evidence | ${evidenceDays}/${minEvidenceDays} days (${report.campaign.evidenceProgressPercent}%) |`,
    `| PAPER fills | ${cumulativePaperFills}/${minPaperFills} (${report.campaign.fillProgressPercent}%) |`,
    `| Execution quality | ${latestQuality} |`,
    `| LIVE allowed | ${String(campaign?.liveTradingAllowed)} |`,
    `| Broker connectivity | ${String(oms?.brokerConnectivityAllowed)} |`,
    "",
    "## Historical certification evidence",
    "",
    "| Metric | Progress |",
    "| --- | ---: |",
    `| Ledger records | ${records.length}/${historicalThresholds.records} |`,
    `| Marked records | ${markedRecords.length}/${historicalThresholds.markedRecords} |`,
    `| 7d checkpoints | ${checkpoint7d}/${historicalThresholds.checkpoint7d} |`,
    `| 30d checkpoints | ${checkpoint30d}/${historicalThresholds.checkpoint30d} |`,
    `| Decision classes | ${decisionClasses.size}/${historicalThresholds.decisionClasses} |`,
    `| Historical gate | ${historicalPaperEvidence ? "PASS" : "NOT_VALIDATED"} |`,
    "",
    `**Campaign blockers:** ${campaignBlockers.length ? campaignBlockers.join("; ") : "none"}`,
    `**Historical blockers:** ${historicalBlockers.length ? historicalBlockers.join("; ") : "none"}`,
    `**Safety issues:** ${safetyIssues.length ? safetyIssues.join("; ") : "none"}`,
    "",
    "This observer is read-only with respect to the repository. It does not stage orders, call brokers, mutate evidence, or alter certification thresholds.",
  ];
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${rows.join("\n")}\n`);
}

if (safetyIssues.length) process.exitCode = 1;
