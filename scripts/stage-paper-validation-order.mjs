import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPaperValidationProbe } from "./paper-validation-stager.mjs";
import { reservePaperValidationFillCap } from "./paper-validation-fill-cap.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "data");

async function readJson(name, fallback = null) {
  try {
    return JSON.parse(await readFile(path.join(dataDir, name), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

const [campaign, approval, marketSession, coverage, state, queue, terminal, committee] = await Promise.all([
  readJson("paper-validation-campaign.json", {}),
  readJson("paper-validation-approval.json", {}),
  readJson("paper-market-session.json", {}),
  readJson("execution-market-coverage.json", {}),
  readJson("paper-oms-state.json", {}),
  readJson("paper-order-queue.json", { version: 1, mode: "PAPER", orders: [] }),
  readJson("terminal-intelligence.json", {}),
  readJson("investment-committee.json", {}),
]);

const stagedResult = buildPaperValidationProbe({
  campaign,
  approval,
  marketSession,
  coverage,
  state,
  queue,
  terminal,
  committee,
});
const result = reservePaperValidationFillCap(stagedResult, approval);

if (!result.staged) {
  console.log(`Fenice PAPER validation stager: NO_ORDER reason=${result.reason}; liveTradingAllowed=false.`);
  process.exit(0);
}

await writeFile(path.join(dataDir, "paper-order-queue.json"), `${JSON.stringify(result.queue, null, 2)}\n`, "utf8");
console.log(`Fenice PAPER validation stager: STAGED id=${result.order.clientOrderId} symbol=${result.order.symbol} quantity=${result.order.quantity} maxNotionalEuro=${result.order.validationRationale.maxNotionalEuro} maxSimulatedFillNotionalEuro=${result.order.validationRationale.maxSimulatedFillNotionalEuro}; liveTradingAllowed=false.`);
