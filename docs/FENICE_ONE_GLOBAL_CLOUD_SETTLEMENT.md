# Settlement PAPER nel cloud sul journal originale

Il workflow esistente `one-global-eod-private-paper.yml` chiama lo stesso
endpoint Vercel autenticato con OIDC. Il ciclo verifica il prefisso originale
CBA SIGNAL / BAMI SIGNAL / BAMI CANCEL, prova prima il settlement dei segnali
pendenti e poi l'eventuale ricerca prospettica. Non richiede il PC personale.
Le finestre aggiunte coprono Australia/Giappone, Hong Kong/Singapore ed Europa;
le finestre New York preesistenti restano attive. Un orario cron non certifica
che una borsa sia aperta o che i relativi dati siano utilizzabili.

Il percorso chiama **`settleOneGlobalEodSignal`** e
**`commitOneGlobalCloudPrivateLedger`**. Non introduce un altro ledger o una
nuova versione. Prima di ogni scrittura verifica ricevute, consenso e prove,
archivia le risposte grezze nello stesso Blob privato, rilegge gli input
originali, esegue il replay e aggiunge un solo evento con CAS/ETag. Il FILL
contiene `settlementEvidenceArchiveSha256`, il riferimento immutabile a
consenso, documenti, risposte dei provider e risposta BCE usati. Dopo la
scrittura verifica l'evento rilegendo il journal originale.

Un conflitto, una risposta persa o un errore di readback non vengono convertiti
in successo né in un falso conteggio zero: il ciclo fallisce con risultato
non confermato e richiede una nuova lettura. Una successiva esecuzione non
duplica un FILL già registrato. Non ritira automaticamente il pilot CBA e non
usa una seduta successiva per sostituire quella immediatamente prevista.

## Originali privati richiesti

L'adattatore legge solamente
`fenice/one-global/private-eod/settlement-inputs.json` nello **stesso Blob
privato** del journal `fenice/one-global/private-eod/original-ledger.json`.
Questo file non è una variabile di recovery e non deve essere inserito nel
repository pubblico. Il software può aggiungere originali scaricati e revisioni
tecniche attribuite, conservando consenso e documenti precedenti. Se assente, il blocco è
`CLOUD_SETTLEMENT_ORIGINAL_CONTEXT_NOT_CONNECTED`: ciò significa che queste
prove non sono collegate al ciclo, non che non esistano altrove.

Contratto degli input, senza creare esempi di consenso eseguibili:

| Campo | Contenuto originale richiesto |
| --- | --- |
| `kind` | `ONE_GLOBAL_PRIVATE_SETTLEMENT_CONTEXT` |
| `authority` | Oggetto di consenso originale conforme a `validPrivateEodAuthority`, valido prima dell'apertura della seduta da simulare e non scaduto al commit |
| `authorityEvidenceSha256` | SHA-256 dei byte originali del JSON di consenso; il contenuto decodificato deve coincidere con `authority` |
| `documents` | Array di originali con `kind`, `sha256`, `bodyBase64`; ogni hash è ricalcolato dai byte, massimo totale 500 kB |
| `markets` | Array per `key`, `mic`, `currency`, con `sources` e `ownerReviewedRights` |
| `markets[].sources` | Due o tre mapping originali: `providerId`, `symbol`, `key`, `mic`, `currency`, `sourceFamily`, `reviewedByOwner`, `reviewedAt`, `independenceEvidenceSha256` |
| `markets[].ownerReviewedRights` | Una prova per provider con i campi originali del motore: `providerId`, `mic`, `currency`, `evidenceSha256`, `usageScope`, `reviewedByOwner`, `automatedUseAllowed`, `validUntil` |
| `sessions` | Sedute documentate: `mic`, `sessionDate`, `sessionOpenedAt`, `sessionClosedAt`, `reviewedByOwner`, `reviewedAt`, `evidenceSha256` |

Tipi di documento: `ORIGINAL_OWNER_PAPER_CONSENT`,
`ORIGINAL_PROVIDER_USAGE_RIGHTS`, `PROVIDER_UPSTREAM_PROVENANCE`,
`ORIGINAL_EXCHANGE_SESSION`. La presenza di un hash o di una dichiarazione
booleana **non** costituisce una certificazione indipendente del contenuto
legale del documento. Le revisioni personali preesistenti restano compatibili.
Una revisione delegata usa `reviewedByOwner:false` e `technicalReview`, mai
un'approvazione personale inventata. I flag di certificazione restano falsi.

## Revisione tecnica delegata

