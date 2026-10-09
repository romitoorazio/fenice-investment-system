# Fenice — piano autonomo verificabile (9 ottobre 2026)

## Missione
**Scoprire e valutare opportunità capaci di generare rendimento netto sostenibile e misurabile, limitando il rischio di perdita permanente.** Nessun rendimento è garantito. Fenice NON è pronto a muovere denaro reale e non si definisce il migliore al mondo senza benchmark oggettivi.

## Stato iniziale verificato
- Applicazione Next.js/TypeScript su Vercel, GitHub Actions, produzione READY alla verifica del 9 ottobre.
- Universo mondiale di riferimento: circa 202.622 simboli censiti, NON 202.622 feed real-time; pilota 28 strumenti e 19 attività nell'analisi tecnica.
- Campagna V6: 15/25 giornate di evidenza e 6/10 fill; 30 giorni solari obbligatori. `LIVE_TRADING_RELEASED=false`.
- Quorum execution PAPER archivio: 4/12 simboli idonei **al timestamp della prova**, scadenza 120 s; la disponibilità storica non è readiness ora.
- V7: risultati COMPRA 7d/30d insufficienti (campione 0); shadow promotion LOCKED.
- Directa: connettore dAPI localhost/read-only implementato; accesso effettivo al PC Darwin, posizioni e cash broker NON verificati dal cloud.
- AI: scoring, guardie di proposta e test presenti; modello conversazionale con fonti, strumenti di ricerca e memoria operativa NON attestato come integrato.
- Privacy e costi: `GET /api/trading/proposals?fresh=1` provoca refresh provider; protezione server-side e budget distribuito da verificare.

## Come si decide il lavoro da eseguire ogni ciclo
1. **P0 — Rischio e correttezza:** segreti, abuso endpoint, staleness, FX, autorizzazioni, freeze PAPER, blocco LIVE, audit/reconciliation. Se un nuovo cambiamento può violare un gate, fermare il merge.
2. **P1 — Verità sul rendimento:** misurazione P&L NETTO dopo costi, benchmark e controllo di overfitting, calibrazione del segnale, posizioni reali read-only.
3. **P2 — Prodotto e scala:** IA investigativa con citazioni, mercati globali per livelli, UI, osservabilità, persistenza e multiutente.
4. **P3 — Espansione solo se dimostrata:** nuovo broker, licenze dati premium, ordini live, nuove classi di strumenti. Occorrono evidenza, budget, autorizzazioni e policy dedicate.

## Backlog GitHub e definizione di completamento

