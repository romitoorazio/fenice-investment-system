import { homedir } from "node:os";
import path from "node:path";
import { collectDirectaReadOnlySnapshot } from "../lib/brokers/directa-readonly.ts";
import { writeJsonStateAtomic } from "../lib/trading/atomic-state-store.ts";

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const accountCode = readArg("--account") || process.env.DIRECTA_ACCOUNT_CODE || undefined;
const explicitPort = readArg("--port") || process.env.DIRECTA_TRADING_PORT || undefined;
const port = explicitPort ? Number(explicitPort) : undefined;

const outputDir = path.join(homedir(), ".fenice");
const outputPath = path.join(outputDir, "directa-readonly-snapshot.json");

try {
  const snapshot = await collectDirectaReadOnlySnapshot({
    host: "127.0.0.1",
    accountCode,
    tradingPort: port,
  });

  await writeJsonStateAtomic(outputPath, snapshot);

  console.log("Fenice Directa read-only snapshot completed.");
  console.log(`Connection: ${snapshot.connection.state} (${snapshot.connection.healthy ? "healthy" : "not healthy"})`);
  console.log(`Positions: ${snapshot.positions.length}`);
  console.log(`Orders observed: ${snapshot.orders.length}`);
  console.log(`Write commands blocked: ${snapshot.writeCommandsBlocked}`);
  console.log(`Live trading allowed: ${snapshot.liveTradingAllowed}`);
  console.log(`Snapshot saved atomically: ${outputPath}`);

  if (!snapshot.connection.healthy) process.exitCode = 2;
} catch (error) {
  console.error("Fenice Directa read-only bridge failed:", error instanceof Error ? error.message : String(error));
  console.error("Verify that Darwin is open, the API service is enabled, and the local trading socket is available.");
  process.exitCode = 1;
}
