import { homedir } from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { collectDirectaLocalReadOnlySnapshot } from "../lib/brokers/directa-local-readonly.mjs";
import { writeJsonStateAtomic } from "../lib/trading/atomic-state-store.ts";
import { assessDirectaLocalSnapshotEvidence } from "../lib/ui/directa-local-snapshot-evidence.mjs";
import { reconcileDirectaLocalSnapshot } from "../lib/brokers/directa-local-reconciliation.mjs";

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
  let expectation;
  if(process.argv.includes("--expectations")){
    try{
      const file=readArg("--expectations");
      if(!file||file.startsWith("--"))throw Error("MISSING");
      const raw=await readFile(file,"utf8");
      if(Buffer.byteLength(raw)>1_000_000)throw Error("SIZE");
      expectation=JSON.parse(raw);
    }catch{throw Error("DIRECTA_EXPECTATION_FILE_INVALID");}
  }
  const snapshot = await collectDirectaLocalReadOnlySnapshot({
    host: "127.0.0.1",
    accountCode,
    tradingPort: port,
  });

  await writeJsonStateAtomic(outputPath, snapshot);
  const integrity = assessDirectaLocalSnapshotEvidence(snapshot);

  console.log("Fenice Directa read-only snapshot completed.");
  console.log("Connection: " + snapshot.connection.state + " (" + (snapshot.connection.healthy ? "healthy" : "not healthy") + ")");
  console.log("Snapshot integrity: " + integrity.state);
  console.log("Positions list: " + (snapshot.diagnostics.localReadOnly.stockListCompletion ?? "INCOMPLETE"));
  console.log("Orders list: " + (snapshot.diagnostics.localReadOnly.orderListCompletion ?? "INCOMPLETE"));
  console.log("Positions: " + integrity.positionsObserved);
  console.log("Orders observed: " + integrity.ordersObserved);
  console.log("Write commands blocked: " + snapshot.writeCommandsBlocked);
  console.log("Live trading allowed: " + snapshot.liveTradingAllowed);
  const reconciliation=expectation===undefined?null:reconcileDirectaLocalSnapshot({snapshot,expectation});
  console.log("Broker reconciliation verified: " + (reconciliation?.brokerReconciliationVerified===true));
  if(reconciliation){
    console.log("Reconciliation: " + reconciliation.state + "; break codes: " + reconciliation.breakCodes.join(", "));
    if(reconciliation.failures.length)console.error("Reconciliation blockers: " + reconciliation.failures.join(", "));
    if(!reconciliation.brokerReconciliationVerified)process.exitCode=2;
  }else console.log("Reconciliation not checked: supply the separate REAL account expectations with --expectations.");
  console.log("Individual executions reconciled: false; live readiness verified: false");
  if (!integrity.complete) console.error("Incomplete Directa local snapshot: " + integrity.failures.join(", "));
  if (snapshot.errors.length) console.error("Protocol error codes: " + [...new Set(snapshot.errors.map((item) => item.code ?? "UNKNOWN"))].join(", "));
  if (snapshot.diagnostics.localReadOnly.failures.length) console.error("Read sequence: " + snapshot.diagnostics.localReadOnly.failures.join(", "));
  console.log("Snapshot saved privately on this computer.");
  if (!integrity.complete) process.exitCode = 2;
} catch (error) {
  console.error("Fenice Directa read-only bridge failed:", error instanceof Error ? error.message : String(error));
  console.error("Verify that Darwin is open, the API service is enabled, and the local trading socket is available.");
  process.exitCode = 1;
}
