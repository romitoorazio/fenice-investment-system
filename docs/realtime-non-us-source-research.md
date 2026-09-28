# Fenice V7 — Realtime non-US source research

This document records candidate market-data sources for independent non-US realtime validation. It is research evidence only; it does not grant PAPER eligibility or unlock LIVE trading.

Admission policy remains fail-closed: exact venue/MIC identity, fresh provider timestamp, verified realtime entitlement/licensing, independent source family, provenance and read-only market-data path are required before a source can count toward PAPER quorum.

## Verified 2026-09-28 from official sources

1. **Directa Darwin API / realtime data** — Directa's official API pages state that API access is controlled, that trading API access is free, and that the separate realtime + historical API data service is listed at EUR 20/month, with the published waiver conditions. Directa explicitly says that the quotations delivered depend on the markets enabled on the account. Its quote-services documentation identifies XETRA, EUREX, CME and EuroTLX as separately paid quotation services. Its account-management documentation also provides a distinct workflow for enabling realtime quotations by market. Therefore an API/datafeed subscription alone is **not** evidence that a particular MIC is realtime-entitled. Fenice must prove both the API/datafeed entitlement and the market-specific quotation entitlement for the requested venue before PAPER admission.

   Directa's public documentation identifies instruments by broker symbols and exposes reference identifiers such as ISIN, but this still does not by itself establish the execution MIC. The MIC must come from a separately verified broker-venue mapping. The local DAPI feed includes a source-supplied time field on PRICE/BIDASK messages; Fenice treats it as a provider timestamp only when it can be normalized unambiguously to an absolute timestamp. A local receipt time must never be substituted to make stale or ambiguous provider data appear fresh.

   **Current Fenice status:** preferred broker-side read-only candidate, DEFAULT DENY. No account entitlement is inferred from documentation, environment variables, API connectivity, or a generic realtime subscription. Runtime/persisted entitlement evidence, exact broker ticker + ISIN + MIC mapping, market-specific entitlement and a fresh parseable provider timestamp remain mandatory.

2. **Euronext Stream API / Web Services** — Euronext officially offers realtime data from all Euronext markets through a public-Internet WebSocket Stream API and separately documents REST Web Services for quotes, last price, trades and reference data. Euronext's market-data policy explicitly distinguishes **Display Use** from **Non-Display Use**, including automated calculations and algorithms for automated order or quote generation, and says a direct licence may be required. Euronext Stream PRO is explicitly described for realtime trading/analytics and algo-trading use cases. This is a strong exact-venue candidate for Euronext MICs, but PAPER admission requires the applicable non-display agreement/entitlement, exact MIC/instrument mapping and provider timestamps.

3. **Deutsche Boerse / Xetra** — Deutsche Boerse states that realtime Xetra/Eurex data is distributed through CEF direct feeds and vendors. Its Cloud Stream documentation describes an Internet WebSocket endpoint secured by API-key authentication; the published manual shows `wss://md.deutsche-boerse.com/stream` and requires `X-API-Key`. Cloud Stream products can provide selected Xetra realtime information in JSON/GPB. Exact XETR evidence is therefore technically feasible, but API-key possession alone is not an entitlement claim: Fenice still requires product coverage, licence/non-display rights, exact instrument/MIC identity and provider timestamps before PAPER admission.

4. **Cboe Europe** — Cboe venue data remains useful as an independent pan-European family, but it must retain its own venue identity and must never be relabeled as primary-listing MIC evidence. Licensing for intended internal/non-display automated use must be verified before promotion.

## Other priority candidates

5. **EODHD EU WebSocket** — realtime EU trades/quotes can be useful as a cross-venue validation source. Requires plan entitlement, source/venue mapping and licensing verification before PAPER use.
6. **dxFeed** — realtime/delayed/historical APIs with EU equities coverage; candidate subject to commercial feed entitlement and exact source/venue mapping.
7. **Interactive Brokers Web API** — streaming Level 1 data with exchange-specific requests; most securities require market-data subscriptions. Candidate only if an authorized account is connected later.
8. **Saxo OpenAPI** — realtime streaming prices are supported; non-FX market data requires authorized account/data access and applicable terms.

## Evidence packet required before promotion

For every candidate provider + MIC pair, V7 must retain a machine-verifiable evidence packet containing at least:

- provider/source-family identifier and exact MIC;
- broker/provider instrument identifier plus ISIN when available;
- evidence that the account/feed is authorized for realtime data;
- separate market/product entitlement evidence where the provider distinguishes generic API access from venue data rights;
- intended usage classification (display/non-display/internal/automated) and licence evidence compatible with that use;
- provider-supplied timestamp semantics and a fresh absolute timestamp observed at runtime;
- currency and session-state checks;
- provenance/evidence hash and observation time;
- explicit read-only path; no broker/order write credential is accepted as a substitute for market-data evidence.

Missing, ambiguous, expired or mismatched fields must resolve to `DEFAULT_DENY` and must not contribute to PAPER quorum.

## Explicitly not promoted

- **Yahoo Finance**: validation-only cross-check.
- **Finnhub**: no PAPER promotion without explicit international realtime exact-venue entitlement evidence.
- **Marketstack**: no PAPER promotion from EOD/delayed coverage.
- **Alpha Vantage**: not used for international realtime certification under current policy.

## Admission rule

No provider is PAPER-eligible merely because an API responds, a public page says that realtime exists, or an environment variable says realtime is enabled. Evidence must be persisted, hash-bound, exact-MIC, timestamp-fresh and matched by a runtime entitlement claim. For broker feeds, both feed/API access and venue-specific market-data entitlement must be proven where the broker distinguishes them. Two independent PAPER-eligible source families are required before new risk; three are preferred. Broker/order writes and LIVE remain outside this V7 workstream.
