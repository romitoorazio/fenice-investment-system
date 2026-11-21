# FENICE ONE GLOBAL — roadmap to verifiable global PAPER

Status: implementation plan, NOT a declaration of production readiness. Scope: PR #410, branch architecture/fenice-one-global-v1. No LIVE trading, broker connections, key/secret changes, changes to V6/V7/V8 historical ledgers, backfill, or merge to main without explicit review and approval.

## Definition of done
A scheduled, exchange-neutral global engine observes verified real trading sessions, retrieves timestamped independent market and FX evidence, generates reproducible candidate signals, applies conservative virtual execution, and appends an auditable immutable PAPER ledger. It publishes per-market coverage, rejected evidence reasons, net EUR P&L and risk metrics, with all inputs and run IDs traceable. All required CI gates must PASS; no unsupported PASS claims.

## P0 — stabilize contract tests and governance
- Verify ONE GLOBAL workflow on latest head, investigate failures from job logs, add regression tests before closing issues.
- Track the historical V6 Core Freeze Guard independently. Main and ONE GLOBAL have identical current blobs for package.json and scripts/refresh-twelve-data-batch-evidence.mjs, both different from V6 baseline 4ccb2d2c21b0545de5b99149222afa5b444bb4c2. Do not change the baseline, guard, or frozen files to manufacture a PASS.
- Add an evidence-before-fill cutoff to FX, calendar and quote consensus; reject mixed or future observations. Test both EUR and non-EUR venues.
Gate: ONE GLOBAL contract suite PASS on current head; historical guard discrepancy documented without bypass.

## P1 — actual session and data ingestion (highest functional blocker)
- Implement read-only adapters behind provider interfaces: exchange calendar/continuous trading session, per-instrument bid/ask with MIC/currency/provider-family/timestamp, FX base/EUR, and source provenance. No static venue metadata may assert OPEN.
- First validate XTKS, XMIL, XETR and XNYS, then extend to XHKG, XSHG, XNSE, XLON, XNAS; equal evaluation policy, no US-first market-open gate. Preserve explicit unsupported/closed/stale statuses.
- Verify actual licensing, access, rate limits and free-tier suitability for each provider before enabling it. No guessed independent families; mirrors of one underlying feed count as one family.
- Cache safely with UTC timestamps and exchange-local dates, no fabricated quotes, no holiday inference. Fail closed if two genuinely independent sources are not available.
Gate: at least one real, source-linked, recent evidence bundle accepted in each enabled region; unsupported regions explicitly reported, not silently skipped.

## P2 — global opportunity radar
- Universe, symbol-to-MIC identity and currency mappings; liquidity and data-quality eligibility; 2–10-day and 2–8-week ranking with documented signal version, timestamp, reason and risk.
- Include Tokyo/Asia, Europe and Americas equally; rank only verified observations; report rejected candidates and coverage.
Gate: deterministic replay of a real captured evidence snapshot yields the same ranked candidate list, with no lookahead.

## P3 — PAPER virtual execution and accounting
- Separate signal, virtual order, quote snapshot, fill, position, cash, fees, FX and mark-to-market events. Conservative bid/ask and bounded slippage; reject future evidence, duplicate signal IDs, missing FX, stale sessions and invalid position/cash transitions.
- Use an append-only hash-chained ledger; replay to compute net EUR P&L, unrealized P&L, drawdown, win rate and cost attribution. Preserve source snapshots/digests.
- Never write actual broker orders. Keep V6/V7/V8 ledgers intact; use isolated ONE GLOBAL virtual campaign.
Gate: verified signal -> virtual fill -> ledger -> net result on real sourced data, with independent replay and negative tests.

## P4 — strategy evaluation and operational quality
- Forward-only PAPER observation plus separate, clearly labeled historical research; no invented fills or backfill into certified ledger.
- Measure signal precision, turnover, latency, missing data, slippage sensitivity, regional participation, daily coverage and drawdown; compare V6/V7/V8 read-only.
Gate: reproducible evaluation window with known sample size, costs and limitations; no claim of profitability without evidence.

## P5 — automation, dashboard and owner acceptance
- GitHub Actions schedule reliability and concurrency/idempotency; note schedules on GitHub execute only from default branch. Do not claim the PR-only schedule is live.
- Dashboard: market-by-market status, candidate ranking, source provenance, virtual trades, cash, P&L, reasons for no-trade, 09:00 Italy radar, adjustable virtual capital.
- Owner acceptance checklist and documented manual rollback; no merge/main/live/Directa activation without explicit authorization.
Gate: end-to-end supervised run and repeatable automated PAPER runs with green required CI and owner-reviewed report.

## Work order / immediate next changes
1. Verify latest FX-lookahead test workflow; fix any failing regression before new features.
2. Build read-only evidence-bundle capture contract and fixture-based adapter tests, explicitly distinguish synthetic vs real.
3. Implement one documented, lawful, available provider adapter and calendar source, with timeout/rate-limit/freshness failures.
4. Add second truly independent quote family and independently sourced FX evidence for non-EUR venues; verify a real market session.
5. Implement end-to-end virtual PAPER accounting and source-linked reporting; expand to remaining exchanges.

Every PR update must report: changed files, commit, workflow URL and exact conclusion, evidence classification (synthetic vs real), unresolved blockers, and next verifiable gate.
