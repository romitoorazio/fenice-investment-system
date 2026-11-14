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
Questo file non è una variabile di recovery, non è generato dal software e
non deve essere inserito nel repository pubblico. Se assente, il blocco è
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
legale del documento. La revisione del proprietario deve essere autentica;
non viene prodotta automaticamente, desunta dai nomi dei provider o sostituita
dall'autorizzazione allo sviluppo. I flag di certificazione restano falsi.

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
tutti i documenti originali già presenti. Ogni caricamento archivia prima il file
originale nello stesso Blob privato, scrive solo `settlement-inputs.json` con
creazione esclusiva o ETag CAS e rilegge il risultato. Un conflitto o una risposta
persa impone di ricontrollare lo stato. Caricare di nuovo lo stesso consenso
non elimina le prove dei provider già collegate.

L'importazione non chiama il settlement, non scrive il journal e non acquisisce
quotazioni. Il ciclo cloud preesistente riesamina successivamente le prove con
il motore rigoroso. Limiti: file massimo 500 kB, JSON UTF-8, originali verificati
tramite SHA-256. Il contenuto non compare nei log o nelle risposte pubbliche.
