# Global opportunity EVIDENCE audit (read-only)

The page \`/opportunita-mondo\` and no-store endpoint
\`/api/research/global-opportunities\` separate issuer region from **actual
trading MIC**, with ASML/TSM ADRs as regression cases. The priority order
is the current *US-focused investment committee review*, and not a
ranking of tens of thousands of worldwide stocks or an expected profit.

Evidence sources: persisted \`investment-committee.json\`,
\`terminal-intelligence.json\`, \`instrument-master.json\`,
\`global-reference-coverage.json\`, \`global-market-universe.json\`.
Committee snapshots are research-current for at most 36 h. A global
reference catalog older than 72 h triggers source refresh warning. Daily
candles and saved price figures are NEVER treated as real-time last trades
or independent executable quotes. Foreign stocks present *only* in a
reference catalogue do not receive fabricated company-specific scores,
returns, bid/ask, liquidity or broker support.

Safety invariants: no provider credentials; no paid data; no trade
submission; no new PAPER trials; zero instrument execution eligibility
from reference catalogue; neither this page nor its API modify the
fingerprinted V6 campaign. Missing or unknown MIC/currency must fail
closed. \`EVITA\` names may be displayed as context, never promoted to
research priority. Existing GitHub workflows may refresh sources on their
normal schedules; this read-only UI itself triggers no refresh and has
no guarantee that globally complete data will ever be available free.
