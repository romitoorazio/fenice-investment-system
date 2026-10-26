import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { computePaperValidationFingerprint } from "../lib/trading/validation-fingerprint.mjs";
import { assessV7PhaseBCandidate } from "../lib/ui/paper-v7-phase-b-candidate-audit.mjs";

const repo = new URL("../", import.meta.url);
const read = async name => readFile(new URL(name, repo), "utf8");
const [candidate, manifest, campaign, engine] = await Promise.all([
  read("data/paper-v7-phase-b-candidate-reference.json").then(JSON.parse),
  read("data/paper-v7-phase-b-preparation.json").then(JSON.parse),
  read("data/paper-validation-campaign.json").then(JSON.parse),
  read("lib/trading/world-paper-v7.mjs"),
]);
const git = (...args) => execFileSync("git", args, {
  encoding:"utf8",cwd:new URL(".", repo),timeout:10_000,
}).trim();
const sha = candidate.referenceCommitSha;
const files = Object.entries(candidate.referenceFiles || {}).sort(([a],[b])=>a.localeCompare(b));
const pinned = /^[a-f0-9]{40}$/.test(sha)
  && files.length === 7 && files.every(([path,blob]) =>
    /^[a-z0-9_./-]+$/.test(path) && !path.includes("..")
    && /^[a-f0-9]{40}$/.test(blob));
let referenceValid = pinned, allPinnedGitBlobsMatch = pinned;
let fingerprint = null;
if (pinned) {
  try {
    referenceValid = git("cat-file","-t",sha) === "commit";
    const digest = createHash("sha256");
    digest.update("FENICE_V7_PHASE_B_UNAPPROVED_CANDIDATE_V1\n");
    for (const [path,blob] of files) {
      const atRef = git("rev-parse",sha + ":" + path);
      const atCurrent = git("rev-parse","HEAD:" + path);
      const contents = await read(path);
      const atTextBlob = git("hash-object","--",path);
      if (atRef !== blob || atCurrent !== blob || atTextBlob !== blob)
        allPinnedGitBlobsMatch = false;
      digest.update("FILE:" + path + "\n");
      digest.update(contents.replace(/\r\n/g,"\n"));
      digest.update("\nEND_FILE\n");
    }
    fingerprint = allPinnedGitBlobsMatch && referenceValid ? digest.digest("hex") : null;
  } catch {
    allPinnedGitBlobsMatch = false;
  }
}
const observedV6 = await computePaperValidationFingerprint(new URL(".",repo).pathname);
const v6FrozenUnchanged = observedV6.complete === true
  && observedV6.digest === campaign?.baselineFingerprint?.digest;
const result = assessV7PhaseBCandidate({
  candidate, manifest, worldEngineSource:engine,
  allPinnedGitBlobsMatch: allPinnedGitBlobsMatch && referenceValid,
  v6FrozenUnchanged,
});
console.log(JSON.stringify({
  ...result,
  candidateReferenceContentSha256: fingerprint,
  phaseBApprovalCryptographicallyVerified: false,
  note: "A reproducible candidate SHA-256 is not a selected/signed PAPER baseline or an execution authority."
},null,2));
if (!allPinnedGitBlobsMatch || !referenceValid || !v6FrozenUnchanged
  || result.state !== "CANDIDATE_BLOCKED_FOR_PHASE_B_EXECUTION"
  || result.mayProducePhaseBFills !== false
  || result.maySubmitBrokerOrders !== false
  || result.credentialChangesPerformed !== false) process.exitCode=2;
