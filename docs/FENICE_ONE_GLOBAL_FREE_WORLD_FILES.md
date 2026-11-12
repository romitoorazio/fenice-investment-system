# FENICE ONE GLOBAL — Free worldwide delayed/EOD file intake

Introduced 12 November 2026. This is a research-only intake: not a new version or a change to frozen V8/B2/Phase9/Directa.

## Actual coverage, not a claim of universal free data

There is no single unlimited official free CSV feed for every exchange. The local intake accepts CSV/ZIP from any precisely specified ISO 4-character MIC, but distinguishes format support from authentic data-source coverage, source permissions and PAPER eligibility.

Official free publisher surfaces:
- Euronext (https://marketdata.euronext.com/data-reporting-service/trades-file): Milan XMIL, Paris XPAR, Amsterdam XAMS, Brussels XBRU, Dublin XDUB, Lisbon XLIS, Oslo XOSL. 15-minute delayed MiFID transaction prints as CSV, often zipped; kept >=24h. These are NOT certified closing auction prices. Public redistribution carries additional conditions.
- LSEG (https://dmd.lseg.com/): London XLON and Turquoise delayed semicolon-delimited CSV; per-minute files, not guaranteed official close. Exact schema and rights still need review.
- Deutsche Börse (https://www.mds.deutsche-boerse.com/mds-en/real-time-data/Delayed-data): Xetra XETR, Frankfurt XFRA, delayed gzip JSON, not CSV. This importer does not claim to support that JSON data.
- NSE India (https://www.nseindia.com/all-reports): daily Bhavcopy, including ZIP/CSV. CSV aliases TradDt, TckrSymb and ClsPric are supported; multi-member ZIP is deliberately rejected. Automatic use conditions and exact file format remain to be confirmed.
- Tokyo JPX J-Quants (https://www.jpx.co.jp/english/markets/other-data-services/j-quants-api/index.html): free plan prices 12 WEEKS delayed; unsuitable for next-session PAPER.
- HKEX (https://data.hkex.com.hk/catalog/dataset/0a05f55287014916ab0ea3cff1c26000?lang=en): comprehensive close/trades products require paid licensing; NOT treated as a free source.
- Australia XASX, USA XNYS/XNAS, China XSHG/XSHE, Canada XTSE, Singapore XSES, South Africa XJSE and Brazil BVMF: file format compatibility only, NOT a new verified publisher feed. Existing FENICE providers stay unchanged.

The parser supports other ISO MIC codes for research, without claiming source certification.

## Local import; data stays private

Take downloaded files from the publisher and keep them outside the public GitHub repository. A ZIP must contain exactly one CSV member (header/CRC/size checks); for other ZIPs extract the relevant CSV yourself after verifying its content.

Generic OHLC EOD CSV with explicit Date, Symbol, Close (NSE alternatives supported):

    node scripts/import-one-global-free-world-file.mjs --kind=eod --input=/private/nse.csv --mic=XNSE --symbol=SBIN --currency=INR --session=2026-11-13 --provider=nse-official-report --source-url=https://www.nseindia.com/all-reports --output=/private/nse-report.json --commit

Euronext free delayed trades ZIP, exact ISIN required (does NOT derive a closing price):

    node scripts/import-one-global-free-world-file.mjs --kind=euronext --input=/private/milan.zip --mic=XMIL --symbol=BAMI --isin=IT0005218380 --currency=EUR --session=2026-11-13 --provider=euronext-delayed --source-url=https://marketdata.euronext.com/data-reporting-service/trades-file --output=/private/bami-trades.json --commit

Without --commit: dry-run and metadata-only status. With --commit: new private file, never overwritten, mode 0600 on POSIX. No price, raw source, login, licence or owner consent is published in GitHub logs. --delimiter=semicolon or --delimiter=tab can select other CSV formats.

## Proof boundary

- This intake does not fetch automatically or create paid accounts. It reads existing local CSV/ZIP files.
- Euronext delayed trading reports: tradePrintCount only. Never infer the certified closing auction from last print or from an arbitrary transaction.
- Generic EOD CSV: referenceCloseLocal only for research; venueAndSymbolIndependentlyCertified=false, providerRightsIndependentlyCertified=false, verifiedOfficialClose=false, paperEligible=false, independentProviderReceipts=0.
- Merely labeling a source as official in a command does not authenticate the data or give trading/data rights.
- The existing private PAPER settlement still requires two independently authenticated and rights-reviewed next-session closes, correct mapping and session timing, and explicit private approval. NO paper fills, Phase9 credit or Directa activity are generated here.
- This is a compatible worldwide intake layer, not an operational all-exchange auto-collector. Further per-source collection and validation must be assessed individually.

Regression: node scripts/test-one-global-free-world-file.mjs
