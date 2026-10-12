import { readFile, writeFile } from "node:fs/promises";
import { valuePaperRecordedQuantities } from "../lib/ui/paper-valuation-evidence.ts";
const files = { paper: "data/paper-oms-state.json", quotes: "data/execution-market-evidence.json",
  fx: "data/paper-fx-evidence.json", session: "data/paper-market-session.json" };
const entries = await Promise.all(Object.entries(files).map(async ([key, file]) => [key, JSON.parse(await readFile(file, "utf8"))]));
const input = Object.fromEntries(entries);
const before = JSON.stringify(input);
const report = valuePaperRecordedQuantities(input);
if (JSON.stringify(input) !== before) throw new Error("VALUATION_MUTATED_SOURCE_EVIDENCE");
const output = process.env.FENICE_VALUATION_REPORT_PATH;
if (output) await writeFile(output, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(`PAPER valuation: ${report.state}; asOf=${report.asOf || "N/D"}; live=false; evidenceMutation=false; providerCalls=0.`);
if (report.state !== "VALUED_SAMPLE") console.log(report.reason);
