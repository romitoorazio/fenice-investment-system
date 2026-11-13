# FENICE ONE GLOBAL — PAPER EOD privato e prospettico

Data di introduzione: 12 novembre 2026. Questa è una modalità interna di FENICE ONE GLOBAL, non una nuova versione. Il nucleo tecnico V8, i registri V6/B2, la Fase 9 e Directa restano separati.

## Metodo

La strategia registra un segnale dopo la conclusione della seduta D, prima dell'apertura della seduta successiva. Una possibile esecuzione virtuale avviene soltanto dopo la pubblicazione del close della seduta successiva, acquisito da due provider indipendenti. Il prezzo simulato è la media dei due close con 5 punti base di slippage e costi. È una **simulazione ipotetica della chiusura**, non prova dell'eseguibilità di un ordine MOC, un fill del broker o rendimento certificato.

Il segnale deve precedere l'apertura della seduta successiva: non si usano mai prezzi futuri o un close della seduta D per un acquisto retroattivo. Ogni mercato adotta la propria data locale (Roma, Berlino, Tokyo, New York, Sydney, Hong Kong e altre piazze incluse nella lista del codice).

## Limiti e sicurezza

- Capitale virtuale iniziale: 1.000 euro.
- Massimo 50 euro per nuova posizione e massimo 200 euro di turnover giornaliero.
- Commissione virtuale 0,15%, minimo 1 euro per lato.
- Slippage simulato: 5 punti base per lato.
- Due provider e due famiglie indipendenti, prezzi distanti dalla media entro lo 0,5%, simbolo, MIC, valuta, data e provenienza verificati.
- Soltanto close completati e pubblicati dopo la seduta, entro 48 ore; il segnale deve precedere la nuova apertura.
- Proprietario deve revisionare privatamente le condizioni d'uso delle due fonti; per cambi non EUR serve riferimento FX antecedente o conforme alla seduta.
- Nessun documento di licenza, token o prezzo proprietario nel repository pubblico.
- Nessuna connessione a broker, ordine Directa, accredito Fase 9, certificazione di strategia.

I risultati del modulo riportano sempre certificazione zero, anche se i test con fixture dimostrano acquisti/uscite virtuali. Una sequenza hash garantisce coerenza interna ma non autentica il publisher o la licenza.

## Componenti

Il motore puro è in lib/trading/one-global-eod-paper.mjs, con segnali SIGNAL, esecuzioni simulate FILL, replay indipendente del saldo e delle posizioni, rifiuto dei duplicati e delle alterazioni.

Il programma locale scripts/run-one-global-eod-private.mjs legge prove PRIVATE da percorsi assoluti esterni al repository. Per impostazione predefinita fa solo dry-run. Soltanto con --commit può creare o aggiornare atomicamente il journal privato; per SETTLE richiede sempre un secondo file di consenso specifico del proprietario.

Esempio di sola diagnosi privata:
node scripts/run-one-global-eod-private.mjs --event=/percorso/privato/event.json --ledger=/percorso/privato/eod-ledger.json

Esempio di scrittura privata dopo verifiche e consenso:
node scripts/run-one-global-eod-private.mjs --event=/percorso/privato/event.json --ledger=/percorso/privato/eod-ledger.json --authority=/percorso/privato/approval.json --commit

Il programma registra la data reale dell'esecuzione locale, non quella dichiarata nel JSON. Per un segnale, event.json contiene kind SIGNAL e signal con campi corrispondenti al contratto del motore. Per la simulazione, kind SETTLE, signalHash, marketEvidence con esattamente due providerReceipts, ownerReviewedRights e fxEvidence. La politica privata richiede mode ONE_GLOBAL_FORWARD_EOD_PRIVATE_PAPER, consenso esplicito, commit revisionato, scadenza al massimo 90 giorni, autorizzazione alla sola simulazione e flag reali tutti falsi. Questo documento non equivale al consenso.

