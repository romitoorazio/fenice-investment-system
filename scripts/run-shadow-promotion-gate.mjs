import { readFile, writeFile } from "node:fs/promises";
import { buildShadowPromotionGate } from "../lib/intelligence/shadow-promotion-gate.mjs";

const inputPath = String(
  process.env.FENICE_V7_SHADOW_EVAL_REPORT || "data/v7-horizon-shadow-evaluation.json",
).trim();
const outputPath = String(
  process.env.FENICE_V7_SHADOW_PROMOTION_GATE || "data/v7-shadow-promotion-gate.json",
).trim();

const report = JSON.parse(await readFile(inputPath, "utf8"));
const gate = buildShadowPromotionGate(report, { now: new Date() });
await writeFile(outputPath, JSON.stringify(gate, null, 2) + "\n", "utf8");

console.log(
  "Fenice V7 shadow promotion gate:",
  "state=", gate.state,
  "eligible=", gate.eligibleForHumanResearchReview,
  "7d=", gate.evidence.sevenDay.sampleSize,
  "30d=", gate.evidence.thirtyDay.sampleSize,
  "blockers=", gate.blockers.join(",") || "none",
  "paper=false; live=false.",
);
