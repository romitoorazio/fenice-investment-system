# FENICE100K — Implementazione della prossima fase PAPER V7 (26 ottobre 2026)

**Stato: infrastruttura di collaudo pronta; CAMPAGNA OPERATIVA NON AUTORIZZATA.**

**Conferma successiva dell’utente (26 ottobre 2026):** capitale iniziale di **10.000 EUR esclusivamente virtuali**; limiti invariati di massimo **300 EUR per ordine**, **3% del capitale**, **1 tentativo/giorno UTC** e **20 tentativi totali**. La conferma è registrata in `data/paper-v7-phase-b-preparation.json` come istruzione economica alla **preparazione**, non come firma o approvazione operativa. L’importo è incluso nei controlli numerici e nell’hash della policy destinata a un’eventuale futura autorizzazione firmata; una modifica non autorizzata viene rifiutata.


Con il consenso dato dall'utente alla preparazione della Phase B sono stati
aggiunti strumenti isolati che non interagiscono con broker, segreti o V6.

## Componenti verificabili

| Componente | Funzione | Confine rigoroso |
| --- | --- | --- |
| `lib/trading/paper-v7-phase-b-fixture-ledger.mjs` | Seed 10.000 EUR virtuali; replay deterministico di BUY simulati e rifiuti con catena SHA-256; fee 0,15% min 1 EUR e price impact 5 bps | Solo `V7_PHASE_B_TEST_FIXTURE_ONLY`; niente scrittura, ordini, fill certificabili |
| `scripts/test-paper-v7-phase-b-fixture-ledger.mjs` | Test 3% (~300 EUR iniziali), 15% asset, importi 250–300, 1 UTC/day, max 20 tentativi, saldo/quote falsificati, replay, timestamp futuri/impossibili | I fill fixture **non** si conteggiano come prove future |
| `lib/trading/paper-v7-phase-b-authorization.mjs` | Verifica teorica di firma Ed25519 vincolata a SHA, digest, policy, 30 giorni minimo, date e scadenza esatta | Non comprende né installa una firma, chiave privata, chiave di verifica attendibile o permesso operativo |
| `scripts/test-paper-v7-phase-b-authorization.mjs` | Chiavi di test generate durante CI, mai persistite; casi contro falsificazione, scadenza, rilassamento limiti, LIVE | Validità della firma di test non attribuisce identità o approvazione reale |
| `scripts/check-paper-v7-phase-b-readiness.mjs` | Consolida snapshot V6, fingerprint, proposta, readiness V7 con zero market quote privilegiati, e prova dell'assenza di nuova autorizzazione | Zero esecuzione e zero accesso a segreti |
| Workflow `paper-v7-phase-b-isolated-safety.yml` | Esegue i test e la scansione segreti sul codice corrente | `contents:read`, nessuna scrittura di stato o ordini |

## Chiarimento importante sul capitale

La V6 aveva un proprio perimetro e conservava sette fill storici.
Il motore WORLD PAPER V7 preesistente parte invece da un seed di 1.000 EUR
virtuali e da un cap posizione 5%. Non sarebbe corretto presentarlo come
conforme ai nuovi 300 EUR al 3%. Il **nuovo** ledger fixture è separato,
parte da **10.000 EUR virtuali** ed è adatto a collaudare la matematica
dei nuovi limiti, ma NON è un nuovo conto e NON modifica il WORLD engine
né introduce automaticamente un ledger di produzione.

Il suo replay su hash protegge da alterazioni accidentali e incoerenze
economiche, ma un hash autoprodotto non dimostra da solo l'origine
autentica delle quotazioni né la reale esecuzione. Il journal futuro
necessita quindi di attestazione esterna, lock atomico contro esecuzioni
simultanee, custodia durevole, prova della fonte e conferma proprietario.

## Quanto manca all'avvio della raccolta di nuovi fill PAPER

1. **Baseline finale** su codice V7 di esecuzione isolato, con SHA e
   digest nuovi, blocco temporale PR #224 valutato solo nella nuova fase;
   non alterare `lib/trading/risk-engine.ts` o
   `lib/trading/market-session.ts` durante la V6 congelata.
2. **Autorizzazione operativa distinta**: ID, SHA/digest definitivi,
   firma del proprietario con identità verificata e una **scadenza futura
   esatta**, chiave pubblica dell'operatore ancorata indipendentemente
   e conservata tramite un processo protetto. Questa release non
   inventa né firma credenziali, ID o date operative.
3. **Dati di execution ammissibili**: diritti d'uso provati da fonte
   indipendente, almeno due provider di quotazioni indipendenti,
   mercato davvero OPEN, quote e FX freschi e coerenti. Un report
   generico di source health GREEN non basta. Nessun feed a pagamento
   richiesto come prerequisito.
4. **Percorso autorizzato di scrittura**: collegare l'approval verificata,
   il rischio e il quorum al journal Phase B persistito in modo atomico,
   con idempotenza, kill switch, 1 tentativo/giorno, max 20 tentativi,
   replay/riconciliazione e **nessun accesso broker**. Questo componente
   non viene oggi avviato perché (2) e (3) non sono attestati.
5. Solo dopo (1)–(4) avviare la **nuova** campagna prospettica da zero:
   min 30 giorni, min 25 giorni validi, min 10 fill nuovi autentici.
   I sette fill V6 non si trasferiscono. Qualunque risultato economico
   deve essere distinto dal segnale SHADOW e dalle prove di execution.

L'utente ha chiesto di **non cambiare le chiavi correnti**:
questa modifica non le legge, ruota, conserva o copia. L'issue #26
sulla possibile esposizione storica resta un controllo separato aperto.

### Comandi riproducibili

```bash
node scripts/test-paper-v7-phase-b-fixture-ledger.mjs
node scripts/test-paper-v7-phase-b-authorization.mjs
node scripts/check-paper-v7-phase-b-readiness.mjs
```

**Esito atteso oggi:** `PHASE_B_BLOCKED_AWAITING_EXTERNAL_APPROVAL_AND_EXECUTION_EVIDENCE`;
`genuinePhaseBFills=0`, `canRunNewPaperProbes=false`,
`brokerConnectivityAllowed=false`, `liveTradingAllowed=false`.
Questo è un esito corretto, non un fallimento della pipeline.