Lo script scripts/report-one-global-eod-paper-readiness.mjs controlla soltanto metadati EOD pubblici per Milano, Xetra e Tokyo, riportando i blocchi. Il workflow one-global-eod-private-paper.yml testa il codice su PR e una volta al giorno produce una diagnosi senza chiamare provider, senza prezzi e senza credenziali.

## Stato reale delle fonti al 12 novembre

Milano/Enel: RETURNED_SYMBOL_MISMATCH. Tokyo/Toyota: INVALID_SYMBOL_OR_ACCESS. Xetra/Deutsche Telekom: TENTATIVE_COMPLETED_DAILY_RESEARCH, mapping MIC non confermato. Queste fonti NON sono ammissibili oggi a un fill prospettico certificato. Il codice non presume un abbonamento EODHD, una licenza Euronext/Deutsche Börse o l'esistenza di dati di cui non abbiamo prova.

## Avvio e certificazione

I test offline usano fixture sintetiche dichiarate: dimostrano l'aritmetica e il blocco dei falsi dati, non aggiungono trade reali. Il journal strategico attuale e la campagna V8 restano invariati. Non si certifica la Fase 9 automaticamente: occorrono autentiche ricevute esterne e verifiche indipendenti di almeno 10 trade forward chiusi, 3 mercati, 3 giornate e 2 famiglie eseguibili, più la decisione separata di usare tali prove. Finché questa catena esterna non esiste, FENICE resta PAPER EOD sperimentale privato non certificato, e Directa bloccata.

## Sicurezza quando i primi due segnali si chiudono insieme

Con CBA (Australia) e BAMI (Italia) nello stesso registro EOD privato, **due processi che leggono simultaneamente il saldo non devono mai sovrascrivere l'evento dell'altro**. `--commit` usa ora `lib/trading/one-global-eod-private-store.mjs`: acquisizione esclusiva di un file `.lock`, replay dell'ultimo registro letto **sotto il lock**, confronto integrale del journal con lo snapshot iniziale (compare-and-swap), esattamente **un solo evento prospettico** e scrittura temporanea privata `0600` sincronizzata prima del rename. Se l'ultimo hash o il registro sono cambiati, il processo si ferma con `EOD_PRIVATE_LEDGER_STALE_RELOAD_AND_RECHECK`: **non** ricalcola o inventa un fill e **non** cancella quello già registrato. Il responsabile dovrà rileggere il ledger privato, riconvalidare la prova e ripetere l'operazione. Un lock già presente produce `EOD_PRIVATE_LEDGER_LOCK_BUSY`; nessuna rimozione automatica dei lock obsoleti, che richiedono controllo umano.

Il test offline `node scripts/test-one-global-eod-private-store.mjs` prova precisamente la collisione tra due segnali PAPER, il rifiuto di scritture stale, la possibilità di registrare entrambi dopo il reload, i permessi privati e il blocco dell'ordine reale. Questa protezione **non** dimostra indipendenza dei provider né autorizza la registrazione di fill in assenza delle due ricevute e dei diritti d'uso.

## Primo controllo ufficiale AUD/EUR per CBA (BCE)

La prima simulazione australiana richiede un cambio AUD→EUR: il flusso ufficiale gratuito BCE `EXR.D.AUD.EUR.SP00.A` pubblica **AUD per 1 EUR**. La conversione corretta è `rateToEuro = 1 / unitsPerEuro`. Il parser `lib/market/one-global-ecb-aud.mjs` esige la serie esatta, data/valuta/denominatore, tasso positivo e anteriore alla seduta ASX, nessun duplicato e una finestra di ammissione conservativa dopo le 16:10 ora di Francoforte se la rilevazione è dello stesso giorno. L'ora registrata rappresenta **la prima osservazione del nostro fetch**, non l'ora ufficiale di pubblicazione del singolo fix. Il calcolo resta riferimento statistico e non è un prezzo FX negoziabile.

