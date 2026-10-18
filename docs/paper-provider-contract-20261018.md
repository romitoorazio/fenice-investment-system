# PAPER provider contract and diagnostics - 18 October 2026

## Problem and result

The persisted quote producer already supports Alpaca's authenticated IEX latest-trade fallback and Twelve Data's minute quote timestamp when `last_quote_at` is absent. The runtime gate and the UI had independent, incomplete method lists, so valid producer observations could lose their independent-source quorum.

Runtime, UI diagnostics and recorded-quantity portfolio valuation now use the same method recognizer. Recognition does not establish entitlement, provenance, PAPER eligibility, freshness, currency agreement or source redundancy; those checks still apply. Valuation retains its existing Alpaca/Twelve Data provider scope. Alpaca trade fallback samples in Mercati are explicitly labelled as last trades without verified bid/ask quotes.

The Mercati page explicitly labels `SOURCE_CONFLICT` as blocked. Unknown diagnostic states also fail closed rather than looking like recent candidate sources.

## Temporal boundaries

Diagnostic freshness uses the original millisecond timestamps. It no longer rounds a quote one millisecond in the future to zero seconds old, accepts a five-second future allowance, or rounds a quote beyond 120 seconds back into the valid interval. Runtime coverage also cannot predate the quote batch it summarizes.

These changes do not repair or certify the frozen V6 risk core. Its future-quote defect is still reported as `CORE_PATCH_PENDING`; PR #224 remains a separate baseline change.

## Verification

- Producer timestamp parsing is exercised through the actual Twelve Data parser and passed into runtime, UI diagnostics and recorded-quantity valuation.
- Supported fallback methods retain quorum separately and together; stale, future, unverified, LIVE, validation-only, unknown-method and wrong-family observations remain blocked.
- Conflicting quotes get the blocked user-facing message; unknown states cannot look like valid candidate sources.
- Millisecond future/expiry boundaries and inverted quote/coverage chronology are covered by regressions.
- Frozen baseline fingerprint and continuation preparation must remain unchanged. No historical counters or approvals are edited.

No quote refresh, order staging, broker write, campaign renewal, strategy promotion or new subscription is performed by this change. PAPER certification, broker reconciliation and economic performance remain separate evidence requirements.
