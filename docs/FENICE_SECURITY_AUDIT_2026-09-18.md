# Fenice — audit sicurezza e readiness

Data audit: 2026-09-18

Stato complessivo: **NOT_READY PER TRADING REALE**.

Questo documento fotografa lo stato verificato dalla CI della PR Directa. Non costituisce un'autorizzazione al trading e non deve essere usato per bypassare i gate automatici.

## Gate certificazione

Risultato di `node scripts/check-certification-readiness.mjs` sulla PR:

| Gate | Stato | Evidenza sintetica |
| --- | --- | --- |
| criticalSources | PASS | 9/9 fonti critiche ready |
| sourceReportFreshness | PASS | report fonti recente |
| dataQuality | NOT_READY | confidence 85 < 90; concentrazione fonte 51% > 50% |
| crossSourceValidation | PASS | 22 cross-check; 0 divergenti |
| systemTests | PASS | 19 asset terminal; 12 società research; strutture valide |
| riskControls | PASS | guardrail numerici e blocchi obbligatori presenti |
| paperMode | NOT_VALIDATED | 2299 record marcati; 1520 checkpoint 7d; 0 checkpoint 30d |
| liveTradingLocked | PASS | ordini e collegamento broker vietati; conferma umana obbligatoria |

Metriche CI osservate:

- `criticalReady`: 9 / 9;
- `intelligenceConfidence`: 85;
- `crossChecks`: 22;
- `crossDivergent`: 0;
- `marketSources`: 3;
- `assetClasses`: 5;
- `sourceConcentrationPercent`: 51;
- `terminalAssets`: 19;
- `researchCompanies`: 12;
- `paperRecords`: 2299;
- `markedPaperRecords`: 2299;
- `checkpoint7d`: 1520;
- `checkpoint30d`: 0;
- `paperDecisionClasses`: 3.

## Perché la CI è verde ma Fenice è NOT_READY

La CI deve fallire immediatamente se vengono rimossi i guardrail di sicurezza obbligatori o se il codice non compila/testa. Il comando di readiness, invece, può completarsi correttamente restituendo `NOT_READY`: questo permette di osservare la maturazione dei gate senza trasformare un gate incompleto in un errore tecnico.

Quindi:

- **CI verde** = software e invarianti di sicurezza verificati;
- **readiness READY** = tutti i gate di certificazione soddisfatti;
- oggi la prima condizione è vera, la seconda no.

## Blocco paper mode

Il gate richiede almeno:

- 100 record paper;
- 75 record marcati;
- 30 checkpoint a 7 giorni;
- 10 checkpoint a 30 giorni;
- 3 classi decisionali;
- nessuna evidenza di esecuzione live/broker.

Fenice supera ampiamente i requisiti quantitativi già maturati, tranne i checkpoint a 30 giorni: oggi sono `0`. Questo requisito **non deve essere simulato o retrodatato**. Deve essere soddisfatto da osservazioni reali maturate nel tempo.

## Blocco data quality

Il gate richiede contemporaneamente:

- intelligence confidence >= 90;
- concentrazione massima di una fonte <= 50%;
- almeno 3 fonti mercato;
- almeno 3 asset class;
- cross validation valida.

Stato attuale:

- confidence: `85` -> insufficiente;
- concentrazione: `51%` -> insufficiente di 1 punto;
- fonti mercato: `3` -> requisito raggiunto;
- asset class: `5` -> requisito raggiunto;
- cross validation: `22` controlli, `0` divergenti -> requisito raggiunto.

La correzione deve migliorare realmente qualità e diversificazione delle fonti. Non modificare le soglie per ottenere artificialmente `PASS`.

## Directa

Stato implementazione PR:

- broker riconosciuto: **SÌ**;
- adapter dedicato: **SÌ**;
- endpoint stato non sensibile: **SÌ**;
- connessione di rete Directa: **NO, BLOCCATA**;
- invio ordini: **NO, NON IMPLEMENTATO E BLOCCATO**;
- trading reale: **NO**;
- hard release lock: `LIVE_TRADING_RELEASED = false`.

Directa documenta pubblicamente le API Darwin per integrazione di software esterni, ma richiede un regolare conto Directa, l'abilitazione al servizio e l'accettazione delle regole; non offre un conto prova API pubblico. La documentazione tecnica dettagliata è resa disponibile al programmatore tramite il servizio/wiki Directa dopo l'abilitazione.

Fonti ufficiali verificate:

- https://www.directa.it/help-supporto/piattaforme/api
- https://www.directa.it/help-supporto/piattaforme/i-servizi-di-visual-trader

Perciò Fenice non contiene endpoint, protocollo o autenticazione Directa inventati.

## Sequenza sicura per il prossimo sviluppo

1. Migliorare la qualità reale delle fonti finché `dataQuality` passa senza abbassare le soglie.
2. Continuare la raccolta paper finché maturano almeno 10 checkpoint reali a 30 giorni.
3. Confermare sul conto Directa l'abilitazione API e acquisire la documentazione tecnica ufficiale.
4. Implementare in una PR separata **solo** discovery/sessione e capability read-only, se compatibile con la governance aggiornata.
5. Testare timeout, retry, rate limit, riconciliazione e isolamento segreti senza funzioni d'ordine.
6. Aggiungere un vero kill switch di esecuzione e idempotenza ordine prima di qualsiasi futura implementazione write-capable.
7. Solo dopo tutti i gate `PASS`, aprire una revisione separata per valutare se implementare l'esecuzione; il rilascio live deve richiedere una modifica di codice esplicita, revisione e conferma umana.

## Regola non negoziabile

**Nessun flag ambiente, credenziale, token o configurazione runtime può abilitare il trading reale mentre `LIVE_TRADING_RELEASED` è `false`.**