Il motore `lib/trading/one-global-eod-paper.mjs` conserva ora in ogni eventuale FILL in valuta estera **sia il tasso BCE originale sia l'inverso usato per il controvalore EUR**, e rifiuta un tentativo di scambiare AUD/EUR con EUR/AUD, serie di un'altra valuta o dati futuri. I registri senza FILL, inclusi i due segnali privati CBA/BAMI del 12 novembre, rimangono validi.

Verifica isolata:
`node scripts/test-one-global-ecb-aud.mjs`
`node scripts/test-one-global-eod-paper.mjs`

Fonte ufficiale: https://data-api.ecb.europa.eu/service/data/EXR/D.AUD.EUR.SP00.A?format=csvdata

Collettore locale con output **privato**, solo se disponibili dati veri dalla BCE (creazione senza sovrascrittura):
`node scripts/collect-one-global-ecb-aud.mjs --session=2026-11-13 --output=/percorso/privato/ECB_AUD_20261113.json`

Senza `--output`, il programma stampa soltanto un risultato sanitario senza cambio numerico. Il workflow EOD effettua il controllo libero di chiavi alla prima integrazione su main e in schedulazione, ma non salva quotazioni di titoli e non certifica operazioni. Il tasso BCE **da solo non sblocca un acquisto PAPER CBA**: occorrono sempre due chiusure indipendenti della seduta successiva, licenze e condizioni d'uso verificabili e l'approvazione PAPER privata, senza Directa.

Per la prima simulazione CBA, il file BCE privato può essere usato direttamente dal runner con il parametro `--fx=/percorso/privato/ECB_AUD_20261113.json` **insieme a** `--event`, `--ledger`, `--authority` e, solo quando tutte le prove indipendenti di prezzo sono ammesse, `--commit`. Il runner rifiuta intenzionalmente input FX duplicati (`--fx` e `event.fxEvidence` contemporaneamente). Non copia mai la prova BCE dentro GitHub; su BAMI EUR il tasso è fisso 1.

### Diagnosi del primo accesso BCE e resilienza ufficiale

Durante il controllo reale del 12 novembre 2026, il servizio SDMX BCE non ha fornito un dato convalidato entro il timeout: il report segnava `ECB_AUD_REFERENCE_NOT_VALIDATED`. Il collector prova ora, **solo se SDMX fallisce**, anche il feed XML storico ufficiale BCE https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml. Questo è **lo stesso editore BCE, non una seconda fonte indipendente**. Il lettore controlla formato del file, data, tasso AUD, duplicazioni, entità XML indesiderate e finestra di disponibilità; conserva l'hash SHA-256 del contenuto HTTP effettivamente ricevuto e non pubblica alcun cambio numerico nei log GitHub. Se anche l'XML non è disponibile, la contabilizzazione CBA resta bloccata senza ricorrere a quotazioni sintetiche o a un cambio presunto.

## Audit mirato della finestra temporale CBA e Banco BPM

Il 12 novembre, prima dei due settlement del giorno successivo, e stato aggiunto un controllo
**separato e di sola lettura** per gli orari regolari XMIL (09:00–17:40 ora Roma)
e XASX (asta apertura dalle 09:59, asta chiusura fino alle 16:11 ora Sydney). Confronta:
- data della barra di riferimento e sua effettiva data locale;
- ordine temporale close → pubblicazione → registrazione;
- decisione successiva alla chiusura del riferimento;
- decisione **anteriore alla prima apertura ordinaria successiva** (settimane e fusi orari inclusi).

Su CBA, la prova pubblica del 12 novembre rispetta *provvisoriamente* tale finestra
(15:14 UTC del 12 novembre, cioe 01:14 del 13 novembre a Sydney;
la prima apertura ordinaria successiva e alle 10:00).
La prova della seduta reale, dei due prezzi indipendenti e delle licenze rimane assente.

Su Banco BPM, l'ora privata riferita per la decisione del 12 novembre
alle 15:36 italiane e **intraday**. Una decisione ancorata alla chiusura del
12 novembre sarebbe prematura; se ancorata all'11 novembre, sarebbe successiva
alla riapertura ordinaria del 12 novembre. Pertanto **non autorizzare**
il settlement Banco BPM per il solo fatto che il 13 novembre il close sia disponibile;
occorre prima auditare il record privato originale e stabilire se la regola temporale
o il tipo di strategia richiedano una nuova decisione prospettica (mai retrodatare).

