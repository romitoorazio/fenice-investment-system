# Fenice V7 — Realtime non-US source research

This document records candidate market-data sources for independent non-US realtime validation. It is research evidence only; it does not grant PAPER eligibility or unlock LIVE trading.

Admission policy remains fail-closed: exact venue/MIC identity, fresh provider timestamp, verified realtime entitlement/licensing, independent source family, provenance and read-only market-data path are required before a source can count toward PAPER quorum.

## Verified 2026-09-28 from official sources

1. **Directa Darwin API / realtime data** — Directa's official API pages state that external applications can receive realtime information, that API access is controlled and requires a regular Directa account, and that the separate realtime + historical data service is listed at EUR 20/month (activation month and following month free; later waived under the stated commission condition). This materially strengthens Directa as Fenice's preferred broker-side read-only candidate, but it does **not** prove that the user's account currently has the data entitlement enabled, nor does it prove exact MIC coverage. Fenice therefore remains default-deny until runtime/persisted entitlement evidence and exact broker ticker + ISIN + MIC mapping exist.
2. **Euronext Stream API / Web Services** — Euronext officially offers realtime data from all Euronext markets through a public-Internet WebSocket Stream API, and separately documents REST Web Services for quotes, last price, trades and reference data. Euronext also states that real-time direct-feed use can require a market-data licensing agreement. This is a strong exact-venue candidate for XPAR/XAMS/XMIL/etc., but PAPER admission requires the applicable agreement/entitlement plus exact MIC/instrument mapping and provider timestamps.
3. **Deutsche Boerse / Xetra** — Deutsche Boerse states that realtime data for Xetra/Eurex is distributed via CEF direct feeds and vendors. It also documents Cloud Stream products delivered over Internet/WebSocket in standardized JSON/GPB for selected Xetra products. Exact XETR evidence remains attractive, but PAPER admission requires the applicable entitlement/non-display terms and product coverage verification.
4. **Cboe Europe** — Cboe states that one licence covers more than 6,200 securities across major European markets, with realtime Top/Last Sale/depth feeds, direct or vendor connectivity, and free realtime trials. This is a strong independent pan-European source family, but Cboe venue data must not be mislabeled as primary-listing MIC evidence.

## Other priority candidates

5. **EODHD EU WebSocket** — realtime EU trades/quotes can be useful as a cross-venue validation source. Requires plan entitlement, source/venue mapping and licensing verification before PAPER use.
6. **dxFeed** — realtime/delayed/historical APIs with EU equities coverage; candidate subject to commercial feed entitlement and exact source/venue mapping.
7. **Interactive Brokers Web API** — streaming Level 1 data with exchange-specific requests; most securities require market-data subscriptions. Candidate only if an authorized account is connected later.
8. **Saxo OpenAPI** — realtime streaming prices are supported; non-FX market data requires authorized account/data access and applicable terms.

## Explicitly not promoted

- **Yahoo Finance**: validation-only cross-check.
- **Finnhub**: no PAPER promotion without explicit international realtime exact-venue entitlement evidence.
- **Marketstack**: no PAPER promotion from EOD/delayed coverage.
- **Alpha Vantage**: not used for international realtime certification under current policy.

## Admission rule

No provider is PAPER-eligible merely because an API responds, a public page says that realtime exists, or an environment variable says realtime is enabled. Evidence must be persisted, hash-bound, exact-MIC, timestamp-fresh and matched by a runtime entitlement claim. Two independent PAPER-eligible source families are required before new risk; three are preferred. Broker/order writes and LIVE remain outside this V7 workstream.
