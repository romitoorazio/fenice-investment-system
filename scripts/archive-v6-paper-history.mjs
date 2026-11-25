#!/usr/bin/env node
// Immutable historical V6 archive; never changes active campaign or approval.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const original=path.join(root,"data/paper-validation-campaign.json");
const archive=path.join(root,"data/paper-history/v6-20260925-campaign.json");
const expected="4380ab3ce24d8b59f8f2acba390fb39c0577331970fb791a5a2ae59232a93df1";
const hash=b=>createHash("sha256").update(b).digest("hex");
const source=await readFile(original);
if(hash(source)!==expected) throw Error("V6_ARCHIVE_SOURCE_HASH_MISMATCH");
const parsed=JSON.parse(source.toString("utf8"));
if(parsed.version!==6 || parsed.dailyEvidence?.length!==42 || parsed.liveTradingAllowed!==false) throw Error("V6_ARCHIVE_SOURCE_INVALID");
if(process.argv.includes("--write")){
  await mkdir(path.dirname(archive),{recursive:true});
  try { await writeFile(archive,source,{flag:"wx"}); }
  catch(e){ if(e.code!=="EEXIST") throw e; }
}
let saved;
try {saved=await readFile(archive);}
catch(e){if(e.code!=="ENOENT")throw e;if(process.argv.includes("--write"))throw e;}
if(saved && (!saved.equals(source)||hash(saved)!==expected)) throw Error("V6_ARCHIVE_MISMATCH");
console.log(JSON.stringify({original:"data/paper-validation-campaign.json",archive:"data/paper-history/v6-20260925-campaign.json",sha256:expected,records:42,archiveVerified:Boolean(saved),mode:process.argv.includes("--write")?"write-once":"read-only",liveTradingAllowed:false}));
