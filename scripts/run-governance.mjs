import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = path.join(root, "data", "latest-snapshot.json");
const governancePath = path.join(root, "data", "decision-governance.json");

function runIntelligence() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "run-intelligence.mjs")], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Intelligence exited with ${code}`))));
  });
}

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : undefined;

function median(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return undefined;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function computeRegime(snapshot) {
  const markets = Array.isArray(snapshot.markets) ? snapshot.markets : [];
  const macro = Array.isArray(snapshot.macro) ? snapshot.macro : [];
  const providers = Array.isArray(snapshot.providers) ? snapshot.providers : [];
  const pulse = snapshot.pulse || {};
  const intelligence = snapshot.intelligence || {};

  const changes = markets.map((item) => finite(item.changePercent)).filter(Number.isFinite);
  const positive = changes.filter((value) => value > 0).length;
  const breadth = changes.length ? (positive / changes.length) * 100 : 50;
  const medianChange = median(changes) ?? 0;
  const highRiskShare = markets.length
    ? (markets.filter((item) => finite(item.risk) >= 75).length / markets.length) * 100
    : 100;

  const vix = finite(macro.find((item) => item.id === "VIXCLS")?.value);
  const yieldCurve = finite(macro.find((item) => item.id === "T10Y2Y")?.value);
  const confidence = finite(intelligence.intelligenceConfidence ?? pulse.confidence) ?? 0;
  const operationalShare = providers.length
    ? (providers.filter((item) => item.state === "operativo").length / providers.length) * 100
    : 0;

  let stress = 45;
  stress += medianChange < -2 ? 20 : medianChange < -0.5 ? 9 : medianChange > 1.5 ? -10 : 0;
  stress += breadth < 30 ? 18 : breadth < 45 ? 8 : breadth > 65 ? -8 : 0;
  stress += highRiskShare > 65 ? 12 : highRiskShare > 45 ? 6 : 0;
  if (vix !== undefined) stress += vix > 30 ? 22 : vix > 24 ? 12 : vix < 16 ? -10 : 0;
  if (yieldCurve !== undefined && yieldCurve < 0) stress += 9;
  if (confidence < 45) stress += 14;
  else if (confidence < 65) stress += 6;
  if (operationalShare < 45) stress += 8;
  stress = Math.round(clamp(stress));

  let regime = "NEUTRALE";
  if (stress >= 75) regime = "DIFENSIVO";
  else if (stress >= 58) regime = "CAUTO";
  else if (stress <= 32 && breadth >= 55 && confidence >= 70) regime = "FAVOREVOLE";

  const maxSignalConfidence = confidence >= 80 ? 85 : confidence >= 65 ? 72 : confidence >= 50 ? 58 : 40;
  const maxSingleAssetWeight = regime === "DIFENSIVO" ? 5 : regime === "CAUTO" ? 8 : regime === "FAVOREVOLE" ? 15 : 10;
  const minIndependentSources = confidence >= 70 ? 2 : 3;

  return {
    generatedAt: new Date().toISOString(),
    regime,
    stressScore: stress,
    diagnostics: {
      marketBreadthPercent: Math.round(breadth),
      medianDailyChangePercent: Number(medianChange.toFixed(2)),
      highRiskInstrumentSharePercent: Math.round(highRiskShare),
      vix: vix ?? null,
      yieldCurve10y2y: yieldCurve ?? null,
      intelligenceConfidence: confidence,
      operationalSourceSharePercent: Math.round(operationalShare),
    },
    guardrails: {
      maxSignalConfidence,
      maxSingleAssetWeightPercent: maxSingleAssetWeight,
      minIndependentSources,
      requireHumanConfirmation: true,
      blockAutonomousTrading: true,
      blockSignalWhenDataDivergent: true,
      blockSignalWhenSourceStale: true,
    },
    permittedActions: regime === "DIFENSIVO"
      ? ["monitorare", "ridurre esposizione teorica", "verificare liquidità", "attendere conferme"]
      : regime === "CAUTO"
        ? ["monitorare", "valutare posizioni piccole", "richiedere conferma multi-fonte"]
        : ["monitorare", "valutare", "confrontare scenari", "richiedere conferma umana"],
    prohibitedActions: ["inviare ordini", "collegarsi a broker", "usare leva automaticamente", "considerare investibile un segnale da una sola fonte"],
  };
}

async function main() {
  await runIntelligence();
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  const governance = computeRegime(snapshot);

  snapshot.governance = governance;
  snapshot.executionPolicy = {
    ...(snapshot.executionPolicy || {}),
    autonomousAnalysis: true,
    autonomousTrading: false,
    humanConfirmationRequired: true,
    brokerConnectivityAllowed: false,
    leverageAutomationAllowed: false,
  };

  if (governance.regime === "DIFENSIVO") {
    snapshot.pulse = { ...(snapshot.pulse || {}), verdict: "PROTEGGERE CAPITALE" };
  } else if (governance.regime === "CAUTO" && snapshot.pulse?.verdict === "VALUTARE") {
    snapshot.pulse.verdict = "ATTENDERE";
  }

  const warning = `Regime Fenice: ${governance.regime} (stress ${governance.stressScore}/100).`;
  snapshot.warnings = [...new Set([warning, ...(snapshot.warnings || [])])].slice(0, 40);

  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await writeFile(governancePath, `${JSON.stringify(governance, null, 2)}\n`, "utf8");
  console.log(`Fenice governance completed: ${governance.regime}, stress ${governance.stressScore}/100.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
