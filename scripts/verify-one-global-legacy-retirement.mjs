/**
 * The owner has explicitly chosen ONE GLOBAL instead of running overlapping
 * V6/V7/B2 historical PAPER campaigns. Retiring a WRITER is not evidence of
 * a certified strategy and does not give LIVE/broker access.
 *
 * This is an independent fail-closed governance check. It keeps the original
 * approval and ledger bytes on Git and validates that old jobs cannot run.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const EXPECTED={
  "data/paper-validation-campaign.json":"0c69296f93535ef43611cf2aaf9de7d94b84e103",
  "data/paper-v7-phase-b-approval.json":"db95c16e8e0f32980a0eed9e718ff616e635fa49",
  "data/paper-v7-b2-approval.json":"427521f60352076535af19fcc156e7fa3169e3b2",
};
const OLD_WRITERS=[
  [".github/workflows/paper-validation.yml","paper-validation"],
  [".github/workflows/v7-phase-b-forward-paper.yml","paper-forward"],
  [".github/workflows/v7-b2-forward-paper.yml","paper-forward"],
];
const exact=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function assessLegacyRetirement({manifest,files,blobs,v6,v7,b2,v8,v8BlobMap}) {
  if(!manifest||manifest.version!==1
    ||manifest.mode!=="ONE_GLOBAL_LEGACY_RETIREMENT_READ_ONLY"
    ||manifest.authorizedOn!=="2026-11-10"
    ||!Array.isArray(manifest.ownerInstructions)||manifest.ownerInstructions.length!==3
    ||!manifest.ownerInstructions[0].includes("Possiamomeliminarle")
    ||!manifest.ownerInstructions[2].includes("completa fenice")
    ||!exact(manifest.retiredCampaigns,["V6","V7_PHASE_B","V7_B2"])
    ||manifest.activeTechnicalPaper!=="V8_TECHNICAL_ONLY"
    ||!exact(manifest.legacySourceBlobShas,EXPECTED)
    ||manifest.stopAutomaticLegacyWriters!==true
    ||manifest.retainsHistory!==true
    ||manifest.previousApprovedProofsUnchanged!==true
    ||manifest.historicalFillsCreditedToV8!==0
    ||manifest.certificationCredit!==0
    ||manifest.renewPreviousApprovals!==false
    ||manifest.enableLiveTrading!==false
    ||manifest.brokerConnectivityAllowed!==false
    ||manifest.liveTradingAllowed!==false
    ||manifest.authorizePaidServices!==false)
    return {valid:false,reason:"RETIREMENT_MANIFEST_UNSAFE_OR_UNAUTHORIZED"};

  for(const [path,expected] of Object.entries(EXPECTED)) {
    if(blobs?.[path]!==expected)
      return {valid:false,reason:"IMMUTABLE_LEGACY_APPROVAL_CHANGED",path};
  }
  if(v6?.liveTradingAllowed!==false || !v6?.startedAt
    ||v6?.baselineCommit!=="4ccb2d2c21b0545de5b99149222afa5b444bb4c2"
    ||v6?.baselineFingerprint?.complete!==true
    ||v7?.approved!==true||b2?.approved!==true
    ||v7?.liveTradingAllowed!==false||b2?.liveTradingAllowed!==false
    ||v7?.brokerConnectivityAllowed!==false||b2?.brokerConnectivityAllowed!==false)
    return {valid:false,reason:"ORIGINAL_APPROVALS_NOT_PRESERVED"};

  if(v8?.approved!==true||v8?.mode!=="PAPER_TECHNICAL_V8"
    ||v8?.liveTradingAllowed!==false||v8?.brokerConnectivityAllowed!==false
    ||v8?.allowBackfill!==false||v8?.creditTowardV6!==false||v8?.creditTowardB2!==false
    ||Object.keys(v8.coreFileBlobs||{}).length<5)
    return {valid:false,reason:"ACTIVE_V8_PINNED_POLICY_INVALID"};

  for(const [path,blob] of Object.entries(v8.coreFileBlobs))
    if(v8BlobMap?.[path]!==blob)
      return {valid:false,reason:"V8_PROTECTED_CORE_CHANGED",path};

  for(const [path,job] of OLD_WRITERS) {
    const source=files?.[path];
    if(typeof source!=="string"||!source.includes("  "+job+":\n    if: ${{ false }}"))
      return {valid:false,reason:"HISTORICAL_PAPER_WRITER_REMAINS_ENABLED",path};
  }
  return {
    valid:true,status:"LEGACY_WRITERS_RETIRED_WITH_AUDIT",
    preservedApprovals:Object.keys(EXPECTED),
    disabledJobs:OLD_WRITERS.map(([path,job])=>path+":"+job),
    v8PinnedFilesVerified:Object.keys(v8.coreFileBlobs).length,
    legacyPaperCertificationCredit:0,liveTradingAllowed:false,
    brokerConnectivityAllowed:false,
  };
}
const gitBlob=(path)=> {
  try{return execFileSync("git",["rev-parse","HEAD:"+path],{cwd:ROOT,encoding:"utf8"}).trim();}
  catch{return null;}
};
export function inspectLegacyRetirement(){
  const read=path=>readFileSync(resolve(ROOT,path),"utf8");
  const parsed=path=>JSON.parse(read(path));
  const v8=parsed("data/paper-v8-technical-approval.json");
  const blobPaths=[...Object.keys(EXPECTED),...Object.keys(v8.coreFileBlobs||{})];
  const blobs=Object.fromEntries(blobPaths.map(path=>[path,gitBlob(path)]));
  return assessLegacyRetirement({
    manifest:parsed("data/one-global-legacy-retirement.json"),
    files:Object.fromEntries(OLD_WRITERS.map(([path])=>[path,read(path)])),
    blobs,v8BlobMap:blobs,
    v6:parsed("data/paper-validation-campaign.json"),
    v7:parsed("data/paper-v7-phase-b-approval.json"),
    b2:parsed("data/paper-v7-b2-approval.json"),v8,
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=inspectLegacyRetirement();
  console.log("FENICE ONE GLOBAL historical retirement: "+JSON.stringify(report));
  if(!report.valid)process.exitCode=2;
}
