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

## Primo PAPER: secondo percorso EOD gratuito USA (sperimentale, 13 novembre 2026)

Per non bloccare tutta FENICE su CBA/ASX e Banco BPM è stato aggiunto un
intake **privato di ricerca**, per soli AAPL/MSFT/TSLA (XNAS), usando due
API documentate e separate: Alpha Vantage `TIME_SERIES_DAILY` ed EODHD EOD.
EODHD prevede una chiave demo pubblica per questi simboli e una Free tier
da 20 chiamate/giorno per valutazione; Alpha Vantage ha limiti gratuiti
propri. Non è garantito che una delle due abbia aggiornato il close al momento
della richiesta. **La presenza di due fornitori non certifica che gli upstream
siano indipendenti, né conferisce automaticamente i diritti di simulazione
non-display.**

Il comando locale, dopo la chiusura della seduta americana, è:

```bash
ALPHA_VANTAGE_API_KEY=<chiave_gia_configurata> node scripts/collect-one-global-first-paper-dual-eod.mjs --symbol=AAPL --session=YYYY-MM-DD --output=/percorso/privato/eod-aapl.json --commit
```

Su Windows passare la chiave tramite variabile d'ambiente già presente,
senza scriverla nel comando o su GitHub. Se l'utente ha una propria
`EODHD_API_TOKEN` può passarla tramite ambiente; in sua assenza si usa
soltanto `demo` per i tre simboli elencati. Mai salvare token in
`data/`, log, artifact, PR o issue. L'output resta sul disco privato,
con permessi `0600` dove disponibili e file *create-only*.
Senza `--commit` non viene scritto nulla.

Sono verificati: risposta JSON, data/sessione USA completata, simbolo, due
prezzi positivi entro 0,5%, limite temporale, duplicati e hash SHA-256
delle risposte effettive. Le medie mobili 5/20 sono solo indicatori
di ricerca. Test: `node scripts/test-one-global-first-paper-dual-eod.mjs`.

**Confine obbligatorio:** questo report non contiene approvazione dei
diritti dei provider, calendario di negoziazione indipendente, verifica
dell'identità degli upstream, consenso specifico al nuovo FILL,
record SIGNAL decisione prima dell'apertura successiva o prova futura
di close dopo tale segnale. Pertanto è sempre
`paperSettlementEligible:false`, `certifiedVirtualFills:0`,
`phase9Credit:0` e Directa disabilitata. Non viene convertito da solo in
un evento SETTLE del journal principale. La scrittura reale resta
protetta dal motore `run-one-global-eod-private.mjs`: nessun valore
sintetico, nessuna retrodatazione e nessuna deroga all'audit.


## Registro PAPER osservato di esercizio, senza certificazione (13 novembre 2026)

Per poter **registrare contabilmente** una simulazione personale basata su un
prezzo storicamente osservato, mantenendo intatto il ledger EOD rigoroso, è
disponibile il modulo `lib/trading/one-global-observed-paper.mjs` e il comando
`scripts/run-one-global-observed-paper.mjs`.

Il primo caso è **CBA Australia**: segnale forward del 12 novembre, osservazione
manuale del close 13 novembre, cambio BCE 12 novembre, quantità frazionaria,
commissione e saldo in EUR. Si accettano solo il record sorgente firmato SHA-256
e il relativo registro originale la cui catena hash è coerente. Il programma
rifiuta alterazioni, duplicati dello stesso segnale, finestre temporali errate,
dimensione posizione oltre 50 euro, incongruenze FX e consenso non valido.

Il registro in output mantiene `kind: FILL` ma distingue esplicitamente
`executionClassification: OBSERVED_CLOSE_PERSONAL_PAPER_UNCERTIFIED`,
`strictPaperFills: 0`, `certifiedTrades: 0`, `phase9Credit: 0`.
È **contabilità virtuale per ricerca personale, non un ordine sul broker,
non un'asta eseguibile, non un FILL del motore rigoroso**. La quotazione della
pagina consultata non costituisce una ricevuta API autentificata o una licenza
di uso automatizzato: il percorso non viene mai promosso automaticamente.

