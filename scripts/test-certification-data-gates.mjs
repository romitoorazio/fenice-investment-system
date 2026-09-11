import { readFile } from "node:fs/promises";

const readJson = async path => JSON.parse(await readFile(path, "utf8"));
const failures = [];
const requireGate = (condition, message) => { if (!condition) failures.push(message); };

const sourceHealth = await readJson("data/global-source-health.json");
const intelligence = await readJson("data/intelligence-quality.json");
const governance = await readJson("data/decision-governance.json");

requireGate(sourceHealth.gate === "GREEN", `critical source gate is ${sourceHealth.gate || "missing"}`);
requireGate(sourceHealth.critical?.gate === "GREEN", `critical institutional gate is ${sourceHealth.critical?.gate || "missing"}`);
requireGate((sourceHealth.critical?.failures || []).length === 0, `critical source failures: ${(sourceHealth.critical?.failures || []).join(", ")}`);
requireGate(Number(sourceHealth.qualityScore) >= 90, `source quality ${sourceHealth.qualityScore ?? "missing"}/100 < 90`);

requireGate(Number(intelligence.intelligenceConfidence) >= 80, `intelligence confidence ${intelligence.intelligenceConfidence ?? "missing"}/100 < 80`);
requireGate(Number(intelligence.crossSourceValidation?.checked) > 0, "cross-source validation has no completed checks");
requireGate(Number(intelligence.coverage?.sourceConcentrationPercent) <= 70, `source concentration ${intelligence.coverage?.sourceConcentrationPercent ?? "missing"}% > 70%`);
requireGate(Array.isArray(intelligence.coverage?.assetClasses) && intelligence.coverage.assetClasses.length >= 4,
  `scanner breadth insufficient: ${(intelligence.coverage?.assetClasses || []).join(", ") || "no asset classes"}`);
requireGate(intelligence.policy?.autonomousTrading === false, "autonomous/live trading must remain disabled");

const serializedHealth = JSON.stringify(sourceHealth);
requireGate(!/[?&](?:api_key|apikey|key|token|access_token)=(?!REDACTED(?:[&"\\]|$))[^&"\\]+/i.test(serializedHealth),
  "generated source-health data contains an unredacted credential-like query parameter");

const forbiddenGovernance = [
  governance.liveTradingEnabled,
  governance.autonomousTrading,
  governance.brokerConnected,
].filter(Boolean);
requireGate(forbiddenGovernance.length === 0, "decision governance enables live/autonomous/broker execution");

if (failures.length) {
  console.error("Fenice certification data gates FAILED:");
  failures.forEach(item => console.error(` - ${item}`));
  process.exit(1);
}

console.log("Fenice certification data gates PASSED (paper-only, fail-closed).");
