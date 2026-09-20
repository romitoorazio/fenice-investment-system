# Directa market-data fallback policy

## Decision

Fenice does not require the paid Directa API market-data service for certification or paper-mode operation.

Directa/Darwin remains the future broker execution bridge. Market intelligence must come from independent, quality-controlled market-data sources so that broker connectivity and research data are not a single point of failure.

## Known entitlement case

Directa API error `1032` is classified as `OPTIONAL_NOT_ENTITLED`.

Required behavior:

- do not retry aggressively;
- do not weaken any risk gate;
- do not enable broker write commands;
- allow only the certified independent market-data fallback path;
- retain `allowTradingWrite: false`;
- surface the condition as optional/non-critical while the independent fallback is healthy.

Unknown Directa datafeed errors are fail-closed and must not be treated as equivalent to error 1032.

## Certification rule

A missing optional Directa datafeed is not a READY blocker only when:

1. critical independent market-data sources are GREEN, or a documented safe stale-data fallback is still inside its allowed freshness window;
2. cross-source validation passes;
3. Data Quality gates pass;
4. the broker live-trading lock remains enforced;
5. Directa entitlement safety tests pass in CI.

If independent market data is stale, divergent, unavailable, or below confidence thresholds, Fenice must block new risk instead of substituting unverified data.

## Execution separation

The future execution path is intentionally separate from market-data acquisition:

`Independent market data -> Data Quality / Risk gates -> approved order intent -> local Directa bridge -> Darwin`

No part of this fallback policy authorizes real order submission. Live trading remains blocked until a separate release decision after paper validation and safety certification.
