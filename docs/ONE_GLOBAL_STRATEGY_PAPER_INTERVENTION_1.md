# ONE GLOBAL — intervention 1: strategy signal to PAPER readiness
Date: 2026-11-10

## Reuse, do not rewrite the existing engine
`scripts/run-one-global-strategy-paper.mjs` adapts live repository **Investment Committee** decisions to the existing `lib/trading/world-paper-v7.mjs` independent, global PAPER simulator. The source file retains its legacy filename solely for backward compatibility: it is not a new active V7 campaign, and does not touch V6/B2/V8 historical journals. No real broker client, Directa library, API credentials, paid service or LIVE flag is imported.

## When a candidate can be considered
The committee must provide:
- a fresh (<24 h), non-future timestamp and a GREEN source gate with dataQuality >=90;
- `executionGate=PRONTO_CON_CONFERMA` and a verified `COMPRA` count;
- each BUY must have score >=78, confidence >=72, riskScore <=58, terminal `ACCUMULA`, no unresolved `buyGapEvidence.gaps` and an explicit positive limit-price/tranche plan;
- one exact active ticker/MIC/currency identity from the original instrument master; duplicate or conflicting listings are refused.

The derived internal intent keeps a deterministic identifier based on the original committee SHA and instrument identity; its `approvedForWorldPaper` remains **false**. It is capped at EUR 50 for the pilot (a 5% cap on the isolated EUR 1,000 synthetic portfolio); the global engine independently enforces position/region/turnover limits, fees and cash.

**A research price does not prove an executable market price.** A separate preflight checks the EXACT MIC open session, two fresh independent legally entitled provider feeds, currency/FX and active license rights. When an admitted quote is above the strategy limit the adapter refuses the proposed BUY. Missing or expired evidence means no PAPER fill.

## Authorization boundary
The default command and daily workflow are *read-only*. They intentionally pass **no** external entitled market quotes and **no** forward strategy PAPER approval, so they cannot produce actual strategy fills. The signed V8 technical approval does not unlock the strategy journal; V6/B2 approvals remain retired. A future separate, reviewed `ONE_GLOBAL_FORWARD_STRATEGY_PAPER` owner approval and entitled sources may activate the existing isolated simulator after a new explicit review. Do not fabricate a signed approval based on test fixture fields.

## Outputs
Daily `Fenice ONE GLOBAL — Unified PAPER Evidence` now uploads:
- `fenice-one-global-paper.json`: audited existing V8 engineering history, B2 archive, and global coverage;
- `fenice-one-global-strategy-readiness.json`: committee BUY counts, reason frequencies, research-only near-buy candidates, venue readiness and exact reason why each potential PAPER intent is withheld.

Neither artifact is a real trade, investment recommendation, certified profit, nor an official exchange feed.

## Tests
`node scripts/test-one-global-strategy-paper.mjs` checks the actual stored committee reports **zero** eligible BUYs at the verified snapshot. Separate **synthetic** license/venue/FX fixtures prove the pre-existing engine accepts an explicitly authorized PAPER BUY and rejects unauthorized, fake or duplicated signals, stale quotes, reused vendor families, stale committee snapshots, wrong currency, price-above-limit and tampered cash. Synthetic fills NEVER receive Fase 9 or forward financial certification credit.

## Next intervention (not completed by this PR)
Obtain genuinely entitled fresh sessions and independent feeds for Milan, Frankfurt and Tokyo, plus live FX. Audit candidate signals in the market session they target. Only after independently reviewed owner PAPER consent can prospective strategy BUY→SELL records be persisted atomically and included in a new strategy-performance certification chain. Live trading remains separately locked.