Il controllo e conservativo ma non certifica il calendario festivo, l'effettiva apertura
di una seduta, i diritti della fonte, il close, il consenso privato o un fill. Non modifica
o invalida retroattivamente il ledger: aggiunge un controllo diagnostico per evitare di
trasformare un segnale di ricerca in una prova PAPER non ammissibile.

Esecuzione pubblica solo CBA: `node scripts/audit-one-global-eod-pilot-time.mjs`.
Esecuzione con journal originale **fuori GitHub**:
`node scripts/audit-one-global-eod-pilot-time.mjs --ledger=/percorso/privato/eod-ledger.json`.
Il comando non mostra prezzi, ricevute o hash privati, non scrive sul journal
e non collega mai Directa. Regressione:
`node scripts/test-one-global-eod-pilot-time-audit.mjs`.

## Sblocco sicuro del segnale BAMI intraday non ammissibile (13 novembre 2026)

Il segnale XMIL:BAMI registrato giovedì 12 novembre alle 15:36 italiane è stato creato durante la seduta: non può essere reinterpretato come decisione dopo la chiusura del 12, né come ingresso successivo alla chiusura dell'11 (la seduta del 12 era già iniziata). Un settlement venerdì 13 sarebbe retroattivo e deve restare bloccato.

Il precedente registro privato non prevedeva l'evento di chiusura di un segnale pendente non ammissibile, impedendo un nuovo segnale valido sullo stesso titolo. Ora il comando `kind=CANCEL` produce **soltanto** un evento append-only, con hash concatenato e motivo fisso `INVALID_PROSPECTIVE_EOD_WINDOW`, a condizione che l'audit del record privato originale XMIL/XASX ne dimostri l'irregolarità temporale. Non può annullare segnali validi, non richiede prezzi e non cambia cassa, posizioni, storia o permessi di trading.

Procedura privata, senza inserire ledger o dati sensibili nel repository:

1. `node scripts/audit-one-global-eod-pilot-time.mjs --ledger=/percorso/privato/eod-ledger.json` per verificare la vera registrazione BAMI. Senza file privato il sistema **non assume** che esista.
2. Se il segnale originale è pendente e fuori finestra, preparare fuori GitHub un evento JSON `{"kind":"CANCEL","signalHash":"<hash-originale-privato>"}`. Il solo hash deve essere copiato localmente dal proprio registro autentico.
3. Eseguire inizialmente `node scripts/run-one-global-eod-private.mjs --event=/percorso/privato/cancel-event.json --ledger=/percorso/privato/eod-ledger.json` (DRY-RUN). Solo se l'esito è corretto ripetere con `--commit`: scrittura CAS con lock e audit completo, un solo nuovo evento.
4. Il nuovo segnale BAMI deve essere generato **dopo un close davvero pubblicato**, con un nuovo ID, una prova fonte valida e decisione anteriore all'apertura della seduta successiva. Un eventuale segnale dopo la chiusura di venerdì 13 potrebbe essere valutato sulla seduta di lunedì 16, **non** conteggiato come fill venerdì. Non creare segnali fittizi nel registro reale.

Questa riparazione risolve soltanto il deadlock della coda dei segnali. Non importa licenze, ricevute indipendenti o approvazione privata; non abilita un PAPER CERTIFICATO né Directa. La regressione `scripts/test-one-global-eod-paper.mjs` include annullamento non ripetibile, saldo immutato, divieto di annullare un segnale valido e riapertura prospettica BAMI.

## EOD Milano: riallineamento del pilot a Banco BPM (13 novembre 2026)

