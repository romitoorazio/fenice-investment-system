# Fenice V7 — Realtime non-US source research

This document records candidate market-data sources for independent non-US realtime validation. It is research evidence only; it does not grant PAPER eligibility or unlock LIVE trading.

Admission policy remains fail-closed: exact venue/MIC identity, fresh provider timestamp, verified realtime entitlement/licensing, independent source family, provenance and read-only market-data path are required before a source can count toward PAPER quorum. For automated Fenice processing, the evidence must also prove a current right compatible with internal non-display/automated use; a display subscription, API key or trial is not silently reused.

## Verified 2026-09-28 from official sources

1. **Directa Darwin API / realtime data** — Directa's official API pages state that API access is controlled, that trading API access is free, and that the separate realtime + historical API data service is listed at EUR 20/month, with the published waiver conditions. Directa explicitly says that the quotations delivered depend on the markets enabled on the account. Its quote-services documentation identifies XETRA, EUREX, CME and EuroTLX as separately paid quotation services. Its account-management documentation provides a distinct workflow for enabling realtime quotations by market (`Libera -> profile -> Trading Preferences -> Quote Enablement`, or the corresponding dLite INFO/5a path) and a separate area for API/services. Directa's additional-enablement documentation says the market/operational page visibly reports whether each requested capability is `Abilitato`. Therefore an API/datafeed subscription alone is **not** evidence that a particular MIC is realtime-entitled. Fenice must prove both the API/datafeed entitlement and the market-specific quotation entitlement for the requested venue before PAPER admission.

   A valid Directa evidence packet must capture independently checkable account-side facts: API/realtime-historical service enabled, requested market enabled for realtime quotations, exact broker ticker/ISIN/MIC identity, and a contractual/use-right basis compatible with automated internal processing. Persisted evidence is hash-bound, must have an explicit future validity end and must be matched by a fresh runtime confirmation no older than five minutes. No password, client code or order-capable credential belongs in the evidence packet.

   Directa's local DAPI feed includes a source-supplied time field on PRICE/BIDASK messages; Fenice treats it as a provider timestamp only when it can be normalized unambiguously to an absolute timestamp. A local receipt time must never be substituted to make stale or ambiguous provider data appear fresh.

   **Current Fenice status:** preferred broker-side read-only candidate, DEFAULT DENY. The account/trading API path is known to be reachable, but the separate realtime/historical datafeed entitlement is not currently enabled. No entitlement is inferred from documentation, environment variables or API connectivity, and broker/order writes remain blocked.

2. **Euronext Stream API / Web Services** — Euronext officially offers realtime data from Euronext markets through Internet-delivered streaming/Web services. Euronext's market-data policy distinguishes **Display Use** from **Non-Display Use**; applications receiving data for automated calculations or algorithms are non-display use. Therefore public API availability cannot be treated as permission for Fenice's automated use. This remains a strong exact-venue candidate for Euronext MICs, but PAPER admission requires the applicable non-display agreement/entitlement, exact MIC/instrument mapping and provider timestamps.

3. **Deutsche Börse / Xetra** — Deutsche Börse states that realtime Xetra/Eurex data is distributed through CEF direct feeds and vendors. Its Cloud Stream is an official realtime WebSocket/API-key service and Deutsche Börse publicly offers 30 days of free access. The currently documented Cloud Stream product scope includes **Xetra ETFs & ETPs**, not blanket Xetra equities, plus selected Eurex/Tradegate/other products. Consequently Fenice must not generalize a Cloud Stream trial into XETR equity coverage.

   The Cloud Stream v4.2 manual documents the Xetra ETF/ETP subject as `md-xetraetfetp`; Xetra instrument messages include required `MktID` and `Sym`, optional `Src`/`Ccy`, and the Xetra identifier table uses `MktID=XETR` for ETC/ETN/ETF instruments. The data layout contains bid/offer, security/trading status and required `Tm` (MD Entry Time). The official Deutsche Börse sample client documents timestamp-based recovery in **nanoseconds** and shows `Tm` values at nanosecond scale. V7 therefore parses this path fail-closed: exact `XETR`, exact provider instrument identity, expected currency, positive non-crossed bid/offer, `ACTIVE` + `CONTINUOUS`, ns-scale `Tm`, bounded future skew and freshness are required. Even a technically valid message remains `VALIDATION_ONLY` until a current automated/internal non-display entitlement is separately proven and hash-bound.

4. **Cboe Europe** — Cboe states that Europe Equities realtime market data is available directly or through vendors, provides broad pan-European coverage and offers trials. Cboe's European Market Data Policy effective August 2026 explicitly classifies in-house algorithmic/automated trading and automated risk/portfolio applications as **Non-Display** uses. Both Non-Display use and trading-platform use require the appropriate Data Agreement regardless of whether the data arrives directly or through a vendor. Therefore a free trial, retail display fee waiver, vendor login or technically reachable feed is not sufficient PAPER licensing evidence for Fenice.

   Cboe also provides delayed public transparency data. The delayed service is useful as an independent lawful sanity-check but, because it is delayed (including the new 15-minute delayed feed), it remains `VALIDATION_ONLY` and can never satisfy the realtime PAPER quorum.

