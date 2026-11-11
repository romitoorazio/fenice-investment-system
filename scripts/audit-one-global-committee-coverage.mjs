import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {auditOneGlobalCommitteeWorldCoverage} from "../lib/intelligence/one-global-committee-world-coverage.mjs";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const read=name=>JSON.parse(readFileSync(resolve(root,"data",name),"utf8"));
export function buildOneGlobalWorldCommitteeReport(nowIso){
  return auditOneGlobalCommitteeWorldCoverage({
    master:read("instrument-master.json"),
    seeds:read("world-paper-v7-research-seeds.json"),
    committee:read("investment-committee.json"),
    terminal:read("terminal-intelligence.json"),
    fundamentals:read("fundamental-research.json"),
    eod:read("world-v7-eod-research.json"),
    world:read("world-v7-validation-ledger.json"),
    annualPrimaryReleases:read("one-global-fy2025-official-issuer-releases.json"),
    interimPrimaryReleases:read("one-global-2026-interim-primary-releases.json"),
    nowIso,
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=buildOneGlobalWorldCommitteeReport(new Date().toISOString());
  const output=process.argv.find(x=>x.startsWith("--output="))?.slice(9)
    ||"/tmp/fenice-one-global-committee-coverage.json";
  mkdirSync(dirname(output),{recursive:true});
  writeFileSync(output,JSON.stringify(report,null,2)+"\n",{mode:0o600});
  console.log("ONE GLOBAL committee coverage: "+JSON.stringify({
    listedEquities:report.summary.listedEquities,
    nonUSVenueEquities:report.summary.nonUSVenueEquities,
    nonUSVenueCommitteeCovered:report.summary.nonUSVenueCommitteeCovered,
    nonUSVenueExcluded:report.summary.nonUSVenueExcludedFromCommittee,
    foreignIssuerUSListings:report.summary.foreignIssuerUSListings,
    suggestedNextResearch:report.researchQueue.map(x=>x.key).slice(0,6),
    missingPrimaryIssuerFinancials:report.summary.nonUSVenueMissingPrimaryIssuerFinancials,
    validatedIssuerReleaseSets:report.summary.nonUSVenueValidatedIssuerPressReleaseSets,
    evidenceCompletionQueue:report.evidenceCompletionQueue.map(x=>({
      key:x.key,firstAction:x.firstAction,issuerPressValidated:x.primaryIssuerReleaseEvidenceValidated,
    })).slice(0,8),
    live:false,broker:false,verifiedStrategyOrders:0,
  }));
}
