import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Non-networking regression check: unauthenticated requests must never
// reach the provider-loading branch of the PAPER proposal endpoint.
const route = await readFile(new URL("../app/api/trading/proposals/route.ts", import.meta.url), "utf8");
const guard = route.indexOf('url.searchParams.get("fresh") === "1"');
const loader = route.indexOf("await loadPaperReviewPayload(");
assert(guard >= 0 && loader > guard, "provider refresh must be gated before any provider loader");
assert.match(route.slice(guard, loader), /status:\s*403/, "fresh=1 must be denied before provider access");
assert.match(route, /refreshLiveContext:\s*false/, "persisted GET must not trigger a refresh");
console.log("Fenice provider refresh fail-closed regression: PASS");
