# FENICE unified V6–V8 migration and cleanup gate

## Decision
V8 ONE GLOBAL is the target architecture. V6 remains a historical certification record and safety source, not a parallel global trading engine. V7 functions are retained only when they pass an explicit compatibility review. Do not silently change the active V6 campaign or pretend historical fills are new global PAPER fills.

## Already consolidated
- PR #453 contains the full PR #435 candidate plus malformed historical identity and malformed FX-observation fail-closed fixes.
- Preserve #435 conflicting-retry rejection, advanced Twelve Data MIC/timestamp validation, durable virtual ledger and global diagnostics.
- Global contract workflow runs on the consolidation branch and on main (when merged).

## Cleanup classification (no blind deletions)
- **KEEP:** data/paper-validation-campaign.json and historical evidence, V6 safety checks and Directa kill switch, lib/trading safety modules, lib/global modules, active workflows, UI and provider adapters.
- **MIGRATE:** V6 baseline lifecycle to an explicit owner-reviewed historical/archive state; V6 PAPER evidence is immutable and not equivalent to V8 certified fills.
- **REVIEW FOR REMOVAL:** superseded branch-specific docs, unused wrappers, duplicate tests and retired workflows only after full repository reference/import search, CI trigger review and tests. No file is marked safe to delete merely because it is named V6 or V7.
- **DO NOT DELETE:** scripts/refresh-twelve-data-batch-evidence.mjs or package.json to silence the freeze guard.

## Required gates before any deletion
1. Record exact candidate path, replacement path, importers, package scripts, CI workflow references and persisted-data consumers.
2. Verify no runtime, scheduler, production endpoint, report, or historical audit depends on the candidate.
3. Remove on a dedicated reviewable commit, rerun all relevant tests, and verify rollback.
4. If the file belongs to the 92 frozen V6 paths, require explicit baseline lifecycle approval and preservation of historical evidence.

## Existing unresolved blockers
- V6 freeze guard detects two baseline drifts on main: package.json and scripts/refresh-twelve-data-batch-evidence.mjs. An explicit retirement/rebaseline or reviewed restoration is needed; never disable the guard or rewrite fingerprints to force green.
- The integration branch is behind main and needs a conflict-aware reconciliation and full CI.
- Independent exchange-session, multi-provider executable bid/ask and non-EUR FX evidence are missing for certified global PAPER fills. Do not label synthetic tests as real evidence.
- Directa LIVE remains blocked.

## Target end-to-end evidence
Instrument identity -> authoritative session -> independent quotes -> verified FX -> signal -> virtual fill -> durable idempotent ledger -> net EUR P&L -> replay/reconciliation. Every stage must preserve provenance and a reproducible run identifier.

## Merge policy
PR #453 remains draft. No automatic merge into main, no broker orders, no secret changes, no fabricated PAPER evidence.
