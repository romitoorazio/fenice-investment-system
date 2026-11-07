# FENICE ONE GLOBAL — integration gate (2026-11-06)

## Evidence from GitHub
- ONE GLOBAL contract workflow run #123 succeeded on commit b6a44c132f749e239044e74011a7a54c61873a8a. This validates synthetic contract tests, not real PAPER execution.
- Compare main...ONE GLOBAL: 105 commits ahead, 7 behind, 32 changed files. At comparison time, all 37 file paths changed by main since the branch point were under data/. The ONE GLOBAL branch changes lib/global/, scripts/, docs/, a workflow and one UI component. **File paths do not overlap in that comparison**, but Git mergeability and full CI still require independent confirmation.
- PR #432 is the single draft integration proposal. Never merge automatically.

## Blocking conditions before production PAPER
1. Real exchange calendar evidence with provenance verified independently of caller-supplied authoritative:true; include holidays, time zone, session phase and source timestamps.
2. At least two genuinely independent quote feeds per venue/instrument, with instrument identity, currency, timestamp, bid/ask and provider entitlements verified. An HTTPS response or a provider label is not sufficient.
3. For non-EUR markets, independently verified FX observations, freshness, and bid/ask spread/cost model; no synthetic cross-currency profit.
4. Opt-in live read-only provider coverage run with explicit global instrument universe and secret supplied by GitHub environment; do not log secret. The existing probe reports **verifiedMarketEvidence: 0** by design.
5. End-to-end actual-sourced PAPER signals, virtual fills, durable idempotent ledger, reconciliation and per-market success/failure counters, with repeatable run links. Current durable bridge only credits synthetic test events.
6. Full integration CI against current main; review changes to UI and scheduled workflow, and require explicit approval before merging.

## Safety
No Directa LIVE orders or broker connectivity, no mutation of V6/V7/V8 ledgers, no secret rotation or publication, no fictitious verified PAPER trades. Keep real PAPER certification false until every evidence gate is demonstrated.

## Priority
Stop adding synthetic-only micro-features. Next implementation should connect a **read-only**, source-attributed multi-venue probe to a reproducible diagnostic workflow, then solve verified provider/calendar evidence before enabling real-source PAPER persistence.
