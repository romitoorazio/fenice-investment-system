# Fenice V7 — Realtime non-US source research

This document records candidate market-data sources for independent non-US realtime validation. It is research evidence only; it does not grant PAPER eligibility or unlock LIVE trading.

Admission policy remains fail-closed: exact venue/MIC identity, fresh provider timestamp, verified realtime entitlement/licensing, independent source family, provenance and read-only market-data path are required before a source can count toward PAPER quorum.

## Verified 2026-09-28 from official sources

1. **Directa Darwin API / realtime data** — Directa's official API pages state that external applications can receive realtime information, that API access is controlled and requires a regular Directa account, and that the separate realtime + historical API data service is listed at EUR 20/month (activation month and following month free; later waived under the stated commission condition). Directa also states that quotes depend on the markets enabled for the account. Its official quote-services page says XETRA, EUREX, CME and EuroTLX quotes are separately paid market-data services, while other realtime quotes are available under Directa's stated customer conditions. Therefore an API/datafeed subscription alone is **not** evidence that a particular MIC is realtime-entitled. Fenice must prove both the API/datafeed entitlement and the market-specific entitlement for the requested venue before PAPER admission.

   Directa's public documentation also identifies instruments by ticker/codalfa and exposes ISIN for informational/reference purposes. That strengthens ticker+ISIN identity checks but still does not establish the execution MIC. The MIC must come from a separately verified broker-venue mapping. The local DAPI feed includes a source-supplied time field on PRICE/BIDASK messages; Fenice treats it as a provider timestamp only when it can be normalized unambiguously to an absolute timestamp. A local receipt time must never be substituted to make stale/ambiguous provider data appear fresh.

   **Current Fenice status:** preferred broker-side read-only candidate, DEFAULT DENY. No account entitlement is inferred from documentation, environment variables or API connectivity. Runtime/persisted entitlement evidence, exact broker ticker + ISIN + MIC mapping, and a fresh parseable provider timestamp remain mandatory.

2. **Euronext Stream API / Web Services** — Euronext officially offers realtime data from all Euronext markets through a public-Internet WebSocket Stream API, and separately documents REST Web Services for quotes, last price, trades and reference data. Euronext also states that real-time direct-feed use can require a market-data licensing agreement. This is a strong exact-venue candidate for XPAR/XAMS/XMIL/etc., but PAPER admission requires the applicable agreement/entitlement plus exact MIC/instrument mapping and provider timestamps.
3. **Deutsche Boerse / Xetra** — Deutsche Boerse states that realtime data for Xetra/Eurex is distributed via CEF direct feeds and vendors. It also documents Cloud Stream products delivered over Internet/WebSocket in standardized JSON/GPB for selected Xetra products. Deutsche Boerse separately documents High Precision Timestamps for Xetra/Eurex market events. Exact XETR evidence remains attractive, but PAPER admission requires the applicable entitlement/non-display terms and product coverage verification.
4. **Cboe Europe** — Cboe documents European equity market data and proprietary depth/execution datasets. Cboe venue data is useful as an independent pan-European family, but it must retain its own venue identity and must never be relabeled as primary-listing MIC evidence. Cboe DataShop explicitly restricts external redistribution for its proprietary Multicast PITCH dataset, so Fenice must verify licensing for the intended internal/non-display use before promotion.

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

No provider is PAPER-eligible merely because an API responds, a public page says that realtime exists, or an environment variable says realtime is enabled. Evidence must be persisted, hash-bound, exact-MIC, timestamp-fresh and matched by a runtime entitlement claim. For broker feeds, both feed/API access and venue-specific market-data entitlement must be proven where the broker distinguishes them. Two independent PAPER-eligible source families are required before new risk; three are preferred. Broker/order writes and LIVE remain outside this V7 workstream.
