import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = path.join(root, "data", "latest-snapshot.json");
const sourceHealthPath = path.join(root, "data", "global-source-health.json");

const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
const health = JSON.parse(await readFile(sourceHealthPath, "utf8"));
const criticalFailures = new Set(Array.isArray(health?.critical?.failures) ? health.critical.failures : []);
const gate = String(health?.gate || "RED").toUpperCase();

snapshot.providers = Array.isArray(snapshot.providers) ? snapshot.providers : [];
snapshot.warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings : [];

for (const sourceId of criticalFailures) {
  const provider = snapshot.providers.find(item => String(item.id || "").toLowerCase() === String(sourceId).toLowerCase());
  if (provider) {
    provider.state = "errore";
    provider.detail = `Bloccata dal gate istituzionale: la fonte critica ${sourceId} non ha superato il controllo indipendente.`;
  }
}

let cap = 100;
if (gate === "AMBER") cap = 74;
if (gate === "RED") cap = 49;
const currentQuality = Number.isFinite(snapshot.dataQuality) ? snapshot.dataQuality : 0;
snapshot.dataQuality = Math.min(currentQuality, cap);
snapshot.pulse = snapshot.pulse || {};
snapshot.pulse.confidence = Math.min(Number.isFinite(snapshot.pulse.confidence) ? snapshot.pulse.confidence : snapshot.dataQuality, snapshot.dataQuality);
snapshot.mode = gate === "GREEN" && snapshot.dataQuality >= 75 ? "live" : snapshot.dataQuality >= 50 ? "partial" : "bootstrap";

snapshot.reliability = {
  ...(snapshot.reliability || {}),
  institutionalSourceScore: Number.isFinite(health?.qualityScore) ? health.qualityScore : 0,
  institutionalSourceGate: gate.toLowerCase(),
  criticalSourceFailures: [...criticalFailures],
  institutionalGateEnforcedAt: new Date().toISOString(),
};

snapshot.warnings = snapshot.warnings.filter(item => !String(item).startsWith("Institutional source gate"));
if (gate !== "GREEN") {
  snapshot.warnings.unshift(`Institutional source gate ${gate}: ${criticalFailures.size ? `criticità ${[...criticalFailures].join(", ")}` : "affidabilità insufficiente"}. Modalità live disabilitata.`);
}

await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`Institutional gate enforced: ${gate}; quality=${snapshot.dataQuality}; mode=${snapshot.mode}; failures=${[...criticalFailures].join(",") || "none"}`);
