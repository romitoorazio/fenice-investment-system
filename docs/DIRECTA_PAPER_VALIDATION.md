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
- instrument-master, MIC and ISIN checksum validation;
- risk and execution safety invariants;
- SOR, conditional-order and signal-order invariants;
- market-data quorum fail-closed tests;
- source health and intelligence-quality checks;
- PAPER campaign structural tests;
- live-trading lock verification.

The cloud runner cannot see Darwin on the user's computer and must never pretend that it can. Absence of a Directa local snapshot is therefore a normal fail-closed condition for Directa-specific execution coverage.

### 2. Local Directa evidence plane

Directa PAPER evidence requires two distinct operator attestations:

```text
FENICE_DIRECTA_REALTIME_ENTITLEMENT_CONFIRMED=true
FENICE_DIRECTA_REALTIME_MARKETS=XNAS,XNYS,ARCX
```

The first variable confirms that the Directa API realtime/historical market-data service is actually enabled. The second lists only the exchange MICs for which realtime quotations have been explicitly verified. The example is illustrative: do **not** list a MIC merely because Fenice contains instruments from that venue.

Directa error `1032`, any unclassified unsafe datafeed error, an unconfirmed market MIC or missing entitlement overrides these variables and fails closed. Without complete proof, safe Directa data remains `VALIDATION_ONLY`.

The computer running Darwin can execute:

```bash
npm run directa:paper:preflight
```

The preflight:

1. refuses to start until realtime API service entitlement is explicitly confirmed;
2. refuses candidates whose market MIC is not explicitly confirmed realtime;
3. selects only equity/ETF candidates with explicit ticker, MIC and checksum-valid ISIN identity;
4. opens only the Directa local datafeed socket on loopback;
5. subscribes to read-only market data;
6. writes an atomic snapshot under `~/.fenice/`;
7. verifies `writeTradingCommandsAllowed=false`;
8. rejects missing-entitlement or unclassified Directa datafeed errors;
9. verifies DAPI `ANAG` ISIN against the instrument-master ISIN;
10. requires executable top-of-book: positive bid/ask quantities, valid bid and ask, and ask >= bid;
11. tracks PRICE and BIDASK timestamps separately;
12. allows Directa `PAPER` evidence only when the **BIDASK timestamp itself** is no more than 120 seconds old;
13. treats a fresh PRICE with stale/missing BIDASK as `VALIDATION_ONLY`;
14. rebuilds independent external execution evidence;
15. requires at least two independent PAPER source families for broad PAPER quorum;
16. requires Directa itself plus an approved independent realtime source for Directa-pilot certification;
17. checks broad PAPER coverage and Directa-pilot coverage;
18. reports baseline eligibility without starting a campaign.

No Directa quote snapshot is intentionally committed to the public repository by this command.

## Execution source policy

A source may satisfy execution quorum only when explicitly tagged `PAPER` and when freshness, provenance and provider-specific evidence rules pass.

### Directa DAPI local

Directa may satisfy the broker leg of the pilot only when all of the following hold simultaneously:

- loopback local DAPI connection;
- read-only market-data mode;
- trading writes blocked;
- fresh local snapshot;
- explicit API realtime/historical service confirmation;
- explicit realtime entitlement for the instrument's market MIC;
- no entitlement error `1032`;
- no unclassified datafeed error;
- checksum-valid instrument-master ISIN;
- checksum-valid DAPI ANAG ISIN;
- exact ISIN match;
- valid executable bid/ask book with positive depth;
- fresh BIDASK timestamp <=120 seconds.

A last price by itself is never execution-grade PAPER evidence.

### Independent source

For **Directa pilot certification**, Directa must be accompanied by at least one approved independent realtime PAPER family. Current approved families are:

- `twelve-data`;
- `alpha-vantage` only if the key really has realtime entitlement and Fenice receives a qualifying realtime response;
- `massive`;
- `alpaca`.

**Yahoo Finance cannot certify the Directa pilot**, even if a Yahoo timestamp happens to be fresh. It remains useful as a cross-check and may contribute to broad non-broker PAPER validation under its own freshness rules. Stooq remains validation-only.

Current Alpha Vantage testing on the configured key returned `ALPHA_VANTAGE_REALTIME_ENTITLEMENT_REQUIRED`, so it cannot currently satisfy the Directa-pilot independent-source leg.

Twelve Data is the preferred low-cost/free candidate for the second source when a valid key is configured; Fenice still requires a recognized realtime US venue and <=120-second freshness before classifying the observation as PAPER.

Coinbase/Kraken can provide PAPER-capable crypto evidence, but crypto cannot satisfy Directa equity/ETF pilot coverage.

## Instrument identity

The instrument master is part of the immutable validation core. Directa-pilot securities require:

- explicit ticker;
- explicit exchange MIC;
- checksum-valid ISIN;
- unique `ticker:MIC` listing identity.

Fenice verifies the ISIN check digit using ISO/Luhn rules. The broker snapshot must then return the same checksum-valid ISIN via DAPI ANAG. Any mismatch downgrades the quote to `VALIDATION_ONLY`.

## Campaign start

Only after `directa:paper:preflight` reports an eligible baseline and the professional core is frozen should the campaign be started explicitly:

```bash
npm run paper:validation:start
```

The start command refuses to run unless:

- critical sources are ready;
- intelligence quality meets the institutional gate;
- execution evidence is fresh;
- execution evidence uses the hardened schema;
- at least 3 symbols and at least 25% of requested symbols pass broad PAPER execution coverage;
- at least 3 equity/ETF Directa-pilot candidates contain Directa PAPER plus an approved independent realtime PAPER source;
- Yahoo is explicitly excluded from Directa-pilot certification;
- live trading remains locked;
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

Every PAPER order still passes the normal per-symbol operational market-data gate. Missing/stale Directa data, stale BIDASK, ISIN mismatch, unconfirmed service/market entitlement, insufficient independent realtime sources, event risk, stale intelligence, portfolio risk, kill switch or audit/reconciliation problems produce a block/risk rejection rather than a fill.

## Immutable baseline fingerprint

The campaign fingerprint includes the trading/risk core **and** the execution-identity surface, including:

- Directa parser and read-only boundary;
- Directa realtime entitlement rules;
- Directa execution evidence and preflight;
- instrument master;
- MIC/ISIN validator and ISIN checksum logic;
- execution coverage policy;
- risk/OMS/SOR/reconciliation/audit/recovery controls;
- validation workflows and campaign scripts.

Changing any fingerprinted file after campaign start blocks further evidence recording until a new baseline is explicitly selected. No silent reset or backdating is allowed.

## Per-fill evidence

Campaign version 5 requires contiguous evidence windows for every new PAPER fill. A fill cannot count toward maturity unless its evidence window proves both:

- fresh institutional decision-data gate = PASS;
- fresh hardened execution-market coverage including Directa-pilot gate = PASS.

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
