# Directa local read-only: explicit empty-list responses

## Problem and behavior

The Windows read on 18 October connected successfully (`CONN_OK`) and received
`1018, 1019, 1018, 1019`, with zero positions/orders and no END markers. The old
local command treated every ERR as a protocol failure and required END markers
even for these documented empty-list responses.

The official [Directa dAPI contract](https://directa-it.github.io/documentation/)
defines 1018 as `ERR_EMPTY_STOCKLIST` and 1019 as `ERR_EMPTY_ORDERLIST`.
It also warns that an initial order list filtered at >=100 cancelled orders can
produce 1019 even when the full list is not empty. Therefore startup 1019 alone
must never certify an empty order list.

`npm run directa:readonly` now uses a separate local diagnostic collector:

1. Acknowledge FLOWPOINT TRUE and PRICEEXE TRUE.
2. Request status, account and availability sequentially.
3. Request INFOSTOCKS and then the full, unfiltered ORDERLIST explicitly.
4. Accept matched BEGIN/END sequences, or the matching empty response with zero
   rows in that explicit request. Preserve startup empty notices separately;
   they do not complete either list.
5. Require a final healthy status and consume trailing messages before saving.

Commands are sent only after draining the current receive batch and any partial
line already buffered. Those bytes cannot satisfy a request they predate. Tests
cover coalesced startup errors, split error lines, buffered account fields and
option acknowledgements with an absent response to the actual subsequent command.

The private snapshot records the actual completion source (`FLOWPOINT_END`,
`EMPTY_RESPONSE_1018`, `EMPTY_RESPONSE_1019`). It never manufactures wire markers.
Missing acknowledgements, missing responses, contradictory/late rows, disconnection,
unknown messages, unterminated lines and real errors leave the snapshot incomplete.
The terminal prints completion methods, counts and diagnostic codes, not account
identifiers, account amounts, holdings or order references.

## Scope

### Connection initialization (Windows observation, 18 October 2026)

A status-only probe on the declared trading port 10002 observed UNAVAILABLE at
80 ms, then CONN_OK at 1013, 1509 and 4516 ms, with datafeed disabled throughout.
The local collector had finished before that initialization completed and treated
the initial unavailable status as a permanent failure.

It now waits for an explicit CONN_OK before requesting account/availability and
either list, retrying DARWINSTATUS at 500 ms intervals only after an unavailable
response, within the existing total snapshot deadline. Startup account/list rows
remain ineligible: all values are requested again after readiness. Replies already
buffered cannot satisfy a subsequent poll, including partial lines present when a
retry timer fires. Diagnostic counters record the initial unavailable observations
and retry attempts without exposing account details.

Any non-OK state after readiness still interrupts the snapshot. Protocol errors,
unknown states, missing acknowledgements/responses and a connection that never
becomes ready still fail closed. A later OK does not repair a lost connection
during an account read. No paid datafeed or certification policy is changed.

This is a local, one-shot diagnostic change. The frozen V6 collector/parser,
fingerprint, risk engine, reconciliation, historical evidence and approvals remain
unchanged. The new collector is used only by the local read-only command, and is
not imported by any PAPER execution or certification path.

No paid datafeed is requested. No broker write command exists in this collector.
A complete local read is not broker reconciliation, cloud continuity, a continuous
bridge or permission to trade. The account snapshot stays on the Windows computer;
the cloud status does not receive it. Existing integrity freshness is still 15 s.

## Validation

`node --experimental-strip-types scripts/test-directa-local-readonly.mjs`
uses loopback mock servers only, including repeated empty responses, filtered
startup lists followed by real orders, populated and marked-empty lists,
fragmented CRLF packets, timeouts, interruption, contradictory responses and
trailing failures. The local-evidence CI runs it alongside the existing integrity
and redaction tests. The actual Windows/Darwin result must be checked after update.
