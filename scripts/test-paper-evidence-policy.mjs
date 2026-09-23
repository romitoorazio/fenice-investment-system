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
  assert.equal(result.eligibility, "VALIDATION_ONLY", "entitlement text without verified provenance must fail closed");
  assert.match(result.reason, /provenance/i);
}

{
  const result = classifyPaperEvidence({
    sourceFamily: "twelve-data",
    realtime: true,
    entitlement: "PAPER",
    provenanceVerified: true,
  });
  assert.equal(result.eligibility, "PAPER", "approved free US realtime source with verified provenance may satisfy PAPER classification");
}

{
  const result = classifyPaperEvidence({ sourceFamily: "unknown-provider", realtime: true, entitlement: "PAPER" });
  assert.equal(result.eligibility, "VALIDATION_ONLY", "unknown provider cannot self-assert PAPER entitlement without verified provenance");
}

{
  const result = classifyPaperEvidence({
    sourceFamily: "unknown-provider",
    realtime: true,
    entitlement: "PAPER",
    provenanceVerified: true,
  });
  assert.equal(result.eligibility, "VALIDATION_ONLY", "caller-supplied provenance cannot register an unknown provider for PAPER certification");
  assert.match(result.reason, /not approved/i);
}

{
  const result = classifyPaperEvidence({
    sourceFamily: "alpha-vantage",
    realtime: true,
    entitlement: "PAPER",
    provenanceVerified: true,
  });
  assert.equal(result.eligibility, "VALIDATION_ONLY", "Alpha Vantage realtime US equities are not an approved zero-cost PAPER source");
  assert.match(result.reason, /zero-cost/i);
}

{
  const result = classifyPaperEvidence({
    sourceFamily: "directa",
    realtime: true,
    entitlement: "PAPER",
    provenanceVerified: true,
  });
  assert.equal(result.eligibility, "VALIDATION_ONLY", "Directa must qualify only through its dedicated entitlement, identity and executable-book evidence path");
  assert.match(result.reason, /not approved/i);
}

{
  const result = classifyPaperEvidence({
    sourceFamily: "alpaca",
    realtime: true,
    entitlement: "PAPER",
    provenanceVerified: true,
  });
  assert.equal(result.eligibility, "PAPER", "Alpaca Basic IEX may qualify after authenticated realtime provenance verification");
}

{
  const result = classifyPaperEvidence({
    sourceFamily: "alpaca",
    realtime: false,
    entitlement: "PAPER",
    provenanceVerified: true,
  });
  assert.equal(result.eligibility, "VALIDATION_ONLY", "verified provenance must not override a non-realtime observation");
}

{
  const result = classifyPaperEvidence({});
  assert.equal(result.eligibility, "VALIDATION_ONLY");
  assert.equal(result.sourceFamily, "unknown");
}

console.log("Fenice PAPER evidence classification tests: PASS");