La diagnosi del 13/11 ha trovato che il pilot di ricerca XMIL interrogava **ENEL**, mentre il primo segnale privato sospeso e l'obiettivo operativo si riferiscono a **BANCO BPM / BAMI**, ISIN **IT0005218380**, Euronext Milan (fonte identità: https://www.borsaitaliana.it/borsa/azioni/scheda/IT0005218380-MTAA.html?lang=it). Il pilot XMIL ora usa `BAMI` invece di `ENEL`; Tokyo e Xetra non cambiano, rimangono al massimo sei richieste Alpha Vantage per l'esecuzione standard. ENEL rimane disponibile negli altri componenti di ricerca/strumenti; non si eliminano dati storici.

La stringa `BAMI.MIL` è una **candidata Alpha Vantage non certificata**: `SYMBOL_SEARCH` deve sempre confermare unicità di emittente/regione/valuta e `TIME_SERIES_DAILY` deve restituire metadati coerenti. Senza conferma, le barre restano al massimo ricerca provvisoria, mai prezzo di esecuzione. Una risposta di Enel o di un altro emittente non può passare come BAMI, e non si stampano OHLC o credenziali nei log pubblici.

Il workflow EOD su `main` può raccogliere metadati nuovi dopo l'integrazione; qualsiasi barra giornaliera della seduta corrente è esclusa fino al giorno locale successivo. L'osservazione EOD, anche se riuscita, **non** sblocca da sola il PAPER privato: rimangono necessari il record originale, la finestra prospettica corretta, due ricevute di close indipendenti e i diritti d'uso verificati dal proprietario. Nessuna modifica a Directa, Fase 9, V6, B2, V8 o ai registri privati.

## Diagnosi non sensibile degli alias Alpha Vantage (13 novembre 2026)

La raccolta reale BAMI di oggi ha restituito `RETURNED_SYMBOL_MISMATCH`. Per identificare la causa senza pubblicare quotazioni, la ricerca EOD conserva **solo quando l'identità non coincide** il simbolo dichiarato nel metadata `2. Symbol` del provider (alfanumerico/suffisso con lunghezza limitata) e la classe `SAME_TICKER_DIFFERENT_SYMBOL`, `DIFFERENT_TICKER` o `UNAVAILABLE_OR_INVALID_METADATA`. Un simbolo non sicuro viene omesso. Qualsiasi differenza continua a impedire il parsing delle barre e non viene accettata automaticamente come alias: nessun prezzo o licenza è certificato. La regressione vieta in modo esplicito che ENEL sia conteggiato come BAMI, anche in presenza di dati formalmente validi.

## Fonte gratuita alternativa per la ricerca EOD Banco BPM (13 novembre 2026)
La sorgente Alpha Vantage del pilot `XMIL:BAMI` rifiutava `BAMI.MIL` perché mancava un identificativo valido nella risposta. Il job EOD dispone ora di **fallback Yahoo Finance `BAMI.MI`** usando la stessa famiglia di raccolta chart già presente per altri mercati in FENICE. Il fallback viene interrogato solo quando la prova Alpha milanese fallisce o quando manca la chiave Alpha in un run esplicitamente autorizzato (`--network`). Massimo due tentativi verso query1/query2, **un'unica famiglia editoriale**, mai due fonti indipendenti. Restano 6 chiamate Alpha massime; Tokyo e Xetra non cambiano.

Una serie Yahoo entra in ricerca soltanto se i metadati dichiarano esattamente `BAMI.MI`, valuta `EUR`, strumento `EQUITY` e fuso `Europe/Rome`, con timestamp crescenti, OHLC coerenti, almeno 22 sedute già completate e freschezza massima di 7 giorni. Il modulo riutilizza il filtro conservativo delle candele di FENICE ed esclude **sempre la seduta corrente** per evitare look-ahead. I risultati pubblici riportano solo data, stato, segnale di trend e diagnostica. Nessuna barra, importo, transazione o dato Yahoo grezzo viene caricato in GitHub.

