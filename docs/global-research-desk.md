# Fenice V7 World Research Desk

## What it does

\`/global\` and \`/api/market/global-desk\` organize **research only** across
15 curated cash-market venues on all five world regions. They derive
timezone-correct *indicative regular research windows*, including overnight
Asia and cross-continent daylight-saving transitions, from published exchange
schedules. The original global instrument reference catalogue is counted by
region, validated for matching target country counts, and stamped with its
actual provider observation time. A reference catalogue over 72h old triggers
an update-review warning. None of these are prices, quotations, broker market
access, buy signals or evidence of executed trades.

Sources for newly mapped *indicative continuous equity windows*:
- [HKEX](https://www.hkex.com.hk/Services/Trading-hours-and-Severe-Weather-Arrangements/Trading-Hours/Securities-Market)
- [SGX](https://www.sgx.com/securities/trading)
- [ASX](https://www.asx.com.au/markets/market-resources/trading-hours-calendar/cash-market-trading-hours)
- [LSE](https://www.londonstockexchange.com/personal-investing/faqs)
- [TMX](https://tsx.com/en/trading/calendars-and-trading-hours/trading-hours)
- [B3](https://www.b3.com.br/en_us/solutions/platforms/puma-trading-system/for-members-and-traders/trading-hours/equities/)
- [JSE ZA01](https://www.jse.co.za/sites/default/files/media/documents/jse-factsheeteqm/JSE%20Factsheet_EQM.pdf)

## Limits / next phase

A regular window is not an authoritative LIVE venue clock. Holidays,
early closures, partial auction periods, halts, instrument eligibility,
liquidity, entitlement, quote provenance, short-selling, settlement and broker
access remain unverified outside the existing US PAPER gate. Venue-specific
rules and official calendars need to be ingested from reliable independent
sources before any higher trust status. Reference instruments include
warrants and other securities not suitable or accessible for trading.

No new paid data subscriptions, network requests to exchanges, order
submission, V6 fingerprint changes, campaign renewal, foreign PAPER
execution or cloud-to-Directa broker bridge are introduced. The existing
Foundation research refresh remains on its own schedule. To progress toward
a genuinely worldwide investment system, add licensed or explicitly eligible
fresh observations per region, independently measured strategy/backtesting
data and separate simulated trading certification with explicit approval.
