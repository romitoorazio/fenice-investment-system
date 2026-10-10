import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isPublicPaperRefreshAttempt } from "../lib/ui/proposal-route-policy.ts";

const url = (suffix) => new URL(`https://fenice.example/api/trading/proposals${suffix}`);
for (const input of [
  "?fresh=1", "?fresh=0", "?fresh=true", "?fresh=",
  "?fresh=1&fresh=0", "?other=ok&%66resh=1",
]) {
  assert.equal(isPublicPaperRefreshAttempt(url(input)), true, `fail closed on ${input}`);
}
for (const input of ["", "?other=ok", "?FRESH=1", "?freshness=1"]) {
  assert.equal(isPublicPaperRefreshAttempt(url(input)), false, `keep read-only access for ${input}`);
}

const route = await readFile(new URL("../app/api/trading/proposals/route.ts", import.meta.url), "utf8");
const ui = await readFile(new URL("../components/PaperProposalReview.tsx", import.meta.url), "utf8");
const guardAt = route.indexOf("if (isPublicPaperRefreshAttempt(url))");
const loadAt = route.indexOf("await loadPaperReviewPayload(process.cwd(), Date.now())");
assert(guardAt > -1 && loadAt > guardAt, "the public route must deny refresh before loading data");
assert.match(route, /status:\s*403/, "public refresh must be rejected");
assert(!route.includes("refreshLiveContext"), "public GET must never forward a provider refresh option");
assert(!route.includes("fetchFreshPaperReviewContext"), "public GET must not call provider adapters");
assert(!ui.includes("?fresh=1"), "browser must not request billable refreshes");
assert(!ui.includes("refreshMarket()"), "UI must not offer an unprotected manual refresh");
assert(ui.includes("Il refresh diretto delle API dal browser è sospeso"), "user must see an honest refresh notice");
assert(ui.includes('"/api/trading/proposals"'), "ordinary read-only polling must remain available");
console.log("Public PAPER refresh abuse prevention and UI regression: PASS");