| Priorità | Problema / attività | Ticket | Prova di completamento |
| --- | --- | --- | --- |
| P0 | Quote future nel risk engine; patch su nuova baseline senza invalidare V6 | [#214](https://github.com/romitoorazio/fenice-investment-system/issues/214) | regressione negativa + decisione di ricertificazione esplicita |
| P0 | Endpoint refresh provider, accesso server e limiti budget | [#215](https://github.com/romitoorazio/fenice-investment-system/issues/215) | test abuso, no spesa indesiderata, UI non rotta |
| P1 | Performance Center con P&L netto, benchmark e drawdown | [#216](https://github.com/romitoorazio/fenice-investment-system/issues/216) | risultati PAPER/shadow distinti, replay e costi verificati |
| P1 | Evidenze forward-only V7, decision outcomes e calibrazione | [#217](https://github.com/romitoorazio/fenice-investment-system/issues/217) | campioni maturi, gate statistico, no promozione prematura |
| P1 | Provenienza e quorum market data per simbolo | [#218](https://github.com/romitoorazio/fenice-investment-system/issues/218) | timestamp/fonti/licenze/valute e data cost verificati |
| P1 | Directa read-only: posizioni, cash, ordini e riconciliazione | [#219](https://github.com/romitoorazio/fenice-investment-system/issues/219) | connessione locale realmente attestata e audit senza write |
| P2 | AI investigativa con tool read-only, citazioni e misure | [#220](https://github.com/romitoorazio/fenice-investment-system/issues/220) | test grounded QA, prompt injection, no order authority |
| P2 | Persistenza transazionale, accessi e disaster recovery | [#221](https://github.com/romitoorazio/fenice-investment-system/issues/221) | DB, backup restore, RBAC, audit, failover verificati |
| P2 | Dashboard unificata Compra/Vendi e scanner mondiale a livelli | [#222](https://github.com/romitoorazio/fenice-investment-system/issues/222) | stati research/PAPER/broker verificati, no false LIVE claims |

## Autonomia consentita
- Analizzare codice, strumenti di mercato, dati pubblici, statistiche e sicurezza.
- Creare branch, PR, nuove evidenze DIAGNOSTICHE, documentazione e test.
- Eseguire CI, scanner segreti, test di regressione, confronti dati e controlli Vercel.
- Eseguire merge e controllare deployment **solo** per cambi a basso rischio, non-core, con CI interamente verde e invarianti LIVE/PAPER rispettate.
- Predisporre, senza attivare, nuove integrazioni ed esperimenti shadow con costo nullo.

## Attività che non vanno svolte automaticamente
- **Nessun ordine LIVE, trasferimento denaro, sblocco broker, connessione remota a Darwin senza accesso autorizzato**, né custodia/lettura/rotazione segreti in chat.
- Nessun servizio a pagamento o incremento quota spend senza consenso esplicito.
- Nessun reset o modifica della campagna V6, del relativo fingerprint/core o della politica release senza revisione e autorizzazione: i difetti del core vanno isolati su branch in attesa della baseline successiva.
- Nessuna promozione di risultati non maturati, falsi fill PAPER o attribuzione di qualità esecutiva a prezzi EOD.
- Mai convertire un “Sì” di prova in un ordine reale.

## Ciclo autonomo quotidiano
1. Recuperare commit MAIN e ultimi deployment, CI, PR/issue bloccanti e fonti dati.
2. Controllare i gate P0 e lo stato quotidiano della campagna PAPER (non alterare evidenze).
3. Identificare un singolo passo misurabile; creare test contro il difetto prima della correzione quando fattibile.
4. Implementare in branch isolato, mantenendo `LIVE_TRADING_RELEASED=false`; evitare codice core congelato.
5. CI + TypeScript/build + test difetti + audit diff e segreti; se RED lasciare PR aperta e correggere, non integrare.
6. Con CI GREEN e nessuna barriera safety, integrare e verificare Vercel READY. Controllare nuovi errori runtime.
7. Aggiornare ticket e riferire **fatti**, SHA, PR, deployment, test e successivo blocker; niente promesse di profitti.

L'esecuzione quotidiana richiede che l'automazione ChatGPT e le connessioni GitHub/Vercel siano disponibili ai relativi run; non è un agente perennemente in esecuzione. Le pipeline GitHub possono elaborare dati in modo indipendente secondo i loro trigger.

## KPI di successo

### Sicurezza e affidabilità
- 0 operazioni LIVE non autorizzate; 0 segreti esposti; 0 ordini doppi; 0 quote stale/future promosse; 0 audit/reconciliation break irrisolti.
- CI e build verde sul commit pubblicato, backup e replay riconciliabili.

### Trading e rendimento
- P&L netto di fees, slippage, spread e FX, non solo accuracy o score.
- Risultato PAPER/SHADOW distinto dal reale; benchmark coerente per volatilità, indice/ETF, valuta, orizzonte e rischio.
- Sharpe/Sortino, max drawdown, turnover, profit factor e campioni effettivi con intervalli d'incertezza; no prove retrodatate o data leakage.
- Candidati BUY valutati forward-only, minimi quantitativi e policy di promozione rispettati; se l'edge non esiste, saper dire ATTENDI.
- Per ogni titolo: fonte, osservazione timestamp, classe, MIC, valuta, catalizzatori, invalidazione, costo e motivazione della raccomandazione.

### Esperienza d'uso
- Un solo cruscotto giornaliero Compra / Mantieni / Evita / Attendi con motivazione AI basata su evidenze e stato broker verificato.
- Nessuna promessa di guadagno, nessun “BUY” eseguibile quando mancano posizione/cash/dati/risk gate.

## Checkpoint e dipendenze
- **Milestone A:** P0 mitigati in modo compatibile con la campagna V6. Evitare qualsiasi invalidazione non necessaria.
- **Milestone B:** Performance Center e outcome tracking reddituale riproducibile.
- **Milestone C:** Dati per simbolo, portafoglio read-only e validazione V7.
- **Milestone D:** AI investigativa con prova di grounding e cost budget; UI consolidata.
- **Milestone E:** Persistenza professionale, multiutenza e stress/recovery; confronto su KPI oggettivi.
- **Milestone F:** Pilot reale **solo eventualmente**, dopo campagna maturata, broker testato, risultati robusti e consenso per una release distinta.

## Regola di governo
Per ogni nuova proposta domandare: **migliora il rendimento netto atteso dimostrabile, la misura del rendimento o riduce una perdita/errore operativo?** Se la risposta non è verificabile, deferire.
