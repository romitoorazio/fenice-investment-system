import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

for(const file of ["autonomy.yml","fenice-x.yml"]){
  const workflow=await readFile(new URL("../.github/workflows/"+file,import.meta.url),"utf8");
  assert.match(workflow,/run: npm run foundation/);
  const env=file==="autonomy.yml"
    ? workflow.match(/- name: Collect and validate sources\n([\s\S]*?)run: npm run foundation/)?.[1]
    : workflow.match(/    env:\n([\s\S]*?)    steps:/)?.[1];
  assert(env,"Collector environment must be identifiable: "+file);
  for(const key of ["FINRA_CLIENT_ID","FINRA_CLIENT_SECRET"]){
    assert(env.includes(key+": ${{ secrets."+key+" }}"),file+" must pass the same configured FINRA credentials as the other collectors");
  }
  assert.match(workflow,/data\/paper-\*\|data\/execution-market-\*/,
    "Credential wiring cannot grant the research collector publication rights over PAPER state");
}
console.log("Foundation and manual fallback: FINRA OAuth wired, PAPER publication exclusion retained PASS");
