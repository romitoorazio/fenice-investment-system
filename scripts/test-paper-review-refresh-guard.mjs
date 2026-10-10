import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Execute the real route body with a local, non-networking data-loader stub.
const source = await readFile(new URL("../app/api/trading/proposals/route.ts", import.meta.url), "utf8");
const importLine = 'import { loadPaperReviewPayload } from "@/lib/ui/paper-review-data";';
assert.ok(source.includes(importLine), "expected PAPER review loader import");
const loaderCalls = [];
globalThis.__paperRefreshTestCalls = loaderCalls;
const stub = `const loadPaperReviewPayload = async (_root, _now, options) => {
  globalThis.__paperRefreshTestCalls.push(options);
  return { mode: "PAPER_REVIEW", liveTradingAllowed: false, brokerOrderSubmissionAllowed: false, proposals: [] };
};`;
const instrumented = source.replace(importLine, stub)
  .replace("export async function GET(request: Request)", "export async function GET(request)");
const { GET } = await import(`data:text/javascript;base64,${Buffer.from(instrumented).toString("base64")}`);
for (const query of ["?fresh=1", "?fresh=1&foo=bar", "?fresh=1&fresh=0"]) {
  const result = await GET(new Request(`https://fenice.invalid/api/trading/proposals${query}`));
  assert.equal(result.status, 403, "public refresh must be denied before provider loading");
  assert.equal(loaderCalls.length, 0, "denied request must never reach the provider loader");
  assert.equal(result.headers.get("Cache-Control"), "no-store");
}
for (const query of ["", "?fresh=0"]) {
  const result = await GET(new Request(`https://fenice.invalid/api/trading/proposals${query}`));
  assert.equal(result.status, 200, "saved report must remain readable");
  assert.equal(result.headers.get("Cache-Control"), "no-store");
}
assert.deepEqual(loaderCalls, [{ refreshLiveContext: false }, { refreshLiveContext: false }]);
console.log("PASS: provider refresh denied; saved PAPER reports remain readable");
