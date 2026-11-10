# FENICE ONE GLOBAL — continuity of PAPER controls (10 November 2026)

This note describes three distinct operations. It is not an approval to trade real money.

## 1. Immutable V6 and B2 campaigns

The V6 baseline started 2026-09-25. Against its 92 frozen files, exactly two paths differ on `main`:

- `package.json`: addition of the non-trading regression command `paper:bottlenecks:test`.
- `scripts/refresh-twelve-data-batch-evidence.mjs`: additional checks against future-dated FX values, prioritization of a missing second source and deferring a data write until FX validation succeeds.

The V7 B2 pinned digest differs from the current inspected core because the same Twelve Data script changed. The previous B2 owner approval and its legacy journal remain unchanged; the B2 writer **must keep refusing** to execute under an unapproved digest.

The new `scripts/audit-paper-baselines.mjs` and `frozen-baseline-reconciliation.yml` report exact blob/digest differences without re-signing an old campaign. The V6 guard is intentionally still enforced; **a green CI result does not replace approval**.

**To re-authorize a frozen B2 PAPER campaign**, review the actual new code SHA and SHA-256, preserve a copy of the superseded owner approval in Git history, record explicit owner assent referencing the exact code revision, set a prospective effective date and ensure that any observations made before that date are never attributed to the new baseline. Do not alter old ledger hashes, flip `liveTradingAllowed`, or silently use old approval for changed code. V6 retirement also requires an explicit, auditable lifecycle transition.

## 2. V8 technical collection

V8 is an independently approved, pinned, **technical-only** PAPER experiment. The original start is 2026-11-03, minimum 30 calendar days, 25 validated distinct days and 10 independent technical samples; its historical counts are not reset by this change. The V8 execution/lab workflow and six pinned core files are unmodified here.

The V8 quote methodology is specific to the currently qualified US quartet SPY/QQQ/AAPL/MSFT and authenticated Alpaca + Twelve Data observations; it must never be presented as three global executable markets. Other global research can continue without counting as certified PAPER execution.

## 3. Prospective experimental virtual exits and EUR accounting

`data/paper-v8-shadow-exits.json` is a **separate** technical-only exit chain referencing already-validated V8 BUY sample hashes. The first successful run records `activatedAt` and cannot produce a backward-looking exit. Any later simulated sale requires fresh two-provider paper-eligible quotes, authoritative OPEN US session, verifiable EUR FX, a different trading date, 24-hour minimum holding period, a matching original sample and one sale per UTC day.

Each sale stores original entry notional and fee, entry reference hash, quote source proof and digest, exit price with 5-basis-point simulated slippage, EUR 1 exit fee and realized **virtual** net P&L in EUR. A replay rejects duplicate sale days, manipulated P&L, non-matching sample hashes, future/stale data and any broker/LIVE flag.

`scripts/report-v8-virtual-pnl.mjs` separately values unsold V8 technical BUY samples at the **last validated historical quote** and shows the quote age. This is an *unrealized as-of estimate*, not an executable current quote. The accounting report distinguishes:
- `realizedNetEuro`: only virtual simulated exits written prospectively after activation
- `unrealizedNetEuro`: hypothetical net liquidation, if all open positions can be valued
- `phase9CertifiedClosedTrades = 0`: neither V8 technical BUY samples nor this technical experiment independently proves profitable investment strategy signals

One daily sample exit is attempted; proof failure results in no exit, not a fabricated fill or report. The environment uses the pre-existing free market-data adapters; no Directa access, API key replacement or paid-data subscription is authorized.

## Fase 9 status

The Phase 9 audit has its own strict unfulfilled requirements: at least 10 genuinely **forward closed strategy** PAPER trades, 3 independently eligible markets/countries and 3 distinct trading days, with at least two certified executable quote sources. Experimental V8 closes are **not Phase 9 strategy closes**. The auditor must continue to report NOT_CERTIFIED until a separately approved, real-forward strategy execution chain satisfies those conditions.

This scope keeps the previously signed V6/B2/V8 snapshots and all earlier days/samples intact.
