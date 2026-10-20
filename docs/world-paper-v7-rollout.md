# FENICE World PAPER V7 — rollout controllato (19 ottobre 2026)

## Obiettivo e ciò che è già costruito

V7 è un motore mondiale PAPER **separato** dalla campagna V6 americana.
Legge titoli tramite identità **ticker + MIC + valuta**; non deduce la Borsa
dal domicilio dell'emittente (ad es. ASML e TSM quotati negli USA).
Il motore puro \`runWorldPaperV7\` accetta più Borse e più regioni nello
stesso portafoglio simulato; produce motivi di blocco per ciascun listino,
verifica una catena di eventi SHA-256 e controlla il budget di rischio.

Controlli al momento dell'ammissione di **ogni** nuovo fill PAPER:
1. MIC registrato e identità esatta del titolo, senza ticker ambiguo.
2. Sessione OPEN documentata e specifica per il MIC; prova non più vecchia di 60 secondi.
3. Due famiglie dati indipendenti, prezzi coerenti (divergenza massima 50 bps)
   ed età <=120 secondi; identità, valuta, provenienza e status realtime verificati.
4. Diritto di utilizzo automatico PAPER della fonte, verificato contro una registry
   locale distinta dalle autodichiarazioni dei record, con proof e scadenza.
5. Per i titoli non-EUR, conversione FX/EUR realtime e verificata entro 120 secondi.
6. Strategia PAPER esplicitamente ammessa, segnale con identificativo univoco e fresco.
7. Limite 5% capitale per operazione, massimo turnover 20% per ciclo, massimo
   esposizione regionale 35%, titoli interi, budget contanti, costi stimati.
8. Nessun accesso alle API d'ordine del broker e nessuna modifica al V6.

**Nota importantissima:** la SHA-256 locale degli eventi rileva alterazioni
accidentali rispetto alla catena presente, ma NON è una firma indipendente
della licenza né una certificazione di esecuzione. Le firme/registrazioni
provenienti dai provider richiedono verifica e custodìa in un ambiente
attendibile. Il costo simulato fisso non sostituisce spread, commissioni vere,
liquidità, FX operativo o controllo quality-of-execution.

## Evidenza attuale

- Il funnel mondiale ha selezionato 2.000 *riferimenti* in cinque regioni.
  Questi dati NON sono prezzi tradeable o una watchlist BUY verificata.
- Il pilota a identità controllata contiene titoli USA, Europa, Asia e Brasile;
  alcune aree del mondo non hanno ancora un titolo eseguibile nel pilota.
- \`/paper-mondo\` e \`/api/paper/world-v7\` sono pannelli **read-only**.
- \`world-paper-v7.yml\` verifica l'engine su fixture indipendenti per Asia
  ed Europa e scrive un artifact di osservazione ai passaggi regionali.
- L'osservazione produttiva oggi NON possiede attestazioni live per le
  quote internazionali e registra correttamente **zero nuovi fill**.
  Questi zero non vanno aggiunti né sottratti alla campagna V6.

## Traguardi per rendere PAPER operativo davvero

**G0 - concluso nel codice del pilota:** identità di venue, engine PAPER
multi-currency, ledger, blocchi sui dati non verificati, calendario audit,
regressioni deterministiche offline e pagina separata.

**G1 - integrazione fonti (bloccante):** per ciascun MIC pilot (iniziare XMIL,
XETR e XTKS), confermare dati realtime e licenza per simulazione automatizzata,
due provider realmente indipendenti, provenienza e per-titolo timestamps. Non
trattare Twelve Data /stocks o /exchanges come dati di esecuzione e non presumere
che la licenza USA di Alpaca valga a Tokyo.

**G2 - apertura borsa:** integrare una sorgente autorevole per lo stato esatto
del MIC, festivi e sedute ridotte inclusi. Il solo orario nel fuso della
borsa, anche con gestione corretta DST, non è una prova.

**G3 - FX e strategie:** ottenere FX realtime con scope legale, collegare
il motore decisionale globale a segnali verificati, provare SELL, stop,
ribilanciamento, costi, liquidità, doppie quotazioni e controllo della
capacità effettiva di negoziare il listino tramite broker.

**G4 - esercizio:** rendere persistente in storage affidabile un ledger V7
separato, alimentarlo con cicli osservati, validare PnL e qualità
di simulazione su campione statisticamente informativo e mostrare
il confronto con benchmark regionali al netto dei costi.

**G5 - reale:** operatività su capitale reale NON autorizzata.
Richiede un'autorizzazione distinta e completa e non può essere dedotta da
un audit PAPER, un contatore fill o un deployment READY.

## Comandi

\`node scripts/test-world-paper-v7.mjs\`

\`node scripts/run-world-paper-v7.mjs --output=/tmp/world-v7.json\`

I test utilizzano dati intenzionalmente **sintetici**, non eseguiti dal vivo;
sono test del software e non giornate certificabili per il conto reale.

Non modificare i 92 file fingerprinted della campagna PAPER V6 attiva.

## V7 provider e rischio aggregato (20 ottobre 2026)

- Due famiglie di feed dello stesso provider non dimostrano due fonti indipendenti: de-duplicazione e quorum per provider reale.
- L'archivio PAPER V7 viene ricalcolato dagli eventi BUY/SELL: liquidità, costo medio, quantità, hash finale, commissioni e prezzi simulati devono risultare coerenti.
- Il limite del 5% si applica alla **posizione complessiva**: nuovi intenti di acquisto non possono aggirarlo con identificativi differenti.
- Sono interventi solo al motore simulato V7; non apportano nuove licenze, prove di rendimento, ordini broker o cambi alla campagna V6.

## G1 source intake privato (20 ottobre 2026)

Il precedente osservatore V7 passa volutamente `sessions:[]`, `quotes:[]`,
`fx:[]` e `entitlements:[]`: i suoi zero fill sono veri, non un errore
nel motore simulato. Il nuovo `scripts/run-world-v7-private-preflight.mjs`
è una **porta di sola lettura** per future prove acquisite direttamente dai
provider autorizzati: non effettua chiamate di rete, non richiede credenziali,
non invia ordini, non produce fill e non modifica la campagna V6.

Esempio *solo dopo che un feed esterno indipendente abbia raccolto dati validi*:

```bash
node scripts/run-world-v7-private-preflight.mjs \
  --observations=/percorso/privato/world-v7-observations.json \
  --rights-registry=/percorso/privato/world-v7-verified-rights.json \
  --output=/percorso/privato/world-v7-preflight.json
