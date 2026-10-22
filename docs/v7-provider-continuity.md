# V7 provider continuity (forward-only)

This is a **separate observation ledger**, not a trading or PAPER fill system.

The existing Alpaca IEX + Twelve Data provider feasibility workflow probes during independently attested US-equity OPEN sessions. After a successful provider probe, the publication step merges only metadata onto the latest `main` ledger in each push retry. An observation taken before deployment **cannot be backfilled from historical provider files**.

`data/v7-provider-continuity.json` contains date, symbol, venue, sampled timestamps, binary compatibility flags and counters. It never stores quotes, secrets, account data, trade prices, or order intents. An identical report timestamp cannot increment counters twice. Historical 2026-10-21 reports do not count retroactively.

The exact independent source provenance, quote timestamps <=120 s, live Alpaca clock <=60 s and spread <=0.75% must all pass for a positive sample. One source or unauthoritative OPEN is always insufficient. Diagnostic observations do **not** prove contractual rights, strategy profitability, PAPER fills, market-open state for another exchange, or permission to trade. All broker routing remains blocked and V6 is untouched.

`node scripts/test-v7-provider-continuity.mjs`
