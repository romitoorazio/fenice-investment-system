import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { assessEngineeringEvidencePublication } from "../lib/ui/engineering-evidence-publish-policy.mjs";

const testedSha = process.env.TESTED_SHA || "";
let previous = null;
try {
  previous = JSON.parse(await readFile("data/engineering-validation-evidence.json", "utf8"));
} catch {
  // Absence or invalid JSON must NOT suppress evidence publication.
}
const prev = String(previous?.source?.validatedCommit || "");
const valid = /^[a-f0-9]{40}$/i;
let codeChangedSincePrevious = true;
if (valid.test(prev) && valid.test(testedSha)) {
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", prev, testedSha], { encoding: "utf8" });
  if (ancestor.status === 0 && !ancestor.error) {
    const diff = spawnSync("git", ["diff", "--quiet", prev, testedSha, "--", ".",
      ":(exclude)data/**", ":(exclude)**/*.md"], { encoding: "utf8" });
    if (diff.status === 0 && !diff.error) codeChangedSincePrevious = false;
  }
}
const result = assessEngineeringEvidencePublication({
  previous, testedSha, now: new Date(), codeChangedSincePrevious,
});
process.stdout.write("publish=" + (result.publish ? "true" : "false") + "\n");
console.error("Engineering evidence publication: " + result.reason +
  "; codeChangedOrUnverified=" + codeChangedSincePrevious);