```

I due file devono stare **fuori dal repository**. Il primo contiene array
`sessions`, `quotes`, `fx`; il secondo è una registry indipendente
con array `sources`, `sessions`, `fx`. Non basta scrivere a mano
`VERIFIED` o copiare due volte lo stesso provider: prima servono contratti,
prove di attribuzione e timestamp autentici. Il codice ricontrolla MIC,
quorum indipendente, freschezza, sessione e FX usando l'engine V7 reale.
Il report salva **solo conteggi e motivi dei blocchi**, mai prezzi o
dettagli contrattuali; il bridge non certifica legalmente la registry da sé.

`node scripts/test-world-v7-private-preflight.mjs` esegue regressioni
con **fixture sintetiche**; anche la fixture valida produce zero fill,
perché manca una distinta autorizzazione PAPER per la V7. Il workflow
`world-paper-v7.yml` esegue ora questa verifica e salva un artifact
sanitizzato. Senza dati privati autorizzati resta correttamente a zero:
non trasformare tale risultato in un fill né in una certificazione.

**Passo ancora mancante e indispensabile:** contratti/fonti indipendenti
realmente utilizzabili per XMIL/XTKS/XETR, feed market-state autorevole,
FX certificato se necessario, segnale di strategia verificabile e una
autorizzazione V7 PAPER separata. Soltanto dopo il superamento di questi
requisiti si può progettare il ciclo persistente con veri fill simulati.
