import { readFile } from "node:fs/promises";

const governance = JSON.parse(await readFile(new URL("../data/decision-governance.json", import.meta.url), "utf8"));
const quality = JSON.parse(await readFile(new URL("../data/intelligence-quality.json", import.meta.url), "utf8"));

const failures = [];

if (governance?.guardrails?.blockAutonomousTrading !== true) {
  failures.push("decision-governance.guardrails.blockAutonomousTrading must remain true");
}
if (governance?.guardrails?.requireHumanConfirmation !== true) {
  failures.push("decision-governance.guardrails.requireHumanConfirmation must remain true");
}
if (!Array.isArray(governance?.prohibitedActions) || !governance.prohibitedActions.includes("inviare ordini")) {
  failures.push("decision-governance must explicitly prohibit sending orders");
}
if (!Array.isArray(governance?.prohibitedActions) || !governance.prohibitedActions.includes("collegarsi a broker")) {
  failures.push("decision-governance must explicitly prohibit broker connectivity");
}
if (quality?.policy?.autonomousTrading !== false) {
  failures.push("intelligence-quality.policy.autonomousTrading must remain false");
}

if (failures.length) {
  console.error("Fenice live-trading safety lock FAILED:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Fenice live-trading safety lock PASS.");
