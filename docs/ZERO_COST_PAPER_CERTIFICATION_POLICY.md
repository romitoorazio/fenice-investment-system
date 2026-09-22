# Fenice Zero-Cost PAPER Certification Policy

Status: normative for internal PAPER-readiness work on the professional-core hardening branch.

## Safety invariants

- `liveTradingAllowed` remains `false`.
- No broker write/order-submission capability may be enabled by this policy.
- Secrets must never be committed, printed, logged, copied into evidence, or exposed in generated artifacts.
- Market-data uncertainty fails closed for PAPER execution eligibility.

## Directa policy

A paid Directa realtime market-data entitlement is **not** a prerequisite for Fenice PAPER certification.

Directa evidence may be consumed when lawfully available in read-only form, but absence of the paid realtime feed must not by itself make the PAPER certification gate fail.

Directa remains optional evidence until a separately reviewed live-broker certification phase exists. This document does not authorize such a phase.

## PAPER market-data eligibility

A symbol can become PAPER-eligible only when its execution/valuation evidence satisfies all of the following:

1. At least two independent source families are available; three are preferred where free/public quotas permit.
2. Provenance and observation timestamps are recorded.
3. Freshness is evaluated against an asset/session-specific policy.
4. Stale observations cannot be made fresh by a newer observation from another field or provider.
5. Cross-source disagreement and outlier/spread checks pass.
6. A critical-source failure has an explicit documented fallback or causes the symbol to fail closed.
7. Research-only, delayed, indicative or otherwise unsuitable observations are not silently promoted to PAPER execution evidence.

No single provider is an unconditional source of truth.

## Internal certification evidence

Data Quality, System Tests and Risk Controls must produce machine-readable evidence tied to:

- commit SHA;
- configuration/policy fingerprint;
- evidence timestamp;
- explicit PASS/FAIL/BLOCKED status;
- reason codes for every non-PASS result.

A UI badge or successful build alone is not certification evidence.

## PAPER campaign

The campaign begins only after a stable certified baseline is selected. Historical records must not backdate the campaign.

Current minimum evidence policy remains:

- 30 calendar days;
- at least 25 valid evidence days;
- at least 10 PAPER fills;
- audit/reconciliation integrity preserved;
- live trading blocked for every evidence day.

A baseline-changing modification to the trading/risk core must trigger the campaign invalidation/restart policy defined by the certification tooling.

## READY definition

Fenice may be called internally PAPER-ready only when all of these are simultaneously true on the reconciled current head:

1. CI is GREEN.
2. Current-tree secret scanning is clean.
3. Critical sources are GREEN or have tested, documented fail-safe fallback behavior.
4. Data Quality is internally certified.
5. System Tests are internally certified.
6. Risk Controls are internally certified.
7. PAPER campaign is validated.
8. Live trading remains blocked.

Until then the correct state is **NOT READY** or **BLOCKED**, with an explicit reason.