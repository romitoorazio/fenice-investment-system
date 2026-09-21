# Fenice — Directa-aware PAPER validation

## Objective

Fenice must prove that the same decision, risk, execution-data, reconciliation and audit controls intended for a future limited pilot behave correctly for at least 30 calendar days before any live release can even be considered.

This document does **not** authorize live trading. The current safety boundary remains:

- `liveTradingAllowed = false`;
- Directa market-data access is loopback/read-only;
- Directa trading write commands remain blocked;
- PAPER campaign startup is explicit and cannot happen automatically;
- every new PAPER fill must have fresh decision-data and execution-market evidence.

## Two evidence planes

### 1. Cloud control plane

GitHub Actions is used for reproducible software and public-data controls:

- lint/build/TypeScript;
- repository secret scan;
- risk and execution safety invariants;
- SOR, conditional-order and signal-order invariants;
- market-data quorum fail-closed tests;
- source health and intelligence-quality checks;
- PAPER campaign structural tests;
- live-trading lock verification.

The cloud runner cannot see Darwin on the user's computer and must never pretend that it can. Absence of a Directa local snapshot therefore remains a normal fail-closed condition for Directa-specific execution coverage.

### 2. Local Directa evidence plane

The computer running Darwin can execute:

```bash
npm run directa:paper:preflight
```

The preflight:

1. chooses a bounded equity/ETF candidate set;
2. opens only the Directa local datafeed socket on loopback;
3. subscribes to read-only market data;
4. writes an atomic snapshot under `~/.fenice/`;
5. verifies `writeTradingCommandsAllowed=false`;
6. accepts Directa evidence as `PAPER` only while the snapshot and quote are fresh;
7. rebuilds external execution evidence;
8. requires at least two independent `PAPER` source families per symbol;
9. checks broad PAPER coverage and Directa-pilot coverage;
10. reports baseline eligibility without starting a campaign.

No Directa quote snapshot is intentionally committed to the public repository by this command.

## Execution source policy

A source may satisfy the execution quorum only when it is explicitly tagged `PAPER` and passes freshness/provenance validation.

Current behavior:

- **Directa DAPI local** — PAPER only when loopback/read-only boundary is proven and quote freshness passes;
- **Yahoo Finance** — PAPER only when `regularMarketTime` is no more than 120 seconds old; otherwise validation-only;
- **Alpha Vantage** — Fenice explicitly requests `entitlement=realtime`; a key without realtime entitlement cannot satisfy PAPER quorum;
- **Twelve Data** — optional bounded probe, PAPER only after US realtime venue and freshness validation;
- **Stooq** — validation-only; useful for cross-checking but never enough to authorize new PAPER risk;
- **Coinbase/Kraken** — PAPER-capable for supported crypto evidence, but crypto cannot satisfy the Directa equity/ETF pilot-coverage gate.

## Campaign start

Only after `directa:paper:preflight` reports an eligible baseline and the professional core is frozen should the campaign be started explicitly:

```bash
npm run paper:validation:start
```

The start command refuses to run unless:

- critical sources are ready;
- intelligence quality meets the institutional gate;
- execution evidence is fresh;
- at least 3 symbols and at least 25% of requested symbols pass PAPER execution coverage;
- at least 3 equity/ETF Directa-pilot candidates pass the execution quorum;
- live trading is still locked;
- the complete validated-core SHA-256 fingerprint is available.

Starting the campaign is a governance event, not a convenience side effect.

## Daily local validation cycle

Once the campaign has been explicitly started, the Darwin computer can run:

```bash
npm run paper:validation:local-cycle
```

This command refuses to run before campaign start. It performs, in order:

1. critical-source refresh;
2. fresh intelligence-quality calculation;
3. Directa read-only PAPER preflight and execution quorum rebuild;
4. conditional PAPER OMS;
5. standard PAPER OMS;
6. daily campaign evidence recording;
7. campaign-status inspection.

Every PAPER order still passes the normal per-symbol operational market-data gate. Missing or stale Directa data, insufficient independent sources, event risk, stale intelligence, portfolio risk, kill switch or audit/reconciliation problems produce a block/risk rejection rather than a fill.

## Per-fill evidence

Campaign version 5 requires contiguous evidence windows for every new PAPER fill. A fill cannot count toward maturity unless its evidence window proves both:

- fresh institutional decision-data gate = PASS;
- fresh execution-market coverage including the Directa-pilot gate = PASS.

If a fill appears without that proof, evidence recording fails and the campaign cannot mature.

## Maturity criteria

The campaign must satisfy all configured maturity gates, including at minimum:

- 30 calendar days elapsed;
- at least 25 evidence days;
- at least 25 safety/fingerprint evidence days;
- at least 10 PAPER fills;
- acceptable execution-quality/TCA state;
- zero live orders;
- zero broker-write exposure;
- zero reconciliation-break days;
- zero audit-chain failure days;
- zero validated-core fingerprint mismatches;
- zero fill-evidence gaps;
- zero market-data or decision-data failures attached to new PAPER fills.

Maturity still does not enable live trading. A separate explicit production release and human-governance decision would be required afterward.
