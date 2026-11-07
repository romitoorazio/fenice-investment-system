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

## Verified alternative already implemented: PR #444 (2026-11-07)
A repository-wide PR search identified draft PR #444, `fix(paper): V6 core freeze restored; 12/12 checks green`, head `3b7e67d6136d91a42a7151e0ca688f37420e46f0`. Its author reports 12/12 GitHub Actions successful, including the freeze guard and Production CI. The change restores the two frozen baseline blobs and preserves the newer Twelve Data logic in a separate `scripts/refresh-twelve-data-batch-evidence-enhanced.mjs` file, **not wired to operational refresh**. This is an existing tested alternative, not a change yet integrated into PR #453.

**Integration decision:** do not blindly cherry-pick PR #444 or declare V6 solved in #453. Restoring the baseline operational script without wiring the enhanced implementation would remove active FX future-timestamp rejection and independent-source prioritization from that operational path. First compare PR #444 with the current branch and decide how to preserve both protections under an explicit approved baseline lifecycle. The current PR #453 still has freeze guard FAILURE, while Production CI and ONE GLOBAL Contract Tests passed on commit `0ccc4c0c26f260d0b18b823c852bcc470db3e81c`. The branch diverges from main (195 ahead, 35 behind as checked on 2026-11-07). Keep this as the first integration blocker, not an excuse to delete safety code.

## Verification 2026-11-07 20:36 Europe/Rome
- Direct blob comparison of `main` and the integration branch confirms **identical** `package.json` blob SHA `4c844fdccce774f766994d5f3654ed8a7bfedd14` and `scripts/refresh-twelve-data-batch-evidence.mjs` blob SHA `2b088017745a4cef76f59640adb986228ee6abf7`. The two known freeze drifts are therefore **shared with main**, not newly introduced by PR #453. Do not try to repair them by merging main into the integration branch or by reverting only branch-specific changes.
- Compare `main...fix/one-global-integration-safety-reconcile-20261107`: 196 ahead, 37 behind, 47 changed paths. Neither frozen file appears in the branch-to-main changed-file list.
- Commit `2e3b6331e6c6f2a0139766db59288f5c37efa1a7`: Production CI and ONE GLOBAL contracts PASS; PAPER Core Freeze Guard FAIL. This means the baseline issue needs its own audited fix, not a blind integration merge.
- Next: inspect #444's exact preserved-baseline restoration, verify enhanced Twelve Data code remains invoked through a non-frozen adapter, then compare frozen-file hashes to the campaign fingerprint and run full CI. Never suppress the freeze guard.
