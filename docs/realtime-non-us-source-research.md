# Fenice V7 — Realtime non-US source research

This document records candidate market-data sources for independent non-US realtime validation. It is research evidence only; it does not grant PAPER eligibility or unlock LIVE trading.

Admission policy remains fail-closed: exact venue/MIC identity, fresh provider timestamp, verified realtime entitlement/licensing, independent source family, provenance and read-only market-data path are required before a source can count toward PAPER quorum.

## Priority candidates

1. **Directa read-only datafeed** — preferred candidate because Fenice already has read-only datafeed plumbing. Promotion still requires exact broker ticker + ISIN + MIC identity and persisted/runtime entitlement evidence for each MIC.
2. **EODHD EU WebSocket** — official realtime EU trades/quotes, minute bars and market-status endpoints exist. Requires plan entitlement, exchange/MIC mapping and licensing verification before PAPER use.
3. **dxFeed** — realtime/delayed/historical APIs with EU equities coverage; candidate subject to commercial feed entitlement and exact source/venue mapping.
4. **Cboe Europe** — pan-European realtime market data with direct/vendor access and free trials. A lawful subscription plus instrument/venue mapping is required for production PAPER evidence.
5. **Interactive Brokers Web API** — streaming Level 1 data with exchange-specific requests using conId@EXCHANGE. Most securities require market-data subscriptions; candidate only if an authorized account is connected later.
6. **Saxo OpenAPI** — realtime streaming prices are supported; non-FX market data must be explicitly enabled and applicable terms accepted. Candidate only with authorized account access.
7. **Deutsche Börse / Xetra** — official realtime data via CEF direct feeds or data vendors. Requires market-data/non-display agreement and entitlement.
8. **Euronext direct/vendor realtime** — formal realtime market-data agreements and fee schedules exist; requires contractual entitlement.

## Explicitly not promoted

- **Yahoo Finance**: validation-only cross-check.
- **Finnhub**: no PAPER promotion without explicit international realtime exact-venue entitlement evidence.
- **Marketstack**: no PAPER promotion from EOD/delayed coverage.
- **Alpha Vantage**: not used for international realtime certification under current policy.

## Rule

No provider is PAPER-eligible merely because an API responds or because an environment variable says realtime is enabled. Evidence must be persisted, hash-bound, exact-MIC and matched by a runtime claim. Two independent PAPER-eligible families are required before new risk; three are preferred.
