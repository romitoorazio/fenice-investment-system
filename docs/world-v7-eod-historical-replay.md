# FENICE World V7 — Historical daily research replay

Status: **implemented as a V7-only research module; not PAPER certified**.
This is an EOD historical *backtest*, not a live/forward PAPER fill system. V6's frozen risk core, counters, journal, broker connectors and Directa are untouched.

## Data flow
1. The existing daily EOD runner queries Alpha Vantage with the existing API key and limited request budget.
2. Only a region/currency-matched provider symbol with a valid, chronologically ordered historical daily series can enter the new replay. This does **not** independently prove the exchange MIC or the rights to use the feed.
3. The isolated world-v7-daily-historical-replay module computes a 5/20-day directional signal using **only completed closes through D** and hypothetically fills at **D+1's open**, never at D's close.
4. Simulation starts with **synthetic €1,000**. Whole shares, a 5% initial position ceiling, €1 minimum transaction fee, 0.15% variable fee and 5-bps adverse price impact are explicit assumptions, not promises of broker costs or liquidity.
5. Non-EUR symbols require date-indexed **prior-day** FX observations; no same-day hindsight or guessed FX conversions. Histories with absent FX cannot place trades.
6. The replay can create historical BUY and SELL records without submitting orders or changing V6. It is deterministic on rerun; the public output includes **aggregate metadata only**, no raw OHLC, provider quotes, positions, or detailed trades.
7. The existing global research page shows the historical-replay count separately from realtime PAPER fills. The scheduled GitHub Actions EOD observer remains cloud-only and requires no PC.

## Limits and next gates
- Historical bars are not forward-observed order fills. The public historicalResearchTransactions count MUST NEVER be added to V6 or V7 realtime PAPER evidence.
- No historical data is invented if Alpha Vantage does not return a validated symbol/series. The provider probe on 20 October 2026 had not yielded validated international prices.
- Region and currency matches do not certify exact exchange MIC.
- Source rights, redistribution limits, strategy robustness, FX source terms, survivorship bias and adjustment for corporate actions remain unresolved. Inputs remain RESEARCH ONLY.
- The replay uses daily-bar opens retrospectively, with no intraday liquidity, bid/ask, market-halt events, partial fills, audited opening timestamps or independent walk-forward validation. Same-date sorting across regions is a deterministic research convention, not the actual chronology of market openings.
- The backtest cannot prove profitability or future executability on Directa.
- Tokyo stays blocked until a legitimate dated FX-to-EUR history is connected. ENEL/Deutsche Telekom can remain unavailable if the feed fails to identify their exact research symbols.
- Subsequent work: verified global price ingestion, independent instrument identity, FX, proper corporate-action-adjusted data, benchmark comparison, drawdown analysis and durable forward ledger before operational readiness claims.

## Regression commands
- node scripts/test-world-v7-eod-research.mjs
- node scripts/test-world-v7-daily-historical-replay.mjs

Tests use **synthetic fixtures only**. An offline test PASS does not establish external provider availability. Never commit API keys or raw licensed quote files.

## Pilota accessibile (21 ottobre 2026)

XETR usa temporaneamente DTE (Deutsche Telekom) al posto di SIE (Siemens) **solo nel pilota di replay giornaliero**. La prova del 21 ottobre ha restituito 100 barre EOD per SIE.DEX ma 20 BUY scartati perché una singola azione Siemens era più costosa del limite sintetico di €50 per posizione. Il prezzo storico Xetra DTE del 20 ottobre è indicato intorno a €25,72 da fonti pubbliche; **non è un prezzo accettato da FENICE finché il provider non restituisce barre verificate**. Questa modifica non cancella Siemens dal master strumenti o dalle analisi globali. Non introduce ordini LIVE e non cambia la V6.
