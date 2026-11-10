# FENICE ONE GLOBAL — retirement controls and controlled production release

Date: 2026-11-10. User instruction: finish one FENICE, stop redundant legacy engines.

## Operational truth

- **One active technical PAPER writer:** the pinned V8 execution laboratory, with its separate prospective virtual-exit journal. Original signed V8 core and its 30 calendar-day / 25 valid-day / 10 technical-sample constraints remain unchanged.
- **Three archived automatic writers:** V6 canonical PAPER, V7 Phase B forward, V7 B2 forward. Their workflows still exist for forensic review, but their PAPER-writing jobs have a GitHub Actions job-level `if: ${{ false }}` gate. All earlier approvals, archived ledgers, timestamps, fills, proof chains and data remain in Git. This does not turn legacy fills into V8 evidence or reset V8 clocks.
- **Provenance:** `data/one-global-legacy-retirement.json` records the owner-requested operational retirement and exact Git blob hashes of historical campaign/approval files. `scripts/verify-one-global-legacy-retirement.mjs` checks this manifest, all three writers disabled, original approvals unchanged, and each pinned V8 file still matching its authorized Git blob. A malformed/forged retirement, a reactivated writer, changed original approval, or V8 drift fails the check.
- **PAPER Core Freeze Guard:** continues enforcing old SHA freeze when no verified retirement exists. For the retired historical campaigns it runs an independent forensic policy instead of declaring a still-active V6 baseline. The risk/authorization boundary is preserved, not silently waived.
- **LIVE and Directa:** off, no broker connectivity, no order submission, no API-key changes, no paid market-data services.

## V8 PAPER performance evidence

The technical sample BUY ledger and technical SELL ledger use hash-chained evidence. On Nov 10 the first real-forward simulated close was SPY with **EUR -4.4294** after simulated entry/exit costs. It is a negative engineering result, **not** realized broker money or a certified investment strategy signal. Remaining unrealized estimates use as-of quote proof, potentially stale; they must not be presented as executable current values.

`scripts/fenice-unica-paper-cycle.mjs` is the daily auditable, read-only ONE GLOBAL scoreboard. `app/performance/page.tsx` displays V8 technical outcomes separately from V6 historical PAPER OMS and V7 decision research. Global markets in Europe, Asia, Americas, Oceania and Latin America remain research-only unless certified real-forward venue, time, quote and FX eligibility gates pass.

## Controlled deployment

The pre-existing `.github/workflows/vercel-deploy.yml` deploys only `main` to **the specific existing Fenice Vercel team/project**. It requires exact-SHA GitHub Actions checks, including the verified legacy retirement guard, production CI and independent safety checks; GitHub secrets stay in GitHub Actions. A green build alone does not authorize trading. The request in `.ops/vercel-deploy-request.json` explicitly triggers only this authorized production refresh. A deployment must become READY, match the exact SHA and production alias, and satisfy the read-only broker endpoint smoke test before being described as published.

## Still unfulfilled

- Phase 9 closed **forward strategy** PAPER roundtrips and independent approved markets outside the US. V8 engineering SELL results are not strategy exits.
- V8 minimum prospective campaign evidence of 30 calendar days, 25 validated days and 10 technical samples.
- Any proposal to trade with Directa real capital requires a separate explicit owner authorization and risk review; these edits never grant that authority.

No statements of strategy profitability, LIVE readiness or globally certified execution are justified by workflow test success alone.
