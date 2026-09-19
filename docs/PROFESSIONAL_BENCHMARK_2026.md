# Fenice Professional Benchmark 2026

Obiettivo: trasformare Fenice da motore di analisi a piattaforma di decisione e gestione ordini con disciplina da OMS/EMS professionale, senza copiare software proprietario e senza aprire il trading reale prima della certificazione.

## Riferimenti studiati

- Interactive Brokers TWS/Web API: order status, executions, partial fills, host/client IDs, callbacks e monitoring.
- Trading Technologies: pre-trade risk, price reasonability, working orders/fills/positions, limit history e audit trail persistente.
- FlexTrade / FlexTCA: cattura dell'intero trade lifecycle e analisi pre-trade, real-time e post-trade con implementation shortfall e reporting best execution.
- Saxo OpenAPI: streaming di ordini, posizioni, saldi e quote con heartbeat e subscription model.
- FINRA Regulatory Notice 15-09: change management, test indipendenti, pilot deployment, rapid disable, monitoring, reconciliation, incident tracking e capacity controls.
- SEC Market Access / Regulation SCI principles: controlli finanziari e regolamentari, resilienza, disponibilità, sicurezza, record keeping e business continuity.
- NIST SP 800-160 Vol. 2 e SP 800-92: cyber-resilience, recovery e log management.

## Cosa deve avere Fenice prima del capitale reale

### 1. Data plane
- fonti indipendenti per prezzi e macro;
- stale-data detection;
- source concentration cap;
- divergence detection;
- broker-native data separata dai dati di ricerca;
- quote freshness specifica per execution.

### 2. OMS
- client order ID idempotente;
- broker order ID e execution ID separati;
- lifecycle CREATED → ACCEPTED → PARTIAL/FILLED/CANCELLED/REPLACED;
- partial fill nativi;
- cancel/replace;
- persistence transazionale;
- deterministic recovery dopo restart.

### 3. Pre-trade risk
- max order notional;
- max position weight;
- max gross/net exposure;
- max daily turnover;
- max open orders;
- short-selling lock di default;
- buying-power check;
- fat-finger quantity check;
- price collars / price reasonability;
- stale quote lock;
- market/session/holiday controls;
- per-symbol, per-sector e portfolio exposure caps;
- future self-trade / duplicate-order prevention.

### 4. Execution safety
- compile-time live lock;
- human confirmation non bypassabile;
- broker-independent kill switch;
- manual reset dopo lockdown;
- outbound message/rate limit;
- timeout/retry policy che non duplichi ordini;
- no automatic retry di un ordine con esito ambiguo;
- shadow execution prima del live.

### 5. Broker adapter Directa
- localhost only;
- read-only first;
- heartbeat/watchdog;
- session loss detection;
- account/liquidity/positions/orders snapshot;
- broker reference persistence senza segreti;
- reconciliation Directa ↔ Fenice;
- nessun write command nella fase read-only.

### 6. Reconciliation
Ogni ciclo deve verificare almeno:

```
opening position + executions = broker position
cash start - buys + sells - fees = broker cash
Fenice open orders = broker open orders
Fenice executions = broker executions
```

Un break non risolto deve bloccare il ciclo successivo.

### 7. Audit e incident management
- append-only/tamper-evident event log;
- ordine completo di eventi;
- input risk decision + output;
- dati usati per la decisione;
- order intent, broker ack, partial fills, final fill;
- disconnect/reconnect;
- kill-switch events;
- incident record e remediation;
- log redaction per account/secret.

### 8. TCA
Minimo:
- arrival price;
- fill VWAP;
- slippage bps;
- fees;
- implementation shortfall;
- decision-to-order delay;
- order-to-ack latency;
- ack-to-fill latency;
- benchmark per broker/venue/strategy quando disponibile.

### 9. Resilience
Test obbligatori:
- Darwin chiuso;
- Darwin riavviato;
- socket interrotto;
- heartbeat perso;
- risposta parziale;
- timeout dopo order intent;
- processo Fenice crash/restart;
- audit corrotto;
- broker snapshot stale;
- dati prezzi divergenti;
- file state incompleto;
- duplicate client order ID;
- fill ricevuto due volte;
- fill ricevuto dopo cancel request.

### 10. Release ladder

1. ANALYSIS
2. PAPER OMS
3. DIRECTA READ-ONLY
4. SHADOW EXECUTION
5. LIMITED PILOT WITH HUMAN CONFIRMATION
6. LIVE — solo dopo nuova revisione e apertura esplicita del compile-time lock

Nessun livello può essere saltato.

## Gate quantitativi minimi prima di proporre il live

- tutti i critical control dell'Institutional Readiness Matrix = PASS;
- zero reconciliation break irrisolti;
- zero audit integrity failure;
- paper checkpoint reali a 30 giorni maturati, non simulati;
- shadow execution prolungata senza duplicazioni o mismatch;
- recovery test PASS;
- stale/disconnect tests PASS;
- data confidence e cross-source validation sopra le soglie Fenice;
- broker read-only testato realmente con Darwin;
- live lock ancora chiuso fino a PR separata.

## Regola di prodotto

Fenice non deve essere giudicata dalla quantità di schermate o indicatori. Deve essere giudicata dalla capacità di rispondere correttamente a quattro domande:

1. Perché vuole fare questa operazione?
2. Con quali dati e quanto sono affidabili?
3. Quali controlli possono impedirla?
4. Se qualcosa va storto, possiamo ricostruire esattamente cosa è successo e tornare in uno stato coerente?

Se una di queste quattro risposte non è verificabile, il capitale reale resta bloccato.
