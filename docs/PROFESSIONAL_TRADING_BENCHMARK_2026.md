# Fenice — benchmark piattaforme professionali (2026)

## Obiettivo

Fenice non deve imitare graficamente piattaforme commerciali né copiare codice proprietario. Deve invece raggiungere capacità misurabili di livello professionale: qualità dati, gestione ordini, rischio, resilienza, riconciliazione, audit e controllo umano.

Riferimenti pubblici usati come benchmark:

- Interactive Brokers TWS/API — order lifecycle, execution details, partial fills, callback/error monitoring;
- Trading Technologies — pre-trade risk, buying power, audit trail persistente, surveillance;
- Bloomberg AIM/EMSX — OMS/EMS front-to-back, compliance, reconciliation, post-trade;
- FlexTrade FlexTRADER/FlexTCA — broker-neutral EMS, TCA, workflow automation, feedback loop;
- Saxo OpenAPI — streaming WebSocket di quotes, orders, positions e balances, heartbeat e position netting.

## Matrice capacità

| Capacità | Standard professionale | Fenice oggi | Target prima del live |
| --- | --- | --- | --- |
| Identità ordine | client ID + broker ID + execution ID persistenti | clientOrderId paper + riferimento Directa leggibile | triple-ID immutabile e mapping persistente |
| Lifecycle | NEW/ACK/PARTIAL/FILLED/CANCEL/REPLACE/REJECT | presente in Paper OMS | mapping bidirezionale completo Directa ↔ Fenice |
| Partial fill | ogni fill contabilizzato separatamente | simulato in paper; Directa PRICEEXE parsato | execution ledger broker-native |
| Pre-trade risk | size, position, credit, buying power, price collars, message limits | size/exposure/turnover/data/risk gate | buying power, fat-finger collar, message rate, self-match prevention |
| Kill switch | blocco immediato, indipendente dal broker | presente in Paper OMS | collegato anche a sessione/riconciliazione Directa |
| Streaming | eventi push + heartbeat + gap detection | snapshot read-only Directa | daemon locale event-driven con heartbeat/watchdog |
| Recovery | reconnect + state rebuild + deduplica | parziale | crash/restart recovery con replay eventi |
| Reconciliation | orders/fills/positions/cash vs broker | interna paper | Directa orders/fills/positions/cash come fonte esterna di verifica |
| Audit | append-only, persistente, interrogabile | SHA-256 tamper-evident paper | event store persistente, export e retention |
| TCA | arrival/VWAP/slippage/fees, broker/venue analytics | slippage/fee/implementation shortfall base | arrival/VWAP e shadow-vs-broker benchmark |
| Compliance | pre/post trade policy, approvals, records | conferma umana + live lock | policy engine esplicito e reason codes |
| Market data | più fonti + execution-grade/broker-native | fonti pubbliche e cross-validation | broker-native/licenziata separata dalla validazione pubblica |
| Paper/shadow | simulazione realistica, nessun send | paper presente | shadow Directa: ordine completo senza trasmissione |
| Session calendar | aperture, aste, half-day, timezone | incompleto | calendario exchange e session guard |
| Corporate actions | split/dividendi/merger/symbol changes | incompleto | normalizzazione posizioni/prezzi e audit |

## Principi non negoziabili

1. **Fail closed**: se manca un dato essenziale, l'ordine non viene preparato/inviato.
2. **No threshold gaming**: aggiungere fonti non deve alzare automaticamente la fiducia; conta indipendenza, freschezza e qualità.
3. **Dati pubblici != execution-grade**: Yahoo, Stooq, CoinGecko, Coinbase/Kraken pubblici sono validazione, non autorizzazione al live.
4. **Broker-native before live**: saldo, buying power, ordini, fill, posizioni e stato sessione devono essere riconciliati con Directa.
5. **Human in the loop**: la conferma umana resta obbligatoria finché non viene deliberatamente rivista in una futura governance separata.
6. **Live lock compiled closed**: nessun flag ambiente deve poter trasformare da solo un sistema paper/shadow in live.
7. **Idempotenza**: ogni intent ha un identificatore unico e non può creare due ordini per retry/reconnect.
8. **Audit before action**: decisione, dati, limiti, approvazione e messaggio broker devono poter essere ricostruiti.

## Gate di fiducia prima di capitale reale

Fenice non verrà definita pronta per capitale reale sulla base di una singola CI verde. Servono contemporaneamente:

- fonti critiche sane e report freschi;
- intelligence confidence >= 90 senza abbassare le soglie;
- concentrazione delle fonti prezzo <= 50%;
- public exchange validation >= 90, almeno 3 fonti e almeno 4 strumenti, zero divergenze >2%;
- dati broker-native/execution-grade verificati;
- almeno 10 checkpoint paper reali a 30 giorni;
- Directa read-only stabile su più sessioni;
- shadow execution con campione significativo e zero mismatch inspiegati;
- test di disconnect/reconnect, crash/restart, duplicate event, stale quote e partial fill;
- fat-finger / price-collar / buying-power / order-rate controls;
- riconciliazione cash + orders + fills + positions senza differenze;
- kill-switch drill riuscito;
- audit chain/event store integro;
- secret scan e revisione sicurezza;
- conferma umana obbligatoria;
- `LIVE_TRADING_RELEASED=false` fino a una PR separata e revisionata.

## Roadmap immediata

### P0 — affidabilità e verità dello stato

- Directa mostrata correttamente come broker selezionato;
- produzione Vercel sincronizzata con main;
- fonte dati e timestamp sempre visibili;
- nessun badge “pronto” derivato solo da quantità di fonti.

### P1 — Directa shadow bridge

- persistent event journal;
- heartbeat/watchdog;
- session state machine;
- reconciliation account/cash/positions/orders;
- mapping clientOrderId ↔ Directa reference ↔ execution event;
- shadow intents senza write command.

### P2 — risk parity con desk professionali

- buying power pre-check;
- max order notional e max daily turnover;
- dynamic price collars;
- duplicate/order-rate protection;
- self-match prevention;
- stale quote clock;
- market/session calendar;
- controlled cancel/replace state machine.

### P3 — execution quality

- TCA arrival price/VWAP;
- shadow slippage;
- expected fee model vs broker fee;
- fill ratio e latency statistics;
- exception dashboard;
- broker reconciliation SLA.

### P4 — operatività reale solo dopo certificazione

Nessun ordine reale prima che tutti i gate sopra siano PASS e il release lock venga modificato tramite revisione separata.
