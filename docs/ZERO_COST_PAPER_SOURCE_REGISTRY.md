# Zero-Cost PAPER Source Registry

Status: **fail-closed**  
Last reviewed: **2026-09-23**

This registry documents which market-data source families Fenice may consider for zero-cost PAPER execution certification. It does **not** authorize live trading, does not replace runtime freshness/quorum checks, and does not make a provider sufficient on its own.

## Certification rule

A source family may contribute to PAPER quorum only when all of the following are true:

1. The family is explicitly registered in `lib/trading/paper-evidence-policy.ts`.
2. The observation is realtime and fresh under the execution-data age limit.
3. The collector has verified provider-specific provenance.
4. The observation is tagged with explicit PAPER entitlement/provenance.
5. The market-data quorum still has at least two independent eligible source families and passes dispersion/freshness controls.

Unknown providers, delayed feeds, daily-close feeds, unverified public tickers and caller-supplied provenance from an unregistered family remain `VALIDATION_ONLY`.

## Approved families

### Twelve Data (`twelve-data`)

**Zero-cost status:** approved for eligible US-equity PAPER evidence.

Official documentation reviewed on 2026-09-23 states that the Basic plan is free and includes realtime US equities and ETFs, with limited API credits. Twelve Data also states that its default US realtime feed is sourced from venues that do not require additional licensing, while broader consolidated coverage is a separate product.

Official references:
- https://twelvedata.com/pricing
- https://support.twelvedata.com/en/articles/9935903-us-equities-market-data
- https://support.twelvedata.com/en/articles/5335783-trial

Fenice must still verify symbol/venue/timestamp and freshness for every observation. Free-plan availability does not waive quorum requirements.

### Alpaca (`alpaca`)

**Zero-cost status:** approved for eligible US-equity PAPER evidence from the IEX feed only.

Official Alpaca documentation reviewed on 2026-09-23 states that the Basic market-data plan is free and provides realtime equities data from IEX. Full SIP/all-exchange realtime coverage is paid and is not required by Fenice's zero-cost PAPER policy.

Official references:
- https://docs.alpaca.markets/us/v1.4.2/docs/about-market-data-api
- https://docs.alpaca.markets/us/docs/market-data-faq

Fenice must request the IEX feed explicitly, authenticate the market-data request, validate bid/ask and provider timestamp, and apply the normal freshness/quorum gates.

### Directa (`directa`)

**Zero-cost requirement:** optional only; never a prerequisite.

Directa may contribute only when the separate read-only DAPI evidence path proves entitlement, instrument identity, executable top-of-book and freshness. Paid Directa realtime market data is **not** required for Fenice certification. If entitlement is absent, Directa remains validation-only and the system must continue to rely on independent zero-cost sources.

## Explicitly not approved for zero-cost PAPER certification

### Alpha Vantage (`alpha-vantage`)

Alpha Vantage remains useful for research, historical validation and indicators, but it is not an approved zero-cost realtime US-equity PAPER source. Official documentation reviewed on 2026-09-23 states that realtime and 15-minute delayed US stock quote data require a premium membership. Merely sending `entitlement=realtime`, receiving a response, or setting `provenanceVerified=true` must therefore never promote Alpha Vantage to PAPER under the zero-cost policy.

Official reference:
- https://www.alphavantage.co/documentation/

### Yahoo, Stooq, Coinbase, Kraken and unknown providers

These families may be useful for research, cross-checks or validation, but they are not currently registered as zero-cost PAPER-certifying families. They remain `VALIDATION_ONLY` unless a future review adds provider-specific, documented and tested certification rules.

## Change control

Adding a new family requires all of the following in one reviewed change:

- authoritative provider documentation proving the relevant zero-cost/realtime entitlement and permitted internal use;
- provider-specific provenance validation in the collector;
- regression tests proving that missing, stale, delayed, unknown or self-asserted evidence fails closed;
- no reduction of the two-independent-family quorum;
- `liveTradingAllowed=false` preserved.

This registry records capability evidence only. It never backdates the PAPER campaign and never authorizes real orders.
