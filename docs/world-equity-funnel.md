# FENICE100K World Equity Reference Funnel

The previous worldwide dataset contained country-level counts (205,757
stock-exchange references across 57 target countries on 13 Oct), **not**
205,757 separately analyzed companies. The new research-only process
consumes the Twelve Data metadata endpoints already configured for the
existing project, using no paid quote service.

It filters the original per-security rows to exact Common Stock only,
requires name, ticker, currency, issuer country and an explicit known
exchange MIC or a curated provider exchange-code mapping, quarantines
duplicate ticker/MIC/currency conflicts, excludes countries outside
the 5 nonrestricted regions and builds a deterministic balanced
sample of up to **2,000 references** across regions and venue countries.

The sample is **not** a stock selection based on profitability,
liquidity, valuation, momentum or returns. No prices, balance-sheet
claims or target prices are generated. The sample list is kept only as
a short-lived GitHub Actions artifact (7 days); only aggregate source
diagnostics are committed to the app. Artifact availability and
provider reference redistribution terms must be reviewed before
downstream distribution or publication of individual rows.

A weekly job, or a guarded initial push, may scan the provider. It
fails closed without a working TWELVE_DATA_API_KEY, on unexpected
schema or on fewer than 100 usable selected references. A failed
run does not overwrite previously published provider evidence. The
existing frozen US PAPER V6 and Directa read-only safety are untouched.

Next development: independently match individual symbols to ISIN/MIC,
obtain recent company filings, appropriately licensed adjusted price
history, volume and currency/cost data, and perform survivorship-aware
walk-forward testing. Compare net returns and drawdowns to a
low-cost global diversified ETF baseline before discussing PAPER
eligibility for additional venues. **No LIVE trading.**
