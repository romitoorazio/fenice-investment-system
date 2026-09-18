# Directa ↔ Fenice — integrazione protetta

Stato: **READ-ONLY LOCALE IMPLEMENTATO / TRADING REALE BLOCCATO**.

## Obiettivo

Fenice deve riconoscere Directa come broker e collegarsi a Darwin in modo verificabile senza creare un percorso accidentale verso ordini reali.

La distinzione resta obbligatoria:

- **broker riconosciuto** ≠ broker connesso;
- **broker connesso in lettura** ≠ trading live autorizzato;
- **tutti i gate PASS** ≠ rilascio live automatico.

## Contratto API verificato

La documentazione ufficiale dAPI Directa fornita dall'utente è stata verificata. Il contratto indica:

- socket TCP locale su `127.0.0.1`;
- porta default `10001` DATAFEED;
- porta default `10002` TRADING;
- porta default `10003` storico;
- messaggi UTF-8 terminati da newline;
- heartbeat `H`;
- file locale `~/.directa/engine/APIPortSettings.txt` per risolvere le porte in presenza di più utenze;
- comandi informativi sul canale TRADING per stato, conto, disponibilità, posizioni e ordini.

Il bridge Fenice non necessita di password, PIN o OTP Directa: si collega esclusivamente al socket locale aperto da Darwin già autenticato.

## Read-only bridge

Sono implementati:

- `lib/brokers/directa-protocol.ts`: parser del protocollo e firewall dei comandi;
- `lib/brokers/directa-readonly.ts`: client socket solo loopback e reducer snapshot;
- `scripts/run-directa-readonly.mjs`: runner locale;
- `scripts/test-directa-readonly.mjs`: test di protocollo e sicurezza;
- `npm run directa:readonly`: acquisizione snapshot locale;
- `npm run directa:readonly:test`: test automatici.

Il bridge accetta soltanto questi comandi:

- `FLOWPOINT TRUE`
- `PRICEEXE TRUE`
- `DARWINSTATUS`
- `INFOACCOUNT`
- `INFOAVAILABILITY`
- `INFOSTOCKS`
- `GETPOSITION <ticker>`
- `ORDERLIST`
- `ORDERLISTNOREV`
- `ORDERLISTPENDING`

Il firewall blocca esplicitamente i comandi operativi e distruttivi, inclusi acquisto/vendita, market/stop, revoca, conferma, modifica ordine, accettazione KID e chiusura Darwin.

## Privacy

Il codice conto Directa può comparire nel messaggio `INFOACCOUNT`, ma Fenice **non lo persiste** nello snapshot read-only. Viene registrato soltanto che un identificatore conto era presente.

Lo snapshot locale viene scritto per default in:

`~/.fenice/directa-readonly-snapshot.json`

Non deve essere committato nel repository.

## Porte e più utenze

Con una sola utenza il bridge usa la porta trading 10002 se il file impostazioni non è disponibile.

Con più utenze Fenice legge `APIPortSettings.txt`. Se sono presenti più conti richiede una selezione locale esplicita tramite `--account` o `DIRECTA_ACCOUNT_CODE`; il codice conto viene usato esclusivamente per selezionare la porta e non viene scritto nello snapshot.

## Stati ordine e reconciliation futura

Il parser riconosce gli stati ORDER documentati da Directa:

- 2000 in negoziazione;
- 2001 errore immissione;
- 2002 in negoziazione dopo conferma;
- 2003 eseguito;
- 2004 revocato;
- 2005 attesa conferma;
- 2006 modificato quando POINTUPDATEORDER è attivo.

`PRICEEXE` consente inoltre di acquisire prezzo eseguito, quantità eseguita/residua e riferimento Directa, necessari per la futura reconciliation e shadow execution.

## Sicurezza live

Restano invariati:

- `LIVE_TRADING_RELEASED=false`;
- `submitDirectaOrder()` non implementato;
- il generico `connectDirectaNetwork()` resta bloccato;
- il solo trasporto implementato è locale, loopback e read-only;
- nessun comando ordine è nella whitelist;
- nessuna credenziale Directa viene salvata nel repository o nel cloud.

## Prossimo livello

Dopo il test sul PC con Darwin aperto, Fenice potrà usare lo snapshot reale per:

1. riconciliare conto/posizioni/ordini Directa con il Paper OMS;
2. produrre shadow orders senza trasmetterli;
3. misurare differenze tra decisione Fenice e stato broker;
4. registrare incidenti di disconnessione e recovery;
5. certificare il bridge nel tempo.

Il trading live rimane una fase distinta e richiederà tutti i gate PASS, paper mode validato, recovery testato e una modifica di codice separata al release lock.