Per mapping, diritti e seduta, `technicalReview` registra il ruolo e nome del
revisore, il commit esaminato, la data effettiva, la motivazione e lo scope
`SOURCE_MAPPING`, `PROVIDER_USAGE_RIGHTS` o `EXCHANGE_SESSION`. La conclusione
ammissibile è `APPROVED_FOR_DOCUMENTED_SCOPE`, limitata a prove autentiche.
La revisione lega lo SHA-256 canonico di tutti i campi del soggetto (escluso
soltanto `technicalReview`), l'hash del documento originale e lo snapshot del
consenso originale. Cambi di simbolo, MIC, valuta, scadenza, seduta o consenso
invalidano la revisione. È un vincolo d'integrità verificabile, non una firma
crittografica del revisore né una nuova autorizzazione del fornitore.

Il motore e il replay controllano la stessa struttura per i diritti riportati
nel FILL. Il consenso PAPER originale resta obbligatorio e distinto; nessun
certificato tecnico lo sostituisce. Tutti i gate originali, incluse ricevute,
indipendenza, calendario, FX, scadenze, archivio e CAS, restano applicati.

Il controllo cloud archivia separatamente conclusioni della lettura integrale
dei due PDF pubblici, solo per gli hash esatti revisionati il 14 novembre 2026.
Non modifica i documenti già collegati. Una versione sconosciuta resta
`UNKNOWN_ORIGINAL_REVISION`. Le conclusioni attuali **non approvano diritti**:

- Alpha Vantage: `PRIVATE_SCOPE_TEXT_SUPPORTED`; il testo contempla analisi
  personali non commerciali. Non dimostra da solo l'ammissibilità del singolo
  dataset/account né l'indipendenza dell'upstream delle chiusure giornaliere.
