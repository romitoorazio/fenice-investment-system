# FENICE100K World Equity Reference Funnel

The previous worldwide dataset contained country-level counts (205,757
stock-exchange references across 57 target countries on 13 Oct), **not**
205,757 separately analyzed companies. The new research-only process
consumes the Twelve Data metadata endpoints already configured for the
existing project, using no paid quote service.

It filters the provider rows to common shares and reconciles the exchange
MIC and country with the active ISO 10383 registry. It quarantines conflicting
ticker/MIC/currency identities. The sample of up to **2,000 references**
gives each mapped exchange one place before any receives a second. The
starting exchange rotates over time, and the public summary reports counts
by MIC, including mapped exchanges with zero matching listings.

The sample is **not** a stock selection based on profitability,
liquidity, valuation, momentum or returns. No prices, balance-sheet
claims or target prices are generated. The sample list is kept only as
a short-lived GitHub Actions artifact (10 days); only aggregate source
diagnostics are committed to the app. Artifact availability and
provider reference redistribution terms must be reviewed before
downstream distribution or publication of individual rows.

The catalogue refresh runs twice a week and can be dispatched manually. It
fails closed without a working TWELVE_DATA_API_KEY, on unexpected
schema or on fewer than 100 usable selected references. A failed
run does not overwrite previously published provider evidence.

The hourly `world-market-collection.yml` job uses this same catalogue.
One request retrieves the provider's exchange states globally, including on
weekends. The job spends up to four additional requests probing quotes for
currently open venues. It prioritizes the venues least recently probed and
rotates both ties and listing samples. An operating MIC may suggest when
to probe a segment. Exact MIC, symbol, currency and freshness are checked
on the returned quote. The report contains diagnostic statuses and
timestamps. Provider prices, credentials and broker actions are excluded.
The single-provider report gives zero PAPER or investment certification credit.

Next development: independently match individual symbols to ISIN/MIC,
obtain recent company filings, appropriately licensed adjusted price
history, volume and currency/cost data, and perform survivorship-aware
walk-forward testing. Compare net returns and drawdowns to a
low-cost global diversified ETF baseline before discussing PAPER
eligibility for additional venues. **No LIVE trading.**