`TENTATIVE_COMPLETED_DAILY_RESEARCH` significa esclusivamente orientamento storico/ricerca: **non** conferma MIC in modo indipendente, licenza PAPER, chiusura ufficiale, quotazione eseguibile, consenso privato, né genera un'operazione nel journal. Per un PAPER valido occorrono sempre due close indipendenti ammissibili della seduta **successiva al nuovo segnale**, verifica diritti e commit privato. La riparazione non sostituisce il vecchio segnale BAMI intraday e non autorizza Directa.

## Sorgente ufficiale di chiusura Banco BPM — controllo non eseguibile (13 novembre 2026)

La pagina pubblica `https://www.borsaitaliana.it/borsa/azioni/listino-ufficiale.html?isin=IT0005218380&lang=it` mostra **Codice ISIN**, **Codice Alfanumerico**, **Prezzo di Riferimento di Chiusura** e **Ultimo Contratto**. FENICE ora la consulta in sola lettura (un GET HTTP senza autenticazione, cookie ottenuti con login, browser automation o aggiramento WAF) per un controllo EOD parallelo al fallback Yahoo (`BAMI.MI`). Il parser:
- riconosce soltanto Banco BPM, ISIN `IT0005218380` e ticker `BAMI`;
- separa *Prezzo di Riferimento di Chiusura* da *Prezzo Ufficiale* e *Ultimo Contratto*;
- usa la data dell'ultimo contratto come **indizio conservativo** della seduta, rifiuta date future, precedenti di oltre 7 giorni e qualsiasi pretesa close della seduta corrente prima delle 17:45 ora di Roma;
- confronta **in memoria** il riferimento ufficiale con la barra Yahoo della *stessa data*, con scarto max 0,5%;
- pubblica soltanto lo stato `TWO_PUBLISHERS_CONCORDANT_RESEARCH_ONLY`, `REFERENCE_SESSION_OR_YAHOO_BAR_MISSING`, `PRICE_DIVERGENCE_DIAGNOSTIC_ONLY` o l'errore esplicito della fonte, più data e hash della pagina; **non** pubblica prezzi, HTML o documenti dei provider.

Questa verifica è **diagnostica**, non una ricevuta PAPER: due siti non provano che vi siano due upstream indipendenti o diritti di utilizzo per la simulazione automatica. I termini Euronext indicano gratuito l'uso interno dei dati ritardati (https://www.euronext.com/en/data/real-time-data/pricing-specs-agreements/market-data-pricing-policies), ma occorre controllare le condizioni applicabili alla specifica pagina/servizio e al non-display. Il provider Yahoo rimane research-only. Mancano ancora consenso privato, doppia prova ammissibile, verifica del ledger e un segnale cronologicamente valido. Nessuna operazione sul broker.

## Ripristino guidato del segnale privato Banco BPM intraday

La correzione `CANCEL` conservativa è disponibile nel motore e il runner locale ora permette, **senza copiare l'hash originale**, una ricerca del solo segnale pendente `XMIL:BAMI` nel ledger privato autentico:

`node scripts/run-one-global-eod-private.mjs --cancel-invalid-bami --ledger=/percorso/privato/eod-ledger.json`

È **dry-run**: effettua replay crittografico e tenta di calcolare esattamente un evento append-only `CANCEL`, ma non scrive alcun file. Se manca il ledger privato, non esiste un BAMI pendente, sono presenti più candidati, il segnale è temporalmente valido oppure l'evento non rispetta l'audit EOD, il comando fallisce e non crea un nuovo segnale.

Soltanto dopo aver ispezionato il risultato del dry-run e il file privato originale, lo stesso comando con `--commit` può scrivere **un solo evento**, con lock, compare-and-swap e rename privato; non tocca il ledger pubblico, non annulla CBA, non elimina eventi e non modifica saldo, posizioni o Directa. Il tool rifiuta di combinare questa modalità con un evento, un consenso o un FX esterni. Resta impossibile eseguire il comando dal solo GitHub pubblico: il proprietario deve avere accesso al suo ledger privato sul computer autorizzato. Nessun BUY PAPER viene creato dall'annullamento.