- Alpaca: `ACCOUNT_SCOPE_UNRESOLVED`; i termini generali includono un limite
  geografico. La [FAQ dello storico](https://docs.alpaca.markets/us/docs/market-data-faq)
  consente SIP oltre 15 minuti, mentre la [pagina Paper Only](https://docs.alpaca.markets/us/docs/paper-trading)
  limita l'entitlement ai dati IEX. L'accesso tecnico riuscito non è assunto
  come prova risolutiva del perimetro contrattuale del conto.

Queste conclusioni hanno tipo `DELEGATED_TECHNICAL_REVIEW` nel contenitore
privato e mantengono `rightsApproved:false`, `independenceCertified:false`.
Non sono documenti originali del provider e non generano automaticamente
mapping ammissibili, scadenze di licenza o certificati di approvazione.

## Ricevute e fonti

Sono collegati adapter a origini HTTPS fisse, senza redirect, con timeout,
limiti di risposta ed errori oscurati per non divulgare chiavi:

| Provider | Ricevuta usata | Condizione |
| --- | --- | --- |
| Alpha Vantage | Riga esatta di `TIME_SERIES_DAILY`, close non adjusted e simbolo nella risposta | Chiave esistente e mapping/prove originali |
| EODHD | Riga esatta `/api/eod`, campo `close`, mai `adjusted_close` | Demo limitata al pilota esistente; per CBA.AU occorre un proprio accesso ammesso |
| Twelve Data | `time_series`, `1day`, `adjust=none`, verifica simbolo/MIC/valuta | Terza fonte opzionale, chiave già configurata e prove originali; nessun acquisto automatico |
| BCE | XML ufficiale ultimi 90 giorni, riferimento strettamente precedente alla seduta | AUD, USD, GBP, CHF, JPY, HKD, SGD, ZAR; inversione unità per EUR verificata |

Il fallback sceglie due risposte riuscite con famiglie upstream diverse fra
le fonti effettivamente revisionate. Non rende indipendenti due copie dello
stesso feed e non elude limiti di piano o diritti. I mapping non limitano il
sistema agli USA: il settlement usa il MIC/valuta del segnale originale e
mantiene i controlli delle dodici piazze del motore. Una copertura offerta dal
provider non implica che ogni mercato sia già acquisito e verificato.

`publishedAt` nelle ricevute cloud è il momento effettivo della prima
osservazione HTTPS, esplicitamente marcato
`FIRST_OBSERVED_AT_HTTPS_FETCH_NOT_VENDOR_RELEASE`. Non viene inventata
l'ora ufficiale di pubblicazione del vendor. La BCE è un riferimento per la
contabilità PAPER e non un prezzo FX eseguibile.

Fonti pubbliche controllate il 14 novembre 2026:

- [Alpha Vantage: API](https://www.alphavantage.co/documentation/) e [termini](https://www.alphavantage.co/terms_of_service/).
- [EODHD: EOD e accesso demo/free](https://eodhd.com/financial-apis/api-for-historical-data-and-volumes), [piani](https://eodhd.com/help/plans) e [termini](https://eodhd.com/financial-apis/terms-conditions).
- [Twelve Data: documentazione](https://twelvedata.com/docs) e [uso personale/commerciale](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage).
- [BCE: cambi di riferimento](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html).

Non sono stati acquistati abbonamenti o creati account/provider key. Le fonti
gratuite candidate e i relativi termini non sostituiscono i documenti privati.

## Verifica operativa

I test `test-one-global-cloud-settlement.mjs` usano esclusivamente fixture
sintetiche e verificano la catena completa, rifiuti, fallback, FX, duplicati,
conflitti, revoca degli input, perdita della risposta dopo la scrittura e
fallimento di readback. Non contano come FILL autentici del proprietario.

Il job OIDC pubblica solo un allowlist di metadati: `journalEventCount`,
`virtualFillCount` effettivo dal replay, `paperFillsCreated` della singola
esecuzione, stato dei gate e blocchi esatti. Una CI verde non dimostra un
FILL. La prova operativa è il readback autenticato del journal originale.
`certifiedTrades=0`, `phase9Credit=0`, `brokerConnectivityAllowed=false` e
`liveTradingAllowed=false` restano invariati anche dopo un FILL virtuale.

## Importazione protetta da telefono

La pagina proprietario `/recupero-paper` permette ora di caricare un JSON
originale direttamente dal telefono. La route `/api/paper/one-global-private-inputs`
richiede la sessione proprietario già esistente; le scritture richiedono anche
la stessa origine e il runtime di produzione. Nessuna chiave viene creata,
letta dal browser o modificata per questo flusso.

Il tipo **Consenso PAPER originale** accetta il file già approvato, conserva
esattamente i byte (spazi e newline compresi) e costruisce soltanto il contenitore
privato con `markets:[]` e `sessions:[]`. Non genera diritti, indipendenza delle
fonti, attestazioni di seduta o nuove date di approvazione. Un consenso valido
da solo resta insufficiente per il settlement.

Il tipo **Pacchetto completo** accetta il contesto documentato sopra e preserva
tutti i documenti originali già presenti. L'importazione conserva anche i
documenti del consenso originale, le identità dei mercati, gli esatti mapping delle fonti,
le voci dei diritti per provider e le sedute già documentate. Nuove prove si
possono aggiungere; una revisione autentica dei diritti (come Cboe) può
sostituire la voce del medesimo provider, o revocarla, senza cancellarne
l'identità. Il motore riesamina sempre la validità dei diritti aggiornati.
Un nuovo consenso PAPER originale valido può rinnovare quello attivo,
conservando il vecchio documento; la revisione di fonti e mercati deve essere
rivalidata contro il nuovo consenso prima di qualunque FILL. Questo impedisce
perdite future, ma non ricrea mapping già assenti né inventa licenze o FILL.
Ogni caricamento archivia prima il file
originale nello stesso Blob privato, scrive solo `settlement-inputs.json` con
creazione esclusiva o ETag CAS e rilegge il risultato. Un conflitto o una risposta
persa impone di ricontrollare lo stato. Caricare di nuovo lo stesso consenso
non elimina le prove dei provider già collegate.

La pagina privata permette inoltre una ricerca **solo su richiesta del proprietario**
degli archivi ORIGINAL già presenti nel Blob privato. Il controllo è read-only,
limita l'analisi a 400 oggetti indicizzati e 40 letture, verifica hash del
pacchetto e byte originali, e segnala se la ricerca è incompleta.
Una mappatura trovata in archivio è soltanto una candidata da verificare:
non prova il diritto corrente del provider e non viene reimportata in automatico.
Nessun byte originale, token, prezzo o hash privato è pubblicato nei log.

L'importazione non chiama il settlement, non scrive il journal e non acquisisce
quotazioni. Il ciclo cloud preesistente riesamina successivamente le prove con
il motore rigoroso. Limiti: file massimo 500 kB, JSON UTF-8, originali verificati
tramite SHA-256. Il contenuto non compare nei log o nelle risposte pubbliche.

L'accesso proprietario è disponibile direttamente nella pagina privata e
dipende esclusivamente dal codice già configurato, dalla sessione HMAC e dai
controlli di origine. L'assenza di configurazione dell'IA generativa non deve
impedire la gestione dei documenti PAPER. Le chiamate generative mantengono
separatamente tutti i controlli di configurazione, budget e uso manuale.


## Existing Alpaca historical SIP source (2026-11-14)

Production already has `APCA_API_KEY_ID` and `APCA_API_SECRET_KEY`. The ONE GLOBAL collector now uses these server-side credentials solely for `GET https://data.alpaca.markets/v2/stocks/{symbol}/bars`. It never calls a trading/order/account endpoint and never transmits these credentials to Alpha Vantage, EODHD, Actions logs or the browser.

Requests explicitly select `feed=sip`, `timeframe=1Day`, `adjustment=raw`, exact New York session dates and an `end` at least 16 minutes old. The adapter rejects missing/duplicate/paginated/wrong-date/wrong-symbol/non-USD bars, stale sessions, invalid OHLCV and unsolicited IEX responses. The price is labelled a consolidated daily close, not a certified primary-exchange official auction price. Broker connectivity and LIVE flags stay false. The research path prefers this configured source and retains the explicit EODHD publisher fallback, including EODHD history plus SIP when Alpha is missing or returns a quota/error body, with its actual identity and raw bytes; it never silently substitutes IEX for SIP.

Primary documentation verified:
- https://docs.alpaca.markets/us/docs/market-data-faq — historical SIP queries without a subscription require `end` at least 15 minutes old; daily aggregation/trade-condition rules.
- https://docs.alpaca.markets/us/reference/stockbars — raw adjustments, interval boundaries, pagination and symbol mapping.
- https://files.alpaca.markets/disclosures/library/TermsAndConditions.pdf — original terms; no personal account or plan acceptance is manufactured by the code.
- https://www.alphavantage.co/terms_of_service/ — original terms.
- https://eodhd.com/help/personal-use — personal PAPER use and the absence of separate permission letters. This is not an entitlement for every ticker or proof of upstream independence.

After settlement/research, a weekend trusted cloud invocation may check the exact completed candidate AAPL row on Alpha and SIP, with an explicit EODHD fallback if one fails. The weekday is a candidate date, not calendar proof. It cannot record a historical SIGNAL/FILL. Received raw responses and original PDF bytes are archived privately. Original PDF documents may be appended to the existing private context with the same original-byte/ETag checks; every previous document, authority, session and market mapping is preserved. Documents are explicitly `ORIGINAL_NOT_YET_REVIEWED`; no owner-review flags, rights approval, expiry date or upstream independence are inferred. Missing/rejected originals remain unconfirmed. An existing valid owner consent is required before any probe. Only fixed, validated counts/statuses enter public logs.

Receiving two close rows or saving public terms does not settle CBA or certify two independent upstreams. The existing original-review, precise session, FX, raw evidence and original-ledger CAS gates still apply. New US signals remain prospective and within the existing post-close window; existing global settlement markets are unchanged. A valid consent is reported independently of an unrelated missing market mapping.


## Private control-plane version binding

The private content HTTP ETag is not assumed to be the provider's CAS version. Real SDK reads now bind an uncached GET, the SDK control-plane `head()` metadata, and a second uncached GET. Both content reads must have identical representation ETags and exact bytes; metadata size must match. Only the provider metadata ETag is returned for `ifMatch`, including for the original journal. A concurrent change, missing metadata or stale precondition fails closed without a blind retry. Context writes are reread with the same binding before confirmation. Explicitly injected legacy test SDKs retain their existing single-version interface; the real SDK must provide `head()`.

The cloud source report may expose a fixed document-connection result and bounded candidate-context byte count. It never exposes a private ETag, hash, raw document, source price or SDK error text. These fields distinguish a rejected/oversized packet from an unconfirmed conditional write while preserving all original documents and consent.

Reference: https://github.com/vercel/storage/blob/main/packages/blob/CHANGELOG.md — documented control-plane `head().etag` / `ifMatch` contract.


## Cboe Europe: politica in vigore dal 1° agosto 2026 (15 novembre 2026)

La libreria ufficiale Cboe per le azioni europee pubblica come corrente la
[European Market Data Policy efficace dal 1° agosto 2026](https://cdn.cboe.com/resources/participant_resources/Cboe_Europe_Data_Policy_August_2026.pdf).
Il PDF originale è stato scaricato da un runner GitHub non privilegiato ed è
stato verificato come file PDF, con SHA-256 esatto
`f7b94db1c37c79cb9deb63dca855907ff0f30db08ce40bc20f6c093b1a59929a`.
Il vecchio SHA-256 del PDF di marzo
`9319ca470aa4cf8fb243b0ae3139f87a7936ea7c2ddf1c0c9e78e8743c2fd228`
resta riconoscibile esclusivamente per una migrazione controllata della
revisione documentale; nessun vecchio originale viene cancellato.

La nuova revisione riconosce solo lo **scope personale interno di dati
ritardati/storici**. Non è una licenza di redistribuzione, non autorizza
real-time o trading LIVE e non sostituisce il consenso del proprietario. I
mapping ENEL/BAMI già archiviati possono aggiornare soltanto il documento
tecnico Cboe con hash nuovo dopo aver verificato la revisione precedente;
mapping in conflitto, modificati manualmente, approvati personalmente o
collegati a un originale sconosciuto restano bloccati. Il journal e le
ricevute di mercato non vengono riscritti. La scrittura del nuovo contesto
rimane privata e soggetta a CAS/ETag e rilettura verificata.

Un aggiornamento di termini non produce segnali o FILL retroattivi: la
prima prova prospettica deve sempre provenire da una nuova seduta completata,
con due piazze indipendenti, vincoli di data, archivio originale e replay.
