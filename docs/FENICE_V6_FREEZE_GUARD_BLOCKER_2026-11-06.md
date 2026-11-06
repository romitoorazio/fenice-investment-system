# FENICE V6 core freeze guard — verified integration blocker (2026-11-06)

## Observed evidence

GitHub Actions run [42303337836](https://github.com/romitoorazio/fenice-investment-system/actions/runs/42303337836), job protect-paper-core, step 'Check active PAPER fingerprint against inspected revision': **FAIL**.

The job explicitly reads the active certifying campaign from **origin/main** for pull_request events, not from the proposed ONE GLOBAL branch. It reports active V6 baseline since 2026-09-25T15:40:35.178Z, 92 fingerprinted files, drift=2:

- `package.json`: baseline blob `a34ec63743d745ec1e4b6d566e3a5e2eb74ec7fd`; inspected blob `4c844fdccce774f766994d5f3654ed8a7bfedd14`.
- `scripts/refresh-twelve-data-batch-evidence.mjs`: baseline blob `f3d6cfed10da17bddba70b5f74097b092eb9d57d`; inspected blob `2b088017745a4cef76f59640adb986228ee6abf7`.

These are pre-existing differences on main according to the guard; **do not attribute them to ONE GLOBAL without a historical diff investigation**. The ONE GLOBAL compare shows main's seven newer commits affect data/ only, and the ONE GLOBAL branch does not change these two frozen files.

## Safe resolution path

1. Investigate commit history for the two files, identify whether the changes predate V6 baseline freeze or are intentional post-freeze maintenance. Document purpose and effect.
2. Do not rewrite V6 baseline fingerprint, disable the guard, overwrite existing ledgers or falsely claim PASS.
3. Owner reviews an explicit V6 campaign retirement/re-baselining decision, or an approved restoration of frozen files with regression analysis, **separately** from ONE GLOBAL integration. Neither is authorized here.
4. Keep ONE GLOBAL integration PR draft; note that its Production CI PASS and contract suite PASS do not override this failing safety guard.

## Other CI on same revision

- Fenice ONE GLOBAL Contract Tests #132: SUCCESS.
- Fenice Production CI #2592: SUCCESS.
- PAPER Core Freeze Guard #1107: FAILURE.

Result: **integration NOT green; no merge, no LIVE, no certification claim**.

## Historical investigation — supplemental evidence

- GitHub commit [b26e47ea5420605067ca5388e83042d337b73e16](https://github.com/romitoorazio/fenice-investment-system/commit/b26e47ea5420605067ca5388e83042d337b73e16) is titled `feat: refresh Twelve Data PAPER evidence as coherent batch` and changes `scripts/refresh-twelve-data-batch-evidence.mjs`. This is a candidate historical explanation of the script drift, **not proof that it alone introduced the exact current blob**.
- Baseline-to-main comparison is very large (2,677 commits ahead; file listing capped at 300), so it cannot reliably establish the last change to each frozen file. The exact baseline/current blob pairs in the failed guard log remain the authoritative evidence.
- `package.json` drift origin remains **unresolved**. Do not restore or rebaseline either file based only on a matching commit title.

## Exact baseline-vs-main content inspection (confirmed)

The V8 technical-status record names baseline commit `54ee545235bee10121cb082b79c3a8a194401d6a`. Fetching the two guarded files at that commit reproduces **exactly** the baseline blob IDs printed by the guard, confirming it is a usable comparison reference for these two files.

**`package.json`:** the only distinct line is an added npm script `"paper:bottlenecks:test": "node scripts/test-paper-bottleneck-causes.mjs"`, plus the comma needed after the preceding script. No other differing lines were found by line-set comparison.

**`scripts/refresh-twelve-data-batch-evidence.mjs`:** main additionally imports `prioritizeMissingSecondSource` from `lib/trading/paper-quote-probe-priority.mjs` and `validateFxTimestamp` from `lib/trading/paper-fx-timestamp.mjs`; replaces inline FX age calculation with a helper and explicit rejection of future timestamps; prioritizes candidates missing a second source before slicing to probeLimit; and adds a comment explaining FX preflight and separate atomic writes. This is a line-set comparison, **not** a behavioral or historical safety certification.

**Interpretation:** the guard is correctly flagging post-baseline drift, even where changes appear to strengthen checks. The correct path is owner-approved V6 re-baselining/retirement or carefully reviewed rollback, **not** bypassing the guard or asserting a clean integration. Do not use a test-only workaround to count additional V6 evidence days.
