# Fenice PAPER — authorized baseline transition plan (2026-11-06)

Status: PROPOSED, NOT ACTIVATED. Operator authorized preparing a new PAPER baseline; this document does not certify results, grant broker access, or reset any campaign.

## Immutable V6 history
- Original campaign: data/paper-validation-campaign.json; preserve unchanged, including all dailyEvidence.
- Original baseline commit: 4ccb2d2c21b0545de5b99149222afa5b444bb4c2.
- Original baseline fingerprint SHA256: 9af99a3da2fcebef1cf8d6e804d8717ed2bdbe89cf13c19870d0cff88d04ede8.
- Never relabel old evidence as belonging to the successor baseline; do not transfer days or fills toward successor certification.

## Confirmed drift requiring separate certification
- package.json: added paper:bottlenecks:test script.
- scripts/refresh-twelve-data-batch-evidence.mjs: added FX future-timestamp rejection, second-source prioritization, and FX preflight before quote-evidence publication.
- These are real protected-core changes; do not whitelist them, delete freeze guard, or forge a historical fingerprint.

## Activation gates (all mandatory)
1. Archive an exact immutable copy of the V6 campaign under a unique historical filename, and record SHA256 of the complete archived JSON; check equality with the original before modifying active pointers.
2. Create a new separate successor campaign record with a fresh ID, effective start time after activation, dailyEvidence=[], new baseline commit, and a fingerprint computed from the *actual* frozen successor code. No backdating.
3. Require current fresh source, independent quote, FX, governance, reconciliation, and audit preflight. If preflight fails, leave successor NOT_STARTED.
4. Require new prospective PAPER-only approval with expiry after its required observation window; expired V6 approval (2026-10-24) cannot be reused.
5. Preserve >=30 calendar days, >=25 distinct valid evidence days, >=10 genuinely executed PAPER fills and execution-quality gates; synthetic fixture tests give zero credit.
6. Retain liveTradingAllowed=false, brokerConnectivityAllowed=false, Directa live order transmission disabled, and kill switch engaged until a separate future human authorization and independent safety review.
7. Only retire the original active campaign after an atomic, verified transition that preserves the historical archive and explicitly updates the observer/freeze guard to evaluate the successor while still detecting unauthorized protected-core drift.
8. Run CI, PAPER Core Freeze Guard, PAPER observer, market-data validation lab, V8 independent pilot, and negative tests proving tampering, expired approval, FX failure, and broker connectivity still fail closed.

## Explicit non-actions
No reset of V6 history. No live trading. No new PAPER fills invented. No blanket suppression of failing checks. No change to original approval or original campaign in this proposal.
