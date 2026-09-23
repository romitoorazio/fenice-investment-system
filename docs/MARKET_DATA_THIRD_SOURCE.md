# Terza famiglia execution market-data — valutazione controllata

Stato: **CANDIDATA, NON PROMOSSA NEL QUORUM PAPER ATTIVO**  
Data verifica: **2026-09-23**

## Perché non viene inserita subito

La campagna PAPER in corso usa un fingerprint immutabile del core trading/risk/market-data. Modificare ora adapter, policy di quorum o collector protetti renderebbe non equivalente l'evidenza successiva rispetto alla baseline iniziale.

Per questo la terza famiglia viene preparata fuori dal core e potrà essere integrata soltanto in una nuova baseline/campagna o con una procedura esplicita che non falsifichi la certificazione corrente.

## Candidato prioritario: Tiingo

Tiingo è il candidato zero-cost più interessante individuato per aumentare la ridondanza delle quotazioni US PAPER.

Verifica sulle fonti ufficiali Tiingo al 2026-09-23:

- piano Starter: **$0/mese** per uso individuale/interno;
- API: fino a **50 richieste/ora**, **1.000 richieste/giorno**, **1 GB/mese** e 500 simboli unici/mese sul piano Starter;
- IEX: prezzi real-time e API REST/WebSocket;
- dal 1 febbraio 2025 il full IEX TOPS richiede un accordo market-data con IEX;
- per chi non sottoscrive il full TOPS, Tiingo documenta un **derived real-time reference price** senza costo aggiuntivo IEX;
- la licenza Starter è dichiarata **Internal Use Only**: nessuna redistribuzione o condivisione del dato fuori dall'uso consentito.

Fonti ufficiali:

- https://www.tiingo.com/account/billing/pricing
- https://www.tiingo.com/products/iex-api
- https://www.tiingo.com/documentation/iex
- https://www.tiingo.com/documentation/websockets/iex

## Gate di accettazione Fenice

Tiingo non diventa una famiglia PAPER solo perché restituisce un prezzo. Prima della promozione devono essere dimostrati tutti questi punti:

1. **Indipendenza** — `sourceFamily=tiingo` distinta da Alpaca e Twelve Data e senza doppio conteggio della stessa risposta/provider.
2. **Entitlement/licenza** — uso compatibile con la finalità interna di Fenice; niente assunzione implicita di diritti sul full IEX TOPS.
3. **Provenance** — risposta riconducibile all'endpoint/autenticazione Tiingo e al tipo di feed richiesto.
4. **Freshness** — timestamp provider valido e dentro la soglia PAPER; mai usare il timestamp di ricezione locale come sostituto non dichiarato.
5. **Symbol identity** — ticker/strumento verificato contro instrument master; mismatch = fail closed.
6. **Prezzo valido** — positivo, finito e semanticamente coerente con il feed (reference price oppure bid/ask/last esplicitamente qualificato).
7. **Cross-source divergence** — confronto con almeno una seconda famiglia indipendente; divergenze oltre soglia degradano/bloccano.
8. **Rate-limit safety** — budget compatibile col tier gratuito, backoff su 429 e nessun retry storm.
9. **Determinismo testabile** — fixture/test che provano success, stale, bad symbol, malformed payload, auth/rate limit e divergence.
10. **Fail closed** — assenza chiave, entitlement ambiguo, timestamp mancante o provenienza non verificabile non devono mai produrre `PAPER`.
11. **No LIVE side effect** — l'adapter dati non può aprire connettività broker né inviare ordini.
12. **Nuova baseline esplicita** — la promozione nel quorum non deve retroattivamente alterare la campagna già iniziata.

## Piano d'integrazione dopo la campagna corrente

- aggiungere adapter Tiingo isolato;
- aggiungere `TIINGO_API_KEY` ai secrets/config solo quando il codice consumer esiste;
- usare inizialmente il derived reference price compatibile con il livello di entitlement disponibile;
- registrare `sourceFamily`, endpoint/feed, timestamp provider, provenance method ed eligibility;
- eseguire shadow validation senza contare Tiingo nel quorum;
- misurare freshness, disponibilità, divergence e rate-limit per almeno una finestra significativa;
- solo dopo i test, creare una nuova baseline fingerprint e portare il preferred quorum da 2/3 effettivi a 3/3 effettivi.

## Alternative esaminate

- **Alpha Vantage**: già presente come candidato, ma Fenice lo deve accettare in execution solo quando l'entitlement realtime è realmente disponibile; il codice attuale è correttamente fail-closed quando il provider segnala requisito premium/realtime.
- **Yahoo/Stooq**: utili per validazione/cross-check, ma non devono essere trasformati in famiglie PAPER finché provenance/entitlement realtime non sono provati.
- **provider collegati direttamente a un broker**: da trattare separatamente per evitare che l'aggiunta di market data allarghi implicitamente la superficie LIVE/broker.

## Decisione corrente

**Non modificare il quorum della campagna PAPER attiva.** Continuare con Alpaca + Twelve Data come minimo verificato, mantenere 3 famiglie come ridondanza professionale preferita e preparare Tiingo per la prossima baseline senza perdere l'evidenza già raccolta.
