# FENICE100K — Custodia atomica locale Phase B V7, esclusivamente fixture

**Data:** 26 ottobre 2026  
**Ambito:** infrastruttura PAPER non esecutiva, capitale virtuale test 10.000 EUR, limite 300 EUR/3% per prova.

## Cosa aggiunge

`lib/trading/paper-v7-phase-b-local-fixture-store.mjs` implementa la
custodia locale del **solo** diario `V7_PHASE_B_TEST_FIXTURE_ONLY`
in una directory privata **esterna al repository**:

- Cartella non-symlink, permessi proprietario `0700`, file `0600`.
- Lock di processo con apertura esclusiva `wx` (O_EXCL). Due runner
  non possono effettuare simultaneamente read-modify-write dello
  stesso file. Un lock orfano **non** viene cancellato automaticamente.
- **Compare-and-swap** sulla punta SHA della catena del journal:
  snapshot obsoleti rifiutati, ID ripetuti trattati come replay innocuo.
- Registro ricostruito e confrontato dopo ogni lettura; nessun reset
  silenzioso a 10.000 EUR su JSON troncato, hash falsato, bilancio
  incoerente o un file non privato.
- Commit tramite file temporaneo esclusivo, `fsync` del file,
  `rename` atomica e `fsync` della directory; rilettura post-commit.
  Un crash prima della rinomina conserva lo stato precedente.
- Kill switch di prova **persistente e monotono**: dopo un arresto,
  nessun nuovo evento può essere aggiunto a quella campagna;
  l'API non prevede il comando di ripristino.
- Ogni append richiede il bridge che applica quorum multi-provider,
  sessione OPEN, FX ammissibile e limiti del manifesto (1/giorno,
  20 tentativi, 250–300 EUR virtuali, 3%, 15% per asset).
  Nessun ordine è passato al motore WORLD come autorizzato.

## Confini espliciti

Il diario è un **collaudo**, non il writer operativo e non rappresenta
fill PAPER certificabili: `genuineOperationalPhaseBFills=0` in ogni
risposta, nessun accesso al broker, nessun ordine LIVE, nessuna
chiave API letta o modificata. Le prove sintetiche di diritti provider
**non certificano** i reali termini di licenza commerciale.

La persistenza qui descritta funziona solo quando la directory e il
processo hanno **uno storage fisico durevole condiviso**. Un job
GitHub Actions o un'istanza Vercel effimera non sono un database
persistente e non risolvono da soli il coordinamento tra host.

L'hash del registro è verificabile contro la stessa catena, ma non
costituisce prova di **custodia esterna immutabile** se un soggetto
privilegiato può sostituire sia contenuto sia hash. Per una vera
campagna PAPER occorreranno storage transazionale, attestazione
indipendente/ancoraggio degli audit root e prova di autenticità delle
quotazioni.

### Test che accompagnano il codice

```bash
node scripts/test-paper-v7-phase-b-local-fixture-store.mjs
node scripts/test-paper-v7-phase-b-offline-bridge.mjs
node scripts/test-paper-v7-phase-b-authorization.mjs
```

I test simulano crash pre-rename, riapertura da un processo diverso,
scritture concorrenti, replay dello stesso intento, CAS obsoleta,
directory pubbliche/symlink, file corrotti/manomessi e kill switch.

## Requisiti non fingibili che restano per l'operatività

1. Baseline finale PAPER Phase B con SHA/digest **dopo** aver chiuso i
   punti tecnici; la V6 congelata rimane immutata.
2. Identità dell'operatore, chiave attendibile ancorata su canale
   indipendente e sua autorizzazione firmata **con scadenza esatta**.
3. Diritti contrattuali d'uso delle quotazioni verificati, quorum di due
   fonti live ed evidenze reali di sessione/FX per ciascun ordine.
4. Writer PAPER **operativo** con storage transazionale multi-host,
   kill switch autenticato, idempotenza, journaling durevole e
   certificazione/riconciliazione esterna. Il fixture writer non deve
   poter essere semplicemente rinominato o promosso.
5. Da quella data in avanti, almeno 30 giorni e 25 evidenze valide,
   con 10 fill PAPER nuovi *autenticamente simulati*: i sette fill V6
   e i test fixture restano esclusi.

**Gate corrente da preservare:** `PREPARATION_ONLY`,
`newPaperOrdersAllowed=false`, `liveTradingAllowed=false`.
