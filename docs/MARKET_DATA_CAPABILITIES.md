# Fenice Market-Data Capability Matrix

Status: hardening baseline. This document is normative for execution-data classification. It does **not** authorize live trading.

## Rules

1. Research/validation data and execution-eligible data are separate capabilities.
2. A provider label is not an independent source by itself: quorum counts independent `sourceFamily` values.
3. Untagged legacy observations default to `VALIDATION_ONLY`.
4. `VALIDATION_ONLY` evidence can challenge or corroborate analysis but can never satisfy the PAPER execution quorum.
5. PAPER execution requires at least two fresh, independent source families explicitly tagged `PAPER` or stronger, with price dispersion within the configured collar.
6. LIVE execution requires sources explicitly tagged `LIVE`; PAPER eligibility can never be promoted implicitly to LIVE.
7. Provider failure, stale data, unknown timestamps, ambiguous entitlement or price divergence fail closed for new risk.
8. Directa market-data entitlement is optional. Error 1032 is treated as `OPTIONAL_NOT_ENTITLED`; broker read-only capability remains separate.
9. Fenice must never infer licensing/entitlement from a technically successful HTTP response.

## Current source classification

| Source family | Current use | Eligibility in Fenice | Notes |
| --- | --- | --- | --- |
| Yahoo Finance | Independent price validation / PAPER evidence | `PAPER` | Useful redundancy for paper validation. Not certified as LIVE execution data. |
| Stooq | End-of-day cross-check | `VALIDATION_ONLY` | EOD/delayed evidence must not masquerade as an execution quote. |
| Coinbase Exchange | Crypto venue quote validation | `PAPER` | Independent crypto venue evidence. |
| Kraken | Crypto venue quote validation | `PAPER` | Independent crypto venue evidence. |
| Twelve Data | Optional US equity/ETF paper quote source | `PAPER` | Used only when `TWELVE_DATA_API_KEY` is configured. Fenice currently assumes free real-time eligibility only for supported US MICs and never promotes it to LIVE. |
| Alpha Vantage | Research / market context | `VALIDATION_ONLY` unless a future entitlement is explicitly certified | Default/global quote availability must not be treated as execution-grade real-time. |
| Directa/Darwin datafeed | Optional broker-native market data | `VALIDATION_ONLY` / unavailable when not entitled | User elected not to purchase the paid feed. This does not disable the future broker execution adapter. |

## Current execution posture

- `PAPER`: enabled only when the per-symbol quorum passes all provenance, freshness and divergence checks.
- `LIVE`: **no source family is currently certified as LIVE execution-eligible**.
- Broker writes: blocked.
- Live trading release: blocked.

This separation is intentional. A future live release must add and test an explicit LIVE-eligible feed/entitlement and cannot reuse PAPER classification as proof.

## Provider references used for the classification

- Alpha Vantage documentation: https://www.alphavantage.co/documentation/
- Twelve Data pricing: https://twelvedata.com/pricing
- Twelve Data US equities support: https://support.twelvedata.com/en/articles/5620510-us-equities
- Twelve Data exchange coverage: https://twelvedata.com/exchanges

Provider terms, licensing and entitlements can change. Fenice therefore treats this file as policy documentation, while runtime eligibility remains an explicit code/data field and must be re-certified before any future live release.