5. **EODHD EU WebSocket** — EODHD documents realtime European trades/quotes sourced from Cboe Europe across BXE, CXE and DXE, covering 18 European markets and roughly 9,400 symbols in a normal session. The quote stream is consolidated across those Cboe books, so it is valuable cross-venue evidence but **not** exact home-venue evidence for XETR/XMIL/XPAR. EODHD documents `t` as UTC epoch milliseconds on the European streams. V7 therefore rejects seconds-scale timestamps, timestamps beyond a small future-skew allowance, stale messages and symbol mismatches. This path remains `VALIDATION_ONLY` until provider entitlement/use rights are proven, and even then its Cboe provenance must never be relabelled as the primary listing MIC.

## Verified 2026-09-30 from official sources

6. **SIX Market Signal / 1BBO** — SIX launched Market Signal on 8 September 2026 as a cloud API/WebSocket service carrying real-time and historical European exchange data. Its 1BBO product is a real-time consolidated top-of-book/trades stream sourced from SIX Swiss Exchange, BME and Aquis; Aquis contributes coverage across 16 European markets. SIX describes sub-100 ms streaming, JSON/CSV delivery, an all-in-one licence with no reporting obligation, and explicitly positions the service for developing, training and deploying trading models. The public catalogue currently offers a one-month trial and states internal derivative-data usage is allowed while external redistribution is not.

   This materially improves SIX as an independent V7 candidate because automated/model use is expressly contemplated by the product. It does **not**, however, justify automatic PAPER admission. 1BBO is consolidated across SIX/BME/Aquis and therefore must not be relabelled as an exact home-venue quote for XETR/XMIL/XPAR. Before it contributes to PAPER quorum, Fenice must capture the subscribed product/account entitlement, applicable Market Signal terms, exact source/venue identity exposed by the runtime message, provider-supplied timestamp semantics, instrument identity and an explicit validity end. If a runtime payload cannot prove its exact source MIC, it remains cross-venue `VALIDATION_ONLY`.

   SIX's traditional Exfeed licensing documentation separately states that real-time Non-Display Information Usage requires a specific licence/direct contractual relationship. Fenice must therefore bind evidence to the **actual Market Signal product terms/account entitlement** and must never infer Market Signal automated-use rights from an Exfeed subscription, or vice versa. Trial/API reachability alone remains insufficient.

## Other priority candidates

7. **dxFeed** — realtime/delayed/historical APIs with EU equities coverage; candidate subject to commercial feed entitlement, automated-use rights and exact source/venue mapping.
8. **Interactive Brokers Web API** — streaming Level 1 data with exchange-specific requests; most securities require market-data subscriptions. Candidate only if an authorized account is connected later.
9. **Saxo OpenAPI** — realtime streaming prices are supported; non-FX market data requires authorized account/data access and applicable terms.
10. **Twelve Data Cboe Europe** — Twelve Data documents licensed Cboe Europe realtime coverage at MIC `BCXE` as a data add-on. It can become exact Cboe-venue evidence only if account entitlement and automated-use rights are proven; it must never be presented as exact XETR/XMIL/XPAR home-venue evidence.

## Evidence packet required before promotion

For every candidate provider + MIC pair, V7 must retain a machine-verifiable evidence packet containing at least:

- provider/source-family identifier and exact MIC;
- broker/provider instrument identifier plus ISIN when available;
- evidence that the account/feed is authorized for realtime data;
- separate market/product entitlement evidence where the provider distinguishes generic API access from venue data rights;
- intended usage classification and licence evidence explicitly compatible with internal non-display/automated application use;
- explicit future entitlement validity end; open-ended or malformed validity fails closed;
- provider-supplied timestamp semantics and a fresh absolute timestamp observed at runtime;
- currency, market/session-state and crossed-market checks where the feed exposes them;
- provenance/evidence hash and observation time;
- explicit read-only path; no broker/order write credential is accepted as a substitute for market-data evidence.

Missing, ambiguous, expired or mismatched fields resolve to `DEFAULT_DENY` and do not contribute to PAPER quorum.

## Explicitly not promoted

- **Yahoo Finance**: validation-only cross-check.
- **Finnhub**: no PAPER promotion without explicit international realtime exact-venue entitlement evidence.
- **Marketstack**: no PAPER promotion from EOD/delayed coverage.
- **Alpha Vantage**: not used for international realtime certification under current policy.

## Admission rule

No provider is PAPER-eligible merely because an API responds, a public page says that realtime exists, a free trial exists, a retail fee is waived, or an environment variable says realtime is enabled. Evidence must be persisted, hash-bound, exact-MIC, timestamp-fresh, unexpired and matched by a runtime entitlement claim. For broker feeds, both feed/API access and venue-specific market-data entitlement must be proven where the broker distinguishes them. For exchange/vendor feeds, the intended automated/non-display use must be contractually permitted; a display or retail entitlement cannot be silently reused. Two independent PAPER-eligible source families are required before new risk; three are preferred. Broker/order writes and LIVE remain outside this V7 workstream.
