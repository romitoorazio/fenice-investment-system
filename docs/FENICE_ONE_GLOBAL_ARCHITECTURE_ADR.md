# FENICE ONE GLOBAL — architecture decision record (draft)

Status: PROPOSED; isolated branch, no production activation.

## Objective
One worldwide opportunity discovery and PAPER simulation system, without privileging US exchanges. Preserve V6/V7/V8 evidence as immutable historical records. Technical validation never certifies investment performance.

## Root cause established from existing code
The current PAPER execution workflow gates on Alpaca's `US_EQUITIES` clock, and the V8 sample writer consumes that US-only session. A globally scoped discovery radar therefore cannot automatically create market-specific PAPER samples. A successful GitHub workflow can also mean observation-only with skipped sample steps.

## Proposed bounded architecture
1. **Venue registry**: MIC/exchange, timezone, exchange-specific calendar and holidays, trading phase, currency, supported instrument types, provider coverage, and quote-latency policy. Unknown calendar/phase => no sample.
2. **Global discovery**: scan all configured venues according to local sessions, including overnight in Europe; rank candidates by documented catalyst, liquidity, volatility and risk. Discovery is separate from execution eligibility.
3. **Evidence adapters**: normalize provider timestamps, bid/ask, currency, symbol-to-venue mapping, provenance and licensing. Require at least two independent source families for a V8-grade sample; no synthetic quote substitution. Reject stale, crossed, inconsistent or future quotes.
4. **Signal evaluator**: deterministic versioned strategy, decision reason, entry/exit/invalidation, max exposure and drawdown controls. Track rejected signals and performance as well as accepted ones; no guaranteed returns.
5. **Virtual execution**: venue-specific session check, spread/slippage, local fees, FX and fill model; paper-only, no broker SDK/network dependency. Idempotency key = campaign + venue + instrument + session date + strategy version + signal ID. Append-only event ledger and replayable audit.
6. **Independent evaluation**: forward out-of-sample results, realistic costs, survivorship/selection-bias checks, benchmark comparisons and false-signal rates. Separate engineering acceptance from strategy certification.
7. **Directa adapter**: entirely isolated, disabled by default. No automatic transition from PAPER to LIVE; requires a separate explicit approval and independent security review.

## Migration and non-negotiable safeguards
- Keep all existing V6/V7/V8 ledgers and pinned V8 approval untouched. Do not backfill or convert historical fills to new campaign credit.
- New global campaign uses distinct IDs, schema, tests and separate evidence files. No alteration of approved V8 core-file hashes or LIVE/broker flags.
- Stage 1: inventory all existing modules and their dependencies; create contract tests for venue calendars, freshness, FX, idempotency, append-only ledger and failure modes.
- Stage 2: implement read-only venue registry and market-clock adapters, test Tokyo, Hong Kong, India, Milan, Frankfurt, London and US using documented calendar fixtures.
- Stage 3: integrate eligible existing providers and verify licensing, market data entitlements and actual coverage before claiming support.
- Stage 4: build independent worldwide virtual execution in a separate pipeline and compare against old V8 without interfering with it.
- Stage 5: shadow-run, review reports, run CI and explicit human approval before any migration to production. Never switch on LIVE as part of migration.

## Open-source evaluation
- QuantConnect LEAN (Apache-2.0): evaluate calendar, security and fill-model architecture; reuse only compatible code with required notices.
- NautilusTrader (LGPL-3.0): evaluate event-driven patterns; assess obligations before copying any code.
- Do not blindly import entire frameworks or copy proprietary systems. Check upstream licenses, maintenance and operational cost.

## Acceptance criteria
- Venue tests cover open/closed/holiday/DST/half-day and unknown-market fail-closed.
- Simulated orders never call Directa or other real broker endpoints.
- All sample records have exchange, instrument, timestamps, independent provenance, currency, fees, FX and deterministic replay.
- Duplicate signals do not duplicate simulated fills; missing quotes do not create fake fills.
- Global coverage report explicitly distinguishes monitored, data-ready and PAPER-ready exchanges.
- CI proves no regression in legacy evidence isolation and safety flags.

## Next engineering change
Implement the registry and contract tests in isolation. Do not rewrite the pinned V8 pipeline until independent tests and a migration review are complete.
