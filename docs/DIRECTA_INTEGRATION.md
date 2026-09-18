# Directa ↔ Fenice — integrazione protetta

Stato: **PREPARATA, NON COLLEGATA, TRADING REALE BLOCCATO**.

## Obiettivo

Fenice deve riconoscere Directa come broker e predisporre un adapter verificabile senza creare un percorso accidentale verso ordini reali.

La distinzione è obbligatoria:

- **broker riconosciuto** ≠ broker connesso;
- **broker connesso** ≠ trading live autorizzato;
- **tutti i gate PASS** ≠ rilascio live automatico.

Il live richiederà in futuro sia la certificazione completa sia una modifica di codice esplicita e revisionata del release lock.

## Stato implementato

- `lib/brokers/registry.ts` riconosce Directa e le principali forme del nome;
- `lib/brokers/directa.ts` espone solo lo stato e il piano di connessione;
- nessun endpoint Directa è codificato;
- nessun meccanismo di autenticazione è ipotizzato;
- nessuna credenziale Directa è richiesta o salvata;
- la connessione di rete genera sempre `DIRECTA_CONNECTION_BLOCKED`;
- l'invio ordini genera sempre `FENICE_LIVE_TRADING_LOCKED`;
- `lib/brokers/safety.ts` contiene un release lock compilato nel codice e impostato a `false`;
- `/api/broker/status` permette di verificare riconoscimento e stato senza esporre segreti;
- la CI esegue `npm run broker:safety`.

## Informazioni Directa verificate

Fonti ufficiali:

- https://www.directa.it/help-supporto/piattaforme/api
- https://www.directa.it/conto-directa/piattaforme/darwin/trading-api

Directa dichiara API Darwin per integrazione di software esterno. L'accesso è soggetto ad abilitazione e la documentazione tecnica è resa disponibile al programmatore tramite la documentazione/wiki prevista dal servizio. Directa dichiara inoltre che non fornisce un conto prova API pubblico: per usare le API occorre un regolare conto Directa abilitato.

Per questo Fenice non deve inventare URL, porte, protocollo, campi di autenticazione o messaggi ordine basandosi su esempi non ufficiali.

## Configurazione non sensibile

`.env.example` contiene esclusivamente flag di stato:

```text
FENICE_BROKER=directa
FENICE_DIRECTA_MODE=paper
DIRECTA_API_ACCESS_APPROVED=false
DIRECTA_API_CONTRACT_VERIFIED=false
```

Questi flag **non possono aprire il live trading**. Non aggiungere a Git numero conto, password, token, PIN, sessioni o altri segreti.

## Gate prima del collegamento di rete

Prima di implementare anche una connessione read-only devono essere completati e revisionati almeno questi punti:

1. abilitazione API Directa effettivamente confermata sul conto;
2. documentazione tecnica ufficiale Directa acquisita e verificata;
3. protocollo, autenticazione, limiti e gestione sessione mappati senza supposizioni;
4. modello delle capability separato tra dati, stato conto e ordini;
5. trasporto read-only isolato e testato senza funzioni ordine;
6. gestione timeout, retry limitati, idempotenza e audit log;
7. nessun segreto in repository, log, errori o risposte API;
8. revisione dei termini Directa per software di terze parti.

## Gate prima del trading reale

Oltre ai punti precedenti, **tutti** i gate prodotti da `scripts/check-certification-readiness.mjs` devono essere certificati `PASS`:

- `criticalSources`;
- `sourceReportFreshness`;
- `dataQuality`;
- `crossSourceValidation`;
- `systemTests`;
- `riskControls`;
- `paperMode`;
- `liveTradingLocked`.

In più devono esistere una revisione esplicita dell'architettura di esecuzione, conferma umana obbligatoria, limiti di controvalore/posizione, kill switch, idempotenza ordini, riconciliazione ordini-eseguiti-posizioni e test di failure/recovery.

Solo dopo questa certificazione potrà essere proposta una PR separata per valutare l'apertura del release lock. Questa PR **non** abilita e non prepara automaticamente quell'apertura.
