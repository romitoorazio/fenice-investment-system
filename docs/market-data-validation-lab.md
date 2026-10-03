# Isolated market-data validation

Run `node scripts/run-market-data-validation-lab.mjs` for a read-only research experiment, or add `--audit-only` to inspect repository evidence without provider requests. The output is always `artifacts/market-data-validation-lab.json`. It is never written to a production dataset or used for PAPER decisions.

The lab audits primary snapshot rows by source family and reports invalid, missing, stale, future and duplicate timestamps/records. These rows are a subset of the intelligence collector's evidence. The lab preserves the separately recorded production concentration percentage and explicitly reports that its dominant family cannot be reconstructed from the available summary. Do not confuse primary snapshot counts with the complete validation counts.

The crypto experiment covers sixteen curated symbol/name identities. It discovers exact active USD products from the public Coinbase Exchange catalog. For the active products, it requests one batch of fresh CoinGecko USD market quotes using curated provider IDs, then collects Coinbase last-trade tickers. CoinGecko's returned ID, symbol and name must all match the curated instrument; wrapped assets, ambiguous rows and missing products are rejected. No account, credentials, subscription or broker connection is used. Requests are sequential, separated by at least 300 milliseconds, and limited to eighteen calls: one catalog, one CoinGecko batch and at most sixteen tickers. Each provider stops after a rate-limit response; the primary batch is never retried. Failure reasons are retained without provider response bodies.

Provider last-trade timestamps must be explicit and no older than 120 seconds; retrieval time never substitutes for provider time. Primary research timestamps may be up to four hours old, but a price comparison is only possible when the timestamps differ by at most five minutes. Otherwise it is `INCOMPARABLE`. Confirmation and divergence bands remain 0.5% and 2%. The recorded family list only helps prioritize targets and never supplies a new price observation.

Version 2 retains the original snapshot comparison in `attempts[].comparison` and `collection.statusCounts`, including its timestamp-skew diagnosis. The additional `primaryRefresh` and `synchronizedComparison` fields compare two quotes collected during the same experiment. Both provider timestamps must still be no older than 120 seconds at the end of collection. CoinGecko's `last_updated` is an aggregate market-price update, while Coinbase's `time` identifies a venue's last trade; their different price semantics remain explicit. `collection.synchronized` reports refreshed-primary counts, comparison statuses and safe failure reasons separately. A failed, stale, ambiguous or missing refresh cannot fall back to the snapshot, and neither the snapshot nor production confidence is rewritten.

Every observation is `VALIDATION_ONLY`. Publisher-family agreement does not certify upstream data independence, exchange licensing, execution entitlement or PAPER eligibility. This experiment cannot turn an asset into an executable instrument, change production confidence, or contribute evidence days/fills to V6.

The runner checks the active campaign fingerprint and hashes protected production datasets before and after collection. It refuses to run with a changed V6 baseline and fails if any protected input changes. The workflow has read-only repository permissions and retains the report as a thirty-day Actions artifact after successful main-branch quality/foundation runs. Pull requests run local fixtures and a network-free audit only.

Provider contracts verified against the official documentation:

- [Public product catalog](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-all-known-trading-pairs)
- [Last trade ticker and its provider timestamp](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-ticker)
- [Public REST request limits](https://docs.cdp.coinbase.com/exchange/rest-api/rate-limits)
- [CoinGecko market data by exact IDs and provider `last_updated`](https://docs.coingecko.com/demo/reference/coins-markets)
- [CoinGecko keyless IP limits and rate-limit responses](https://docs.coingecko.com/docs/errors-and-rate-limits)