Esecuzione sul disco privato esterno al repository:
```bash
node scripts/run-one-global-observed-paper.mjs \
 --original=/private/strict-ledger.json \
 --practice=/private/sourced-practice.json \
 --consent=/private/owner-consent.json \
 --output=/private/observed-paper.json --commit
```

Senza `--commit` effettua solo dry-run. Con `--commit` crea un file nuovo
privato con permessi restrittivi, senza sovrascrivere il journal rigoroso.
Il test `node scripts/test-one-global-observed-paper.mjs` è indipendente:
usa fixture dichiaratamente sintetiche e prova replay, antifrode,
idempotenza e isolamento Directa. Le fixture non vengono considerate
esecuzioni di mercato.

**Percorso verso il primo FILL rigoroso:** tenere questo registro osservato
separato; completare le condizioni delle due fonti originali indipendenti
utilizzabili per simulazione privata, registrare un nuovo segnale dopo una
seduta realmente conclusa e prima della successiva apertura, poi
registrare il FILL solo con `run-one-global-eod-private.mjs` e un
consenso specifico valido. L'intervento NON altera V6, V8, B2, Fase 9
né le autorizzazioni Directa.


## Collegamento operativo dal doppio EOD al segnale PAPER rigoroso (13/11/2026)

In precedenza il collettore Alpha Vantage/EODHD produceva soltanto una diagnosi
research-only: non lasciava un nuovo evento nel journal EOD originale.
Ora il **collegamento append-only** può creare un vero evento prospettico
\`SIGNAL\` nel *registro privato del motore rigoroso* a partire dall'osservazione
EOD di una seduta USA **già completata**, sempre senza comprare né simulare un
FILL retroattivo.

Regole verificabili:
- solo AAPL/MSFT/TSLA (Nasdaq), con rapporto privato del collettore doppio;
- l'osservazione di entrambe le API deve essere coerente (massimo 0,5%);
- SMA5 maggiore di SMA20 di oltre lo 0,5% e non decrescente;
- decisione registrata con **l'orologio vero del processo**, nello stesso
  giorno locale di New York, dopo le 16:20 e al massimo tre ore dopo l'osservazione;
- chiusura di riferimento alle 16:00 di New York, convertita in UTC in modo
  compatibile con ora legale e ora solare;
- i vincoli di origine dati restano \`sourceRightsIndependentlyCertified=false\`
  e \`researchSignalOnly=true\`, senza anticipare l'approvazione del Comitato;
- usa \`recordOneGlobalEodSignal\` del motore originale, che rigioca
  l'intero registro prima/dopo, rifiuta doppioni e limita il nozionale a €50;
- l'eventuale \`--commit\` utilizza il writer privato con lock esclusivo,
  confronto-e-scrittura, rename atomico, e non scrive su GitHub.

Esempio, in un ambiente **privato** che ha già le chiavi configurate
(senza inventare, cambiare o pubblicare credenziali):

\`\`\`bash
node scripts/collect-one-global-first-paper-dual-eod.mjs --symbol=AAPL --session=2026-11-13 --output=/private/aapl-close.json --commit
node scripts/run-one-global-postclose-signal.mjs --report=/private/aapl-close.json --ledger=/private/eod-ledger.json
node scripts/run-one-global-postclose-signal.mjs --report=/private/aapl-close.json --ledger=/private/eod-ledger.json --commit
\`\`\`

Senza \`--commit\` il secondo comando è un dry-run e non modifica nulla.
Un nuovo \`SIGNAL\` non è un ordine né un FILL. La sua ammissibilità al
prossimo settlement dipende dal prezzo della **seduta successiva**, da due
fonti con upstream autenticati, diritti verificati, calendario di scambio e
consenso PAPER specifico. È vietato convertire il report di ricerca
della stessa sessione direttamente in \`SETTLE\`.

Questi controlli sono testati dalla suite
\`node scripts/test-one-global-postclose-signal.mjs\`. Il test usa solo
fixture sintetiche marcate come tali. **Non viene ancora fornito un collector
in esecuzione sul PC privato**, né un segnale reale nuovo viene inventato in CI.
Il monitor ChatGPT delle 23:30 non sostituisce da solo un processo locale
autorizzato con dati e ledger originali.


## Autopilot locale privato — prima catena prospettica senza comandi ripetuti (14 novembre 2026)

È stato aggiunto `scripts/run-one-global-private-eod-autopilot.mjs`, che riutilizza **solo**
le funzioni preesistenti di acquisizione dual EOD, il bridge research `SIGNAL` e
il writer atomico originale, senza creare un altro motore di trading o versione.
Un'unica esecuzione può consultare al massimo AAPL, MSFT e TSLA, fermandosi al
**primo** segnale di ricerca valido. Il risultato non è mai un ordine reale o
un FILL PAPER. Si parte dai segnali prospettici per costruire una storia vera,
non si retrodata nessun evento.

**Prerequisiti realmente necessari:**
- Esecuzione **sul PC dell'utente o su un ambiente privato autenticato**, mai
  nel workflow GitHub pubblico. Node.js 22, repository FENICE esistente e
  `ALPHA_VANTAGE_API_KEY` già disponibile nell'ambiente dell'utente.
  Non aggiungere token al codice o al task di schedulazione.
- Il percorso `--ledger` deve riferirsi al **journal EOD originale esistente,
  verificabile e FUORI dal repository**, non a un registro nuovo o ricreato.
  Un file mancante, corrotto o un collegamento simbolico sono rifiutati.
- Il task può essere avviato alle **23:30 ora italiana** dal lunedì al venerdì
  sul PC autorizzato: la logica interna ricalcola sempre il giorno e l'orario
  di **New York**, accettando solo 16:35–18:55 ET. I cambi dell'ora legale
  Italia/USA, i giorni festivi, le chiusure e i ritardi dei provider non vengono
  confusi con prove di mercato realmente aperto: la risposta dei provider
  deve superare comunque la validazione del motore.

Comando di ispezione senza modificare il registro:
```powershell
node scripts/run-one-global-private-eod-autopilot.mjs --ledger="C:\PERCORSO_PRIVATO\eod-ledger.json"
```

Dopo aver identificato il **vero** percorso del registro originale, se si
desidera abilitare solo la scrittura del nuovo `SIGNAL` virtuale:
```powershell
node scripts/run-one-global-private-eod-autopilot.mjs --ledger="C:\PERCORSO_PRIVATO\eod-ledger.json" --commit
```

Per esecuzione ripetuta senza nuovi comandi manuali, programmare il secondo
comando nel **Task Scheduler di Windows** sotto il proprio utente, nei giorni
feriali alle 23:30 con directory di lavoro del repository, e verificare che
le credenziali già esistenti siano disponibili alla sessione del task.
**Il task non è stato installato automaticamente sul PC** dal repository né
dalla chat: senza accesso a quel computer non si possono verificare il ledger
privato e l'ambiente delle chiavi, né dichiarare un segnale reale creato.

**Funzionamento fail-closed:** journal rigiocato integralmente PRIMA delle
richieste; simboli duplicati o con `SIGNAL` pendente/same-day esclusi; data
NYSE calcolata dall'orologio, mai passata da una fixture o dalla riga di
comando; al massimo tre simboli e un solo segnale; acquisizione in cartella
temporanea privata eliminata in dry-run; con `--commit` report conservato
SOLO accanto al journal privato, in modalità create-only; primo passaggio del
bridge in dry-run e poi scrittura protetta CAS/lock, con replay e controllo
orario ripetuti. Gli errori vengono riferiti solo con codici riconoscibili,
senza prezzi, segreti, URL completi o payload dei fornitori. Alla mancanza
della chiave non viene toccato alcun journal.

Il primo `SIGNAL` è **research-only**: `paperFillsCreated=0`,
`certifiedTrades=0`, `phase9Credit=0`, Directa e LIVE rimangono
disabilitati. Per il passo successivo, un `SETTLE` richiede il close
**di una seduta successiva** pubblicato da fonti indipendenti ammissibili,
verifica degli effettivi diritti d'uso, calendario ufficiale, consenso
specifico PAPER privato e valutazione EUR. Non usare EODHD demo o due
editori come prova automatica di indipendenza degli upstream.

Conferme documentali sulle licenze **non equivalenti all'approvazione del
singolo utilizzo**: EODHD autorizza l'uso personale per paper trading e
pipeline automatizzate private, anche con dati gratuiti ove accessibili
(https://eodhd.com/help/personal-use,
https://eodhd.com/help/ai-tools,
https://eodhd.com/help/plans).
Alpha Vantage consente l'uso personale non commerciale entro i suoi limiti
(https://www.alphavantage.co/terms_of_service/).
Sono vietate pubblicazione o redistribuzione dei dati originali sul repository
pubblico o in artifact accessibili a terzi.


### Attivazione pianificata su Windows — non ancora installata dal repository

Per evitare impostazioni manuali del Task Scheduler è disponibile lo script
`scripts/install-private-eod-autopilot.ps1`. È deliberatamente **opt-in**:
non crea attività in GitHub, non cambia chiavi, non modifica il journal,
non attiva Directa e non esegue operazioni finanziarie.

Verifica preliminare di PowerShell, senza installazione:
```powershell
.\scripts\install-private-eod-autopilot.ps1 -LedgerPath "C:\PERCORSO_PRIVATO\eod-ledger.json" -CommitSignals -WhatIf
```

Attivazione *sul PC dell'utente*, dopo aver identificato il journal originale:
```powershell
.\scripts\install-private-eod-autopilot.ps1 -LedgerPath "C:\PERCORSO_PRIVATO\eod-ledger.json" -CommitSignals
```

Con `-CommitSignals` il task potrà scrivere **solo SIGNAL PAPER di ricerca**
dopo doppio EOD valido e il controllo dell'originale, mai `FILL`, ordini
broker, autorizzazioni o certificazioni. Senza tale opzione, il task
eseguirà solo **dry-run**, anche se viene richiamato ogni giorno.
Lo script richiede account Windows attuale, Node 22+, fuso orario di Roma,
journal privato già esistente, chiave Alpha Vantage **già presente in
ambiente utente/sistema persistente**, e assenza del task omonimo: se un
prerequisito manca fallisce senza creare task, modificare variabili o
sovrascrivere una schedulazione precedente.

Il task usa le 23:30 locali di lunedì-venerdì, non richiede password in chiaro
e parte solo quando l'utente Windows è connesso. Se parte in ritardo per
spegnimento del PC, FENICE ricontrolla l'orario di New York e impedisce
segnali retroattivi. **La CI verifica soltanto il contratto statico dello
script PowerShell su Linux; non simula una vera registrazione del task Windows.**
Non dichiarare l'automazione attiva fino a conferma sul PC.


## Cloud EOD REALI senza PC — verifica dei provider e del segnale (14 novembre 2026)

**FENICE non richiede il PC acceso.** Il repository esegue già workflow
mondiali, analisi, diagnostica e ricerche EOD su GitHub Actions e ospita la UI
su Vercel. L'installatore Windows aggiunto in precedenza è FACOLTATIVO,
non il percorso cloud consigliato, e non viene attivato dal workflow.

Per avvicinare il primo evento PAPER basato su dati **davvero acquisiti**,
il workflow esistente `.github/workflows/one-global-eod-private-paper.yml`
ora include `cloud-dual-eod-research`. È programmato nei feriali alle
20:45 e 21:45 UTC: il controllo dell'**ora reale a New York** seleziona
la finestra di post-chiusura corretta in EST/EDT e rifiuta le esecuzioni
fuori finestra. I ritardi di GitHub Scheduler NON possono produrre
segnali retroattivi. L'altro cron diagnostico delle 00:15 UTC rimane.

Questa attività:
1. utilizza la chiave Alpha Vantage **già presente nei GitHub Actions
   secrets**, con EODHD demo o la chiave EODHD se disponibile; non
   richiede nuove API e non tocca i secret;
2. raccoglie al massimo tre simboli Nasdaq dimostrativi (AAPL/MSFT/TSLA)
   e confronta due risposte EOD reali con il collettore già testato;
3. applica il **medesimo controllo temporale e di trend prospettico**
   dell'originale ONE GLOBAL, senza convertire due editori in upstream
   indipendenti per dichiarazione;
4. esegue la verifica del potenziale `SIGNAL` **in memoria**, esclusivamente
   per diagnosi; senza journal privato persistente un `SIGNAL` non è
   davvero registrato e un `FILL` non è creato;
5. distrugge i report originali nel file system temporaneo del runner e
   pubblica per 14 giorni **solo un artifact di diagnostica sanitizzato**:
   finestra NY, stato del provider, eventuale risultato del gate, errori
   generici, zero prezzi, zero hash/payload e zero chiavi.

L'esecutore e la diagnostica sono autonomi nel cloud, non nel PC. È
fondamentale distinguere:
- `REAL_DUAL_EOD_SIGNAL_GATES_PASSED_PRIVATE_STORE_NOT_CONNECTED` =
  due prezzi EOD reali hanno superato la fase di ricerca, **ma non esiste
  ancora un segnale persistito nel journal privato**;
- `REAL_PROVIDER_PAIR_FETCH_OR_CLOSE_REJECTED` = una o entrambe le API
  non hanno fornito una prova con data/close ammessi;
- `EXISTING_ALPHA_VANTAGE_GITHUB_SECRET_MISSING` = manca la chiave
  nel contesto GitHub effettivo;
- altri codici di ammissione spiegano trend, mismatch, orario, sessione
  e casi non compatibili. Ogni output è esclusivamente diagnostico.

**Blocco reale verso il FILL rigoroso:** il progetto Vercel è attivo,
ma il tentativo di creare lo storage Blob **privato** nel progetto il
14/11/2026 è stato respinto con risposta `403 forbidden`. Non è
stata creata una destinazione alternativa pubblica né modificata la
visibilità di dati/licenze. Senza uno storage privato persistente
accessibile in sola modalità autorizzata, la migrazione/riapertura
dell'**originale** ledger EOD e il consenso PAPER reale verificabile,
il cloud non può ancora certificare o scrivere un `FILL`. Non
autoinizializzare un nuovo ledger al posto dell'originale, non fingere
un'autorizzazione e non pubblicare chiusure licenziate. Una volta
autorizzato lo storage privato e verificate le condizioni dei publisher,
completare l'adapter con commit atomico/versionato e le prove della
seduta successiva. La diagnostica continua nel frattempo senza PC.

GitHub Actions e Vercel restano l'architettura mondiale già esistente:
questo collegamento di ricerca USA è il **pilota di ammissione dei dati**,
non una riduzione della copertura futura dei PAPER a Nasdaq.


### Contratto di scrittura del journal EOD originale nello storage privato (14 novembre 2026)

Il modulo `lib/trading/one-global-cloud-private-ledger.mjs` rende pronto il
confine del motore PAPER per uno storage **autenticato, privato, persistente
e con ETag compare-and-swap atomico**. Il modulo è indipendente dal vendor:
una volta collegato un backend privato reale, il writer accetta una sola
mutazione append-only, esegue il replay del journal completo prima e
dopo e rifiuta i conflitti. Un backend pubblico, un semplice filesystem
temporaneo di GitHub Actions o un cache senza CAS sono sempre rifiutati.

**Il codice non ha ancora una connessione storage attiva:** Vercel ha
rifiutato la creazione dello store Blob privato con `403 forbidden`, e
nel progetto non risulta configurato `BLOB_READ_WRITE_TOKEN`. Non esiste
alcun consenso valido o autorizzazione a migrare implicitamente il registro:
quando lo storage verrà collegato bisognerà importare il journal EOD
originale, non inizializzare `GENESIS` in sostituzione dei vecchi eventi.

Prima di ogni scrittura il contratto richiede:
- lettura del journal originale autentico completo e controllo di tutti
  gli hash, vincoli economici e finestre temporali del motore rigoroso;
- esattamente **un** nuovo evento valido, conservando byte-logicamente
  gli eventi precedenti e lo stesso `lastHash` come `prevHash`;
- salvataggio atomico con ETag di partenza, senza sovrascrivere un writer
  concorrente e senza dichiarare successo se lo storage non conferma
  l'operazione;
- esclusione di LIVE, Directa, Phase 9, autorizzazioni e scorciatoie
  automatiche sui diritti d'uso.

I test della suite `test-one-global-cloud-private-ledger.mjs`
simulano in memoria un archivio privato, casi di stato mancante,
corruzione, doppioni, due eventi insieme, storage pubblico e
concorrenza. Sono **test sintetici offline**, non una prova di
persistenza su Vercel. Nessun FILL vero, prezzo o chiave è creato.


L'implementazione dello storage è pronta anche come adattatore nativo
`lib/trading/one-global-vercel-private-blob-store.mjs`:
usa il token privato server-side `BLOB_READ_WRITE_TOKEN`, `get()` con
`access:'private'` e `put()` con `ifMatch` e
`allowOverwrite:true`. Se una sessione concorrente ha modificato il
documento, il commit è rifiutato e non ritentato ciecamente.
Il nome del blob è stabile:
`fenice/one-global/private-eod/original-ledger.json`.

**Nessun nuovo segreto è stato inventato o creato; nessuno storage è
stato collegato in produzione.** L'adattatore non autorizza il
bootstrap del journal: occorre importare l'originale storico privato,
verificare la licenza e il consenso PAPER prima di attivare una route
o un cron in produzione. Una volta autorizzati questi prerequisiti,
il contratto CAS è già testato senza chiamate di rete.

### Storage privato creato e collegato con OIDC (14 novembre 2026, verifica effettiva)

Il proprietario ha creato lo store **`fenice-investment-system-blob`**,
con accesso **Private**, regione `IAD1` e occupazione iniziale `0 B`.
Le variabili di progetto Vercel (senza leggerne mai i valori) ora includono
`BLOB_STORE_ID` e `BLOB_WEBHOOK_PUBLIC_KEY` nei target
`production` e `preview`. Questo conferma la connessione del nuovo
store al progetto. L'assenza di `BLOB_READ_WRITE_TOKEN` è **normale**
per i nuovi collegamenti che usano l'autenticazione **OIDC**: il token
Vercel è temporaneo, fornito automaticamente alla Function in esecuzione
nel progetto. Non creare o copiare credenziali permanenti per ovviare.

L'adattatore `one-global-vercel-private-blob-store.mjs` usa
`BLOB_STORE_ID` e le credenziali OIDC gestite dall'SDK quando
disponibili, preservando il vecchio token **solo** come fallback per
connessioni legacy. La scrittura rimane condizionata al vero
`ifMatch` / ETag server-side, mai a una simulazione di lock.

**Stato ancora aperto, da non confondere con lo store creato:**
nessun ledger originale privato è stato importato (lo store è vuoto),
nessun endpoint/job Vercel server-side protetto è ancora collegato al
writer, la correttezza e i diritti delle ricevute di mercato successive
non sono attestati e nessun nuovo FILL rigoroso è presente. GitHub
Actions non deve presupporre di possedere l'OIDC emesso per le
Functions Vercel. Il codice su GitHub non si aggiorna in produzione
finché non passa il processo di deploy controllato. Il problema
storico `403` relativo alla creazione dello store è superato dal
proprietario; **non è una prova di accesso del writer in produzione**.

Fonti: https://vercel.com/changelog/vercel-blob-now-supports-oidc-authentication
e https://vercel.com/docs/vercel-blob/private-storage.
