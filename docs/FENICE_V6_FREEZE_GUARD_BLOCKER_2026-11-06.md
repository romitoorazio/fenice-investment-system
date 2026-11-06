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
