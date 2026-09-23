import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reconcileFinraGlobalSourceHealth } from "../lib/intelligence/global-source-health-reconcile.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(root, "data", "global-source-registry.json");
const reportPath = path.join(root, "data", "global-source-health.json");

const [registry, report] = await Promise.all([
  readFile(registryPath, "utf8").then(JSON.parse),
  readFile(reportPath, "utf8").then(JSON.parse),
]);

const reconciled = await reconcileFinraGlobalSourceHealth(report, registry);
await writeFile(reportPath, `${JSON.stringify(reconciled, null, 2)}\n`, "utf8");

const finra = reconciled.sources?.find((source) => source.id === "finra-fixed-income");
console.log(
  `Global source reconciliation: FINRA=${finra?.status || "missing"}; reliability=${reconciled.reliabilityScore}/100; gate=${reconciled.gate}.`,
);
