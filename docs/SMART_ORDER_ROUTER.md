# Fenice Smart Order Router — shadow/paper design

Fenice implements a fail-closed Smart Order Router (SOR) for PAPER and SHADOW evaluation only. It cannot transmit an order and exposes `liveTradingAllowed: false` in every route plan.

## Best-execution objective

The router follows a retail-oriented best-execution hierarchy:

1. reject stale, halted, validation-only, currency-mismatched or otherwise ineligible venues;
2. respect a specific client-directed venue instruction when present;
3. compare executable venues using total consideration rather than headline price alone;
4. include explicit fee and estimated slippage costs in the effective unit price;
5. where effective prices are near-equivalent, prefer higher execution likelihood, then lower latency, then greater displayed size;
6. split a paper/shadow route across eligible venues only when required by displayed size and policy;
7. fail closed when full requested size cannot be routed unless the policy explicitly allows partial routing.

The route record preserves the factors used for the decision: price, costs, speed, likelihood, size and order nature.

## Regulatory/industry rationale

This design is intentionally aligned with public best-execution concepts rather than claiming regulatory certification.

- MiFID II Article 27 requires consideration of price, costs, speed, likelihood of execution and settlement, size, nature and other relevant factors, with retail best result generally assessed through total consideration.
- FINRA Rule 5310 requires reasonable diligence to ascertain the best market and regular and rigorous review of execution quality.
- SEC Rule 605 execution-quality disclosures reinforce venue-by-venue measurement of execution outcomes and order-routing analysis.

References:

- https://eur-lex.europa.eu/eli/dir/2014/65/2022-01-01/eng
- https://www.finra.org/rules-guidance/guidance/reports/2026-finra-annual-regulatory-oversight-report/best-execution
- https://www.sec.gov/rules-regulations/staff-guidance/trading-markets-frequently-asked-questions/frequently-asked-questions-rule-605-regulation-nms
- https://www.directa.it/help-supporto/piattaforme/api

## Safety boundary

The router is not a broker adapter. It has no socket, API credential, Directa write command or order-transmission function. Broker connectivity and live execution remain controlled by separate hard locks and readiness gates.

`buildSmartOrderRoutePlan()` returns only an auditable plan with `mode: "SHADOW_ONLY"`, `transmitted: false`, and `liveTradingAllowed: false`.

## Current scope

Supported intent types are MARKET and LIMIT. Fenice already models STOP, STOP_LIMIT, TRAILING_STOP, OCO and long bracket semantics in the conditional-order engine; those orders can later activate a MARKET/LIMIT child intent that is evaluated by the same pre-trade risk, execution-safety and SOR layers.

Future work before any real-money consideration includes broker-native market-data evidence, venue entitlement verification, shadow reconciliation against Directa, longer paper validation, calibrated execution-cost estimates and explicit production release governance.
