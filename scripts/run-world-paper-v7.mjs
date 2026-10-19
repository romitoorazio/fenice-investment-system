import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { runWorldPaperV7 } from "../lib/trading/world-paper-v7.mjs";

// Autonomous WORLD PAPER observer, not an order executor. It never calls
// provider APIs and does not reuse expired V6 snapshots as execution proofs.
// Offline regression explicitly tests actual PAPER simulation behind separate
// opt-in and verified venue/source/FX inputs. No broker imports anywhere.
const read = (name) => JSON.parse(readFileSync(new URL("../data/" + name, import.meta.url), "utf8"));
const master = read("instrument-master.json");
const regionalSeeds = read("world-paper-v7-research-seeds.json");
const funnel = read("world-equity-funnel-status.json");
const reference = read("global-reference-coverage.json");
const pilot = runWorldPaperV7({
  nowIso: new Date().toISOString(),
  instruments: [...master.instruments, ...regionalSeeds.instruments],
  sessions: [], quotes: [], fx: [], entitlements: { sources: [], sessions: [], fx: [] },
  intents: [], paperRunAuthorized: false,
});
const report = {
  version: 1,
  generatedAt: pilot.generatedAt,
  purpose: "Worldwide PAPER V7 evidence and integration readiness; independent from V6",
  globalResearchReference: {
    status: funnel.status,
    generatedAt: funnel.generatedAt,
    screenedCommonShares: funnel.common,
    acceptedReferenceIdentities: funnel.accepted,
    selectedReferences: funnel.selected,
    regions: funnel.regions,
    note: "Reference metadata is NOT quote, market OPEN, instrument entitlement or execution evidence.",
  },
  providerReference: {
    generatedAt: reference.generatedAt,
    matchedProviderCountries: reference.coverage?.providerMatchedCountries ?? null,
    targetCountries: reference.coverage?.targetCountries ?? null,
  },
  worldPaper: pilot,
  blockers: [
    "No non-US quote is entitled or certified for automatic PAPER use by this workflow.",
    "Exact venue market OPEN must be independently observed; indicative time is insufficient.",
    "At least two independent, licensed, <=120-second quote families and fresh FX for non-EUR listings are required.",
    "Strategy intents must be explicit, fresh and approved for isolated PAPER V7 simulation.",
    "Regional LIVE trading and broker submissions are not available.",
  ],
};
const out = process.argv.find((arg) => arg.startsWith("--output="))?.slice("--output=".length) || "/tmp/fenice-world-paper-v7-readiness.json";
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
const summary = report.worldPaper.summary;
console.log(JSON.stringify({
  reportPath: out, referenceSelected: report.globalResearchReference.selectedReferences,
  researchRegions: report.globalResearchReference.regions,
  pilotListings: summary.pilotListings, pilotRegions: summary.regions,
  verifiedGlobalListings: summary.independentlyVerifiedListings,
  simulatedFills: summary.filledPaperOrders,
  liveTradingAllowed: false, brokerConnectivityAllowed: false,
}));
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    "# FENICE World PAPER V7 - independent observation\n\n" +
    "**Research selected references:** " + funnel.selected + " across " + funnel.regions + " regions (not execution-qualified).\n\n" +
    "**PAPER pilot listed instruments:** " + summary.pilotListings + " across " + summary.regions + " regions.\n\n" +
    "**Verified for global PAPER:** " + summary.independentlyVerifiedListings +
    "  \n**Simulated fills:** " + summary.filledPaperOrders + "\n\n" +
    "| Region | Pilot instruments | Verified PAPER listings |\n|---|---:|---:|\n" +
    pilot.regions.map((r)=>"| "+r.region+" | "+r.listedInPilot+" | "+r.verifiedPaperListings+" |").join("\n") +
    "\n\nNo additional source privileges, realtime market access or broker permissions granted. V6 baseline untouched.\n");
}
