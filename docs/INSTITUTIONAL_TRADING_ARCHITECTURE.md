# Fenice Institutional Trading Architecture

Stato: **OPERATIVO IN PAPER MODE / LIVE BLOCCATO**.

Fenice non deve imitare l'interfaccia di un broker. Deve separare analisi, decisione, rischio, order management, execution, riconciliazione e audit come un sistema professionale.

## Principi

1. Fail closed: qualunque dato mancante, vecchio, divergente o non certificato blocca l'esecuzione.
2. Idempotenza: lo stesso `clientOrderId` non può produrre due esecuzioni.
3. Pre-trade risk indipendente dal motore di segnali.
4. Kill switch indipendente dal broker.
5. Riconciliazione dopo ogni ciclo operativo.
6. Audit append-only verificabile tramite hash chain.
7. Nessuna variabile ambiente può aprire il live trading.
8. Directa è un adapter; il dominio ordini Fenice resta broker-agnostic.

## Pipeline

```text
Market/Data Intelligence
        |
Investment Committee
        |
Human Confirmation
        |
Pre-Trade Risk Engine
        |
Kill Switch Gate
        |
Paper OMS Runner
        |
Simulated Fill + Fees + Slippage
        |
Transaction Cost Analysis
        |
Position Reconciliation
        |
Tamper-Evident Audit Chain
```

Il futuro adapter Directa si inserirà esclusivamente dopo il risk gate e prima della riconciliazione, senza cambiare il dominio interno degli ordini.

## Controlli pre-trade implementati

- modalità PAPER obbligatoria;
- conferma umana obbligatoria;
- live release lock chiuso;
- rete broker disabilitata;
- kill switch non attivo;
- capitale e dimensioni ordine validi;
- blocco short selling accidentale;
- massimo controvalore singolo ordine;
- massimo peso singolo asset;
- massimo gross exposure;
- massimo turnover giornaliero;
- massimo numero ordini aperti;
- soglia minima di data confidence;
- minimo numero fonti indipendenti;
- massimo risk score;
- quote freshness;
- blocco in presenza di divergenza dati;
- blocco in presenza di fonti stale;
- validazione prezzo limite.

## Kill switch

Il kill switch si attiva se almeno una condizione critica è presente:

- attivazione manuale;
- corruzione della audit chain;
- break di riconciliazione irrisolto;
- troppi errori consecutivi di esecuzione;
- fonte critica stale/failed;
- perdita giornaliera oltre soglia;
- data confidence sotto soglia.

Il kill switch non deve mai essere aggirato dal broker adapter.

## OMS paper

Il Paper OMS fornisce:

- client order ID;
- idempotenza;
- MARKET e LIMIT;
- DAY e GTC come dominio ordine;
- risk rejection prima del fill;
- slippage configurabile;
- commissioni simulate;
- fill deterministico e ripetibile nei test;
- coda persistente `data/paper-order-queue.json`;
- stato persistente `data/paper-oms-state.json`;
- runner `npm run paper:run`.

Il runner non effettua chiamate di rete e non inventa FX, prezzi o fonti mancanti. Gli ordini non arricchibili correttamente restano nella coda.

## Transaction Cost Analysis

Fenice calcola già sul paper:

- gross notional;
- commissioni simulate;
- slippage in euro;
- slippage ponderato in basis point;
- implementation shortfall.

La fase successiva estenderà la TCA con benchmark arrival/VWAP quando saranno disponibili dati intraday sufficientemente affidabili.

## Riconciliazione

Dopo ogni ciclo il motore confronta:

```text
posizione iniziale + fill attesi = posizione risultante
```

Qualunque differenza crea un reconciliation break e deve attivare il kill switch prima di un ciclo successivo.

## Audit chain

Gli eventi operativi vengono concatenati con SHA-256 includendo:

- sequenza;
- timestamp;
- tipo evento;
- entity/order ID;
- payload canonico;
- hash precedente.

La modifica retroattiva di un evento rende la catena non valida e attiva il kill switch.

## Benchmark professionale

L'architettura segue i principi normalmente richiesti nel trading elettronico professionale: controlli pre-trade, record keeping degli ordini, gestione degli stati, execution monitoring, TCA, resilienza, riconciliazione e trasparenza lungo il trade lifecycle.

Riferimenti pubblici:

- FIX Trading Community — Guidelines e Recommended Practices: https://www.fixtrading.org/guidelines/
- FIX Trading Community — MiFID II/MiFIR: https://fixtrading.org/who-we-are/mifid-ii-mifir/
- Interactive Brokers API documentation — order/execution lifecycle: https://www.interactivebrokers.com/docs
- Directa API: https://www.directa.it/help-supporto/piattaforme/api

## Livelli operativi Fenice

### Livello 1 — Analysis
Attivo. Nessun ordine.

### Livello 2 — Paper OMS
Attivo su questo ramo. Coda ordini, risk engine, fees/slippage, TCA, reconciliation e audit.

### Livello 3 — Broker Read-Only
Non ancora attivo. Richiede documentazione tecnica ufficiale Directa e abilitazione del conto. Deve consentire solamente sessione, account state, posizioni ed eventualmente dati consentiti.

### Livello 4 — Broker Shadow Execution
Non attivo. Prima di qualsiasi ordine reale, Fenice dovrà generare l'ordine che *avrebbe* inviato e confrontarlo con lo stato reale del broker senza trasmetterlo.

### Livello 5 — Human-Confirmed Live
NON AUTORIZZATO. Potrà essere valutato solo dopo tutti i gate certificati PASS, test di recovery, idempotenza end-to-end, riconciliazione broker, kill switch verificato e revisione separata del release lock.

## Funzioni ancora necessarie prima di poter competere con sistemi professionali completi

- adapter Directa read-only certificato sulla documentazione ufficiale;
- account/position reconciliation contro broker reale;
- persistent order store transazionale esterno al repository;
- recovery dopo crash/restart;
- partial fills e cancel/replace;
- market calendar e session rules;
- currency exposure e FX conversion certificata;
- benchmark arrival/VWAP intraday;
- alerting operativo e incident log;
- chaos/failure tests;
- shadow execution prolungata;
- policy di backup e disaster recovery.

Questi punti sono requisiti di qualità, non motivi per abbassare i gate esistenti.
