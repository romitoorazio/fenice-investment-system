import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { diagnosticQuoteAgeSeconds,diagnosticQuoteFresh,chooseAlpacaIexDiagnosticPrice }
  from "../lib/intelligence/paper-provider-probe-truth.mjs";
const now=Date.parse("2026-10-15T18:00:00.000Z");
const fresh="2026-10-15T17:59:40.000Z",stale="2026-10-15T17:50:00.000Z",future="2026-10-15T18:04:00.000Z";
const quote=t=>({bp:300,ap:302,t}),trade=t=>({p:301.25,t});
assert.equal(diagnosticQuoteAgeSeconds(fresh,now),20);
assert.equal(diagnosticQuoteFresh(fresh,now,120),true);
assert.equal(diagnosticQuoteFresh(stale,now,120),false);
assert.equal(diagnosticQuoteFresh(future,now,120),false);
assert.equal(diagnosticQuoteAgeSeconds("2026-02-30T18:00:00Z",now),null);
assert.equal(diagnosticQuoteAgeSeconds("2026-10-15",now),null);
const q=chooseAlpacaIexDiagnosticPrice({quote:quote(fresh),trade:trade(fresh),now});
assert.equal(q.priceBasis,"IEX_QUOTE_MIDPOINT");
assert.equal(q.midpoint,301);
const fallback=chooseAlpacaIexDiagnosticPrice({quote:quote(stale),trade:trade(fresh),now});
assert.equal(fallback.priceBasis,"IEX_LAST_TRADE_DIAGNOSTIC");
assert.equal(fallback.freshVerifiedQuote,true);
assert.equal(fallback.midpoint,301.25);
for(const [q,t] of [[future,stale],[stale,stale],[future,future]]){
  assert.equal(chooseAlpacaIexDiagnosticPrice({quote:quote(q),trade:trade(t),now}).freshVerifiedQuote,false);
}
assert.equal(chooseAlpacaIexDiagnosticPrice({quote:{bp:0,ap:0,t:fresh},trade:trade(fresh),now}).priceBasis,"IEX_LAST_TRADE_DIAGNOSTIC");
assert.equal(chooseAlpacaIexDiagnosticPrice({quote:{bp:0,ap:0,t:fresh},trade:null,now}).ok,false);
const workflow=await readFile(new URL("../.github/workflows/paper-provider-feasibility.yml",import.meta.url),"utf8");
assert(workflow.includes("node scripts/test-paper-provider-probe-truth.mjs"));
console.log("Fenice strict provider timestamps and read-only IEX fallback: PASS");
