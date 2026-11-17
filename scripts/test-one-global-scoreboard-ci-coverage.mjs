import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync('.github/workflows/fenice-unica-paper-cycle.yml','utf8');
const paths=event=>{
  const section=workflow.match(new RegExp('^  '+event+':\\n([\\s\\S]*?)(?=^  [a-z_]+:|^permissions:)','m'))?.[1];
  assert(section,'Missing '+event+' trigger');
  return new Set([...section.matchAll(/^      - "([^"]+)"/gm)].map(x=>x[1]));
};
const push=paths('push'),pr=paths('pull_request');
// A test-only fix must run the suite that owns that test on the PR head.
// The release guard must not borrow unrelated green CI as its evidence.
for(const path of push)assert(pr.has(path),'Missing pull_request coverage: '+path);
for(const path of pr)assert(push.has(path),'Missing main coverage: '+path);
const invoked=[...workflow.matchAll(/^          (?:node|python3) (scripts\/test-[\w-]+\.(?:mjs|py))$/gm)].map(x=>x[1]);
assert(invoked.length>=16,'Expected complete scoreboard regression suite');
for(const path of invoked){
  assert(pr.has(path),'PR changes to invoked regression would skip CI: '+path);
  assert(push.has(path),'Main changes to invoked regression would skip CI: '+path);
}
assert.match(workflow,/ref: \$\{\{ github.event_name == 'pull_request' && github.event.pull_request.head.sha \|\| 'main' \}\}/);
console.log('PASS scoreboard CI: matching PR/main filters cover every invoked regression; exact PR head checked.');
