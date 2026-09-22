import assert from "node:assert/strict";
import { classifyPaperEvidence } from "../lib/trading/paper-evidence-policy.ts";

{
  const result = classifyPaperEvidence({ source: "Stooq", realtime: false });
  assert.equal(result.eligibility, "VALIDATION_ONLY", "daily/public fallback must never be silently promoted to PAPER");
}

{
  const result = classifyPaperEvidence({ sourceFamily: "twelve-data", realtime: true });
  assert.equal(result.eligibility, "VALIDATION_ONLY", "provider identity and realtime flag alone are insufficient");
}

{
  const result = classifyPaperEvidence({ sourceFamily: "twelve-data", realtime: true, entitlement: "PAPER" });
  assert.equal(result.eligibility, "PAPER", "explicit realtime PAPER entitlement may be classified as PAPER evidence");
}

{
  const result = classifyPaperEvidence({ sourceFamily: "unknown-provider", realtime: true, entitlement: "PAPER" });
  assert.equal(result.eligibility, "PAPER", "classification is provider-neutral when entitlement is explicit");
}

{
  const result = classifyPaperEvidence({});
  assert.equal(result.eligibility, "VALIDATION_ONLY");
  assert.equal(result.sourceFamily, "unknown");
}

console.log("Fenice PAPER evidence classification tests: PASS");
