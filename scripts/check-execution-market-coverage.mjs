import { readFile, writeFile } from "node:fs/promises";
import { evaluateExecutionCoverageReport } from "../lib/trading/execution-coverage.ts";

const evidence = JSON.parse(await readFile("data/execution-market-evidence.json", "utf8"));
const report = evaluateExecutionCoverageReport(evidence, Date.now());

await writeFile("data/execution-market-coverage.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Fenice PAPER execution coverage: ${report.paperEligibleSymbols}/${report.requestedSymbols} symbols eligible (${report.paperEligiblePercent}%).`);
console.log(`Directa pilot coverage: ${report.directaPilotEligibleSymbols}/${report.directaPilotCandidateSymbols} equity/ETF symbols eligible (${report.directaPilotEligiblePercent}%).`);
console.log(`Eligible symbols: ${report.rows.filter((row) => row.paperEligible).map((row) => row.symbol).join(", ") || "none"}.`);
