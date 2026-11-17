# Directa: verifica locale e percorso al primo acquisto manuale

Verifica tecnica: 17 novembre 2026. Non abilita LIVE e non costituisce un ordine.

## Lavoro già esistente

La prova Windows del 18 ottobre, documentata in
[directa-local-empty-lists-20261018.md](directa-local-empty-lists-20261018.md),
ha osservato `CONN_OK` sulla porta trading 10002, senza datafeed a pagamento.
Il collector attuale richiede nuovamente conto, disponibilità e liste complete
dopo la connessione: il test storico non dimostra il saldo di oggi.

L'adattatore Directa resta locale, di sola lettura. `submitDirectaOrder()`
rifiuta ogni invio e `LIVE_TRADING_RELEASED` resta `false`.
Il cloud PAPER funziona indipendentemente dal PC; soltanto la lettura Darwin
richiede il PC con Darwin aperto durante quella verifica.

## Riconciliazione collegata al comando esistente

Il comando esistente può confrontare lo snapshot appena ricevuto con le
aspettative del **conto reale**, mantenute privatamente sul PC:

```powershell
npm run directa:readonly -- --port 10002 --expectations "C:\percorso-privato\expected-broker-state.json"
```

Formato delle aspettative, soltanto se i valori sono effettivamente verificati:

```json
{
  "positions": [],
  "openOrderClientIds": [],
  "expectedCashEuro": 1000
}
```

Questo è uno schema illustrativo, non una prova del saldo corrente. Non copiare
il registro PAPER: i suoi acquisti virtuali non sono posizioni Directa.
Il file non va aggiunto a GitHub, al cloud o ai log pubblici.

Il controllo richiede snapshot completo e recente entro 15 secondi, nessun
errore di protocollo, aspettative numeriche finite e assenza di duplicati.
Confronta quantità, disponibilità e identificativi degli ordini aperti. Un ordine
aperto privo di identificativo client blocca la verifica invece di scomparire
dal confronto. Una discordanza restituisce codice di uscita 2; il resoconto
espone soltanto tipi di errore. I duplicati ricevuti dal socket vengono rifiutati
prima che il reducer possa sovrascriverli.

`Broker reconciliation verified: true` attesta esclusivamente quel confronto
locale. `Individual executions reconciled: false` e `live readiness verified:
false` restano espliciti: non esiste ancora un registro reale persistente dei
singoli eseguiti, né una macchina ordini LIVE collegata.

## Commissioni: verificare il profilo effettivo

Riferimenti ufficiali consultati il 17/11/2026:
[tariffe Directa](https://www.directa.it/commissioni) e
[contratto tecnico dAPI](https://directa-it.github.io/documentation/).

Per azioni MTA, la tariffa pubblica Variabile è 1,9 per mille, minimo 1,50 € e
massimo 18 €; Semplice è 5 € per ordine eseguito. Xetra ha minimo 9,50 €,
USA 9 USD. Sono tariffe pubbliche, non il profilo verificato del conto.
In Libera il profilo è visibile in Il mio profilo → Preferenze di trading →
Profilo commissionale. Nessuna impostazione viene modificata dal programma.

Il tetto PAPER attuale di 50 € non è un nuovo limite LIVE approvato. A titolo
di costo, 50 € su MTA con Variabile comportano almeno 1,50 € per lato: 3 €
andata/ritorno, pari al 6% del solo controvalore, prima di spread e imposte.
La simulazione PAPER usa costi convenzionali diversi e ammette frazioni:
non va trasferita automaticamente in un ordine di azioni reali.

## Cosa serve realmente per un ordine manuale

La strada breve è l'inserimento da parte del proprietario nell'interfaccia
Directa dopo una nuova conferma esplicita su titolo/ISIN/mercato, quantità
intera, prezzo limite, durata e massimo addebito comprensivo dei costi.
Non richiede di costruire un nuovo adattatore automatico né di aprire il lock
FENICE. Il saldo, il profilo e la convenienza economica devono essere correnti;
il titolo non è selezionato da questo documento.

| Controllo | Stato effettivo |
|---|---|
| Collegamento 10002 | Prova storica recuperata; protocollo locale testato con server sintetici |
| Conto/posizioni/ordini aperti | Collector esistente e confronto locale collegati; nuova lettura del PC ancora necessaria |
| Invio con conferma | Invio FENICE assente; eventuale conferma e invio spettano al proprietario in Directa |
| Duplicati | Rifiuto di righe/ID duplicati nella lettura; nessun retry o invio LIVE implementato |
| Rifiuto, cancellazione, eseguito parziale | Stati letti dal protocollo; residuo aperto resta atteso, stato terminale non viene trattato come aperto; singoli eseguiti non ancora riconciliati |
| Arresto di emergenza | Lock software chiuso; per un ordine manuale fermare nuovi inserimenti e verificare/revocare l'eventuale residuo da Directa |
| Capitale e perdita | Limiti verificati nel PAPER; limiti LIVE e gestione della perdita da approvare prima dell'eventuale ordine |

Dopo un timeout non reinserire un ordine per supposizione: prima verificare
lista ordini, eseguiti, residuo, disponibilità e posizioni nel broker. La
connessione può interrompersi dopo che il broker ha già accettato l'ordine.
Un kill switch software non annulla automaticamente un ordine già ricevuto
dal broker. Nessun eseguito reale viene scritto nel journal PAPER originale.

## Prove automatiche

```powershell
node --experimental-strip-types scripts/test-directa-local-readonly.mjs
node --experimental-strip-types scripts/test-directa-local-reconciliation.mjs
npm run broker:safety
npm run institutional:test
```

Sono fixture sintetiche: non contano come operazioni reali o FILL PAPER rigorosi.
Il core congelato e le relative approvazioni restano invariati.
