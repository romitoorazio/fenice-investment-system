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
