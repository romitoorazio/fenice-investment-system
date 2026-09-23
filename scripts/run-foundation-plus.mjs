import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recoverOptionalIntelligenceSources } from "../lib/intelligence/optional-source-recovery.mjs";
import { collectPublicMarkets } from "./collect-public-markets.mjs";
import { collectInstitutionalSignals } from "./collect-institutional-signals.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = path.join(root, "data", "latest-snapshot.json");
const healthPath = path.join(root, "data", "source-health.json");

function runBaseFoundation() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, "scripts", "run-foundation.mjs")], {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`Foundation exited with ${code}`))));
  });
}

async function main() {
  await runBaseFoundation();
  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  let healthDocument = { generatedAt: new Date().toISOString(), job: process.env.FENICE_JOB || "daily", sources: [] };
  try {
    healthDocument = JSON.parse(await readFile(healthPath, "utf8"));
  } catch {}

  // Keep collectors sequential because both mutate provider/source-health arrays.
  // Institutional sources remain independent context and are never promoted to
  // execution-grade market data by this stage.
  await collectPublicMarkets(snapshot, healthDocument.sources);
  await collectInstitutionalSignals(snapshot, healthDocument.sources);

  // Optional-provider recovery never weakens critical gates. It only retries
  // GDELT with bounded lighter queries and distinguishes missing FINRA Public
  // OAuth credentials from an actual provider outage. Recovered sources remain
  // intelligence/context sources and are never promoted to execution evidence.
  const optionalRecovery = await recoverOptionalIntelligenceSources(snapshot, healthDocument.sources);

  snapshot.providers.sort((a, b) => a.name.localeCompare(b.name));
  snapshot.markets.sort((a, b) => (b.score || 0) - (a.score || 0));
  snapshot.foundation = {
    ...(snapshot.foundation || {}),
    version: Math.max(4, Number(snapshot.foundation?.version || 0)),
    resilientMarketFallbacks: true,
    institutionalSourceDiversity: true,
    optionalSourceRecovery: {
      gdelt: optionalRecovery.gdelt,
      finra: optionalRecovery.finra,
    },
    sourceHealth: {
      healthy: healthDocument.sources.filter((item) => item.status === "healthy").length,
      total: healthDocument.sources.length,
    },
  };
  snapshot.headline = `${snapshot.markets.length} strumenti, ${snapshot.discoveries.length} segnali, ${snapshot.macro.length} indicatori e ${snapshot.providers.length} fonti controllate.`;

  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  healthDocument.generatedAt = new Date().toISOString();
  await writeFile(healthPath, `${JSON.stringify(healthDocument, null, 2)}\n`, "utf8");
  console.log(`Fenice Foundation Plus completed: ${snapshot.headline}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
