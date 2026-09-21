import { readFile } from "node:fs/promises";
import { evaluatePaperValidationCampaign } from "../lib/trading/paper-validation.mjs";

const requireMatured = process.argv.includes("--require-matured");
const campaign = JSON.parse(await readFile("data/paper-validation-campaign.json", "utf8"));
const status = evaluatePaperValidationCampaign(campaign, Date.now());

console.log(`Fenice paper validation campaign: ${status.state}`);
console.log(JSON.stringify(status, null, 2));

if (requireMatured && !status.matured) {
  console.error("Paper validation campaign has not matured.");
  process.exitCode = 2;
}
