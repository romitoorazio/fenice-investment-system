# FENICE PAPER next: isolated baseline decision record (DRAFT)

Status: **NOT APPROVED / NOT ACTIVATED**. This is a technical review record, not operator consent.

## Verified evidence (2026-11-06)
- Proposed change: committee and terminal decision vocabularies are distinct. Compare permitted states to terminal decision, retain explicit committee ATTENDI/EVITA veto.
- Regression and Production CI passed for commit c65351df680ede6690bd72ff446175d5f088eb85.
- PAPER Core Freeze Guard fails intentionally because the V7-B2 fingerprint pins scripts/paper-validation-stager.mjs.
- The other reported drift files, package.json and scripts/refresh-twelve-data-batch-evidence.mjs, have identical blobs on main and this proposal branch. Their drift relative to the older baseline predates this PR.
- V7-B2 approval pins baseline commit 8b67319fc0b4becbf9de41e438a1c296c7e1a11b and digest dec6adaae59c94922aadf544c2e5aaef436d504c2c71f1fbe45f9e1b9aea1719. It cannot authorize changed core.

## Proposed activation contract (requires separate review and explicit owner authorization)
1. Keep existing V6, V7 Phase B, V7-B2, and V8 histories, approvals, fingerprints and ledgers unchanged.
2. Create a separate PAPER-only campaign identity, ledger, daily journal, preflight, workflow and independently computed fingerprint, bound to the exact reviewed commit.
3. Require explicit prospective human approval tied to that fingerprint and expiry; never infer approval from this document or reuse the V7-B2 approval.
4. Preserve the existing limits: one probe per day, committee score >=70, raw data confidence >=90, risk score <=75, independent market data quorum >=2, current authoritative open-market evidence, fresh FX for non-EUR, <=EUR300 per probe, <=3% paper capital, <=15% per asset, no backfill.
5. Fail closed on missing evidence, ATTENDI/EVITA decisions, insufficient headroom, stale data, mismatched fingerprint, reconciliation breaks or exceeded budgets.
6. Explicitly disallow broker connectivity, live orders, API key changes, paid data sources and reuse of old fills.
7. Validate the new baseline with negative-gate regression tests, end-to-end GitHub Actions checks, ledger replay and audit-ready evidence before any forward PAPER simulation.
8. Treat an actual PAPER_FILLED event only as a fill when recorded by the PAPER execution simulator and independently reconciled; never fabricate or import historical fills.

## Remaining independent blockers
- The latest inspected V7-B2 forward journal through 2026-11-05 shows zero fills and no eligible validation candidate.
- V8 technical status as of 2026-11-05 remains COLLECTING (3 valid days).
- New PAPER campaign has **not** been created, approved or run. No real orders authorized.

## Review decision
Keep PR #407 in draft. A new isolated fingerprinted campaign and explicit owner approval are prerequisites for activation. Do not bypass the freeze guard.
