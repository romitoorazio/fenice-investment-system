# Fenice100K V7 Phase B — piano di attivazione PAPER operativa (26 ottobre 2026)

**Autorizzazione conversazionale:** l'utente ha esplicitamente autorizzato il
completamento e l'avvio della Phase B PAPER, non il trading LIVE. È registrata
in `data/paper-v7-phase-b-owner-operating-intent.json`, separata dalla vecchia
preparazione. La conversazione non è una firma Ed25519 verificata né autorizza
a dichiarare esistenti licenze, connessioni o dati non disponibili.

## Policy economica concordata

- Seed **10.000 EUR virtuali**, nessun trasferimento finanziario.
- BUY PAPER simulati da 250 a 300 EUR, **massimo 3% del capitale virtuale
  per tentativo** e **massimo 15% di costo di carico per singolo asset**.
- **1 tentativo per giorno UTC**, massimo **20** complessivi.
- Target **10 fill prospettici genuinamente simulati**, almeno **30 giorni
  di calendario** e **25 giorni con evidenze valide**; V6 7 fill esclusi.
- Nessun collegamento al broker né ordine LIVE, né cambio di chiavi attuali.
- Finestra `2026-10-27T00:00:00Z` →
  `2026-11-27T00:00:00Z` **proposta**, non ancora una scadenza
  autenticata/firmata o una finestra avviata.

## Implementazione aggiunta

1. `db/paper-v7-phase-b-postgres.sql`: schema **separato**
   `fenice_paper_v7` su database privato PostgreSQL con vincoli di
   capitale, sequenza 1–20, unica data UTC, unico ID, stato append-only,
   identità baseline e politica immodificabili, kill switch irreversibile,
   divieto broker e LIVE a livello SQL.
2. `lib/trading/paper-v7-phase-b-rights-review.mjs`:
   revisione d'uso dati **firmata Ed25519**, vincolata ad hash del
   registro delle fonti, venue, FX, due famiglie indipendenti e finestra.
   La firma dimostra l'asserzione di un revisore già riconosciuto: **non
   sostituisce** la verifica del contratto commerciale.
3. `lib/trading/paper-v7-phase-b-postgres-writer.mjs`:
   scrittore futuro PAPER **solo simulato e BUY-only**, con gates:
   firma proprietario + chiave SPKI affidabile, SHA/digest di codice,
   politica con 10.000 EUR, consenso virtuale, firma revisore diritti,
   quorum WORLD V7 su quote/sessione/FX, database PostgreSQL privato
   inizializzato separatamente, transazione `SERIALIZABLE` e lock
   `FOR UPDATE`. Costi, impatto e quantità intere vengono simulati
   senza broker; anche rifiuti ammissibili consumano un tentativo.
   Qualunque errore produce `ROLLBACK`. **Nessuna campagna viene
   creata automaticamente e il runner pubblico non importa il writer.**
4. `scripts/test-paper-v7-phase-b-postgres-writer.mjs`: prove con
   firme e database **ephemeral/mock**, mai dati autentici. Testano
   nessun database, firma/chiave false, LIVE, rights receipt falso,
   quorum errato, stop/scadenza, idempotenza, rollback atomico.

## Stato degli accessi verificato

Il repository `romitoorazio/fenice-investment-system` risulta
**PUBBLICO**; di conseguenza non utilizziamo commit/branch GitHub
come deposito di attestazioni contrattuali, prezzi raw o ledger
privati. La configurazione Vercel controllata contiene otto
variabili ambiente ma **nessun nome identificabile di database
PostgreSQL, Redis o analogo**. Il listing delle integrazioni storage
Vercel ha restituito `403 forbidden`, pertanto **non** possiamo
escludere sistemi esterni non visibili. Non è stata creata una
subscription o avviata una migrazione costosa.

Le API esistenti restano configurate come prima, senza lettura dei
valori. I termini contrattuali di Alpha Vantage e le restrizioni
su serie terze di FRED richiedono una verifica appropriata per
l'uso scelto; una chiave API valida non attesta automaticamente
i diritti necessari. **Nessuna licenza è stata inventata.**

## Azioni finali necessarie prima di `PAPER_ACTIVE`

1. Collegare un database PostgreSQL **privato, persistente,
   transazionale**, con backup e account di servizio a privilegi
   minimi. Verificarne i vincoli con test su un'istanza reale, quindi
   eseguire la migrazione **solo** con consenso e utenza idonei.
2. Certificare il nuovo codice baseline SHA/digest e ancorare la
   chiave dell'operatore tramite canale indipendente; ottenere la
   sua firma Ed25519 sull'ID, finestra e policy definitiva. La
   conversazione documenta il consenso, ma l'**identità crittografica
   dell'operatore non è stata creata o falsificata**.
3. Acquisire l'effettivo diritto d'uso PAPER delle due famiglie
   di quotazioni, del calendario borsistico e del provider FX, con
   prova firmata da soggetto indipendente e **feed correnti realmente
   osservati**. La presenza di FRED/Alpha Vantage/EIA non attesta
   questo quorum di prezzi live.
4. Impostare una campagna privata con approvazione esatta e futura,
   validare `SELECT ... FOR UPDATE`, audit, kill switch e
   concorrenza **su PostgreSQL effettivo**. Collegare un runner
   protetto solo dopo tutti i controlli, non al browser pubblico.
5. Da quel momento osservare prospetticamente 30 giorni e
   raccogliere almeno 25 evidenze, 10 fill nuove senza backfill
   V6 né dati di test.

**Oggi i gate rimangono chiusi**: `approved=false`,
`expiresAt=null` nel manifesto precedente, nessuna connessione
DB configurata, nessun feed live certificato, `newPaperOrdersAllowed=false`,
`liveTradingAllowed=false`, fill PAPER Phase B = **0**.

È vietato dichiarare questa release `PAPER_ACTIVE` perché la
migrazione PostgreSQL non è stata eseguita su un server reale
né l'autorizzazione firmata su una baseline definitiva è disponibile.
