# FENICE V7 Phase B — PAPER forward con architettura V6-parity

**Data:** 26 ottobre 2026  
**Intento operatore:** autorizzazione esplicita nella conversazione ad avviare
SOLO PAPER virtuale, capitale 10.000 EUR, <=300 EUR e <=3% per tentativo,
<=1 tentativo per giorno UTC, <=20 tentativi, <=15% per asset, mai broker/LIVE.

## Perché questa architettura

La V6 operava usando approvazione umana, fingerprint SHA256, quote
doppie (Alpaca e Twelve Data), controllo sessione, FX USD/EUR fresco,
PAPER OMS e GitHub Actions serializzate. La V7 mondiale è invece
pilot SHADOW di ricerca senza quote internazionali eseguibili.

La Phase B usa dunque inizialmente l'**universo USA PAPER già ammesso
dalla stessa infrastruttura V6**, ma possiede un proprio ciclo,
una propria approvazione, fingerprint e ledger, e non condivide mai
i sette fill storici V6.

## Nuovi file

- `lib/trading/paper-v7-phase-b-v6-parity.mjs`: PAPER simulata
  separata, selezione del comitato riusando lo stager puro già
  collaudato V6, qualità delle fonti, market OPEN, doppio quorum,
  verifica FX, commissioni e slippage, ricostruzione contabile da
  hash per ogni fill e limite 300 EUR effettivo dopo slippage.
- `lib/trading/paper-v7-phase-b-forward-fingerprint.mjs`: impronta
  indipendente del core V7 e del workflow; modifiche successive al core
  bloccano nuovi fill finché una nuova baseline non sia approvata.
- `scripts/run-v7-phase-b-forward-cycle.mjs`: ciclo in sola PAPER
  su dati prospettici correnti, con ledger `data/paper-v7-phase-b-forward-ledger.json`
  e diario giornaliero `data/paper-v7-phase-b-forward-days.json`.
- `data/paper-v7-phase-b-approval.json`: consenso umano e policy
  delimitata; richiede `approved=true` **solo dopo** fissazione
  definitiva di baseline SHA e digest controllati.
- `.github/workflows/v7-phase-b-forward-paper.yml`: ciclo con
  `fenice-data-writer` condiviso per serializzazione Git e
  nessuna modifica alla V6. Ripete le fonti già configurate,
  e non richiede database/PostgreSQL o nuove chiavi.
- `scripts/test-v7-phase-b-forward-paper.mjs`: test con fixture
  esplicitamente sintetiche, positivi e fail closed.

**Importante:** un giorno audit valido non è un mercato aperto e non
equivale a un fill. Le righe 25d registrano osservazioni effettive e
integrità di baseline, non una pretesa di quote mercato nei weekend.
Solo una `PAPER_FILLED` nuova con receipt della fonte e prova
della transazione simulata conta per il target di dieci.
Ogni caso di fonte, consenso, timestamp, rischio, API o mercato non
ammissibile produce zero nuovi fill.

## Finestra e avvio

Data prevista non prima di `2026-10-27T00:00:00.000Z`, non oltre
`2026-11-27T00:00:00.000Z` (31 giorni), limite PAPER V6 o più stretto.
Questa finestra è una proposta vincolata al fingerprint da validare
prima dell'avvio, mai una proroga della V6 scaduta 24 ottobre.

Il solo `approved=true` scritto a mano non basta: lo SHA
`baselineCommit` deve esistere come antenato Git verificabile e
`coreFingerprint.digest` deve coincidere esattamente col codice
attualmente eseguito. In caso di divergenza fail-closed.
Nessun ordine PAPER può essere scritto prima di tutti i gate.

## Differenza dalle sperimentazioni precedenti

Questa è una raccolta prospettica di fill PAPER su un universo
più ristretto USA, non la promozione della strategia mondiale V7:
V7 SHADOW continua a essere valutata contro benchmark a 7d/30d.
Non equiparare fill simulati a rendimento positivo o alpha.

Il workflow GitHub conserva solo un ledger V7 simulato e hash delle
evidenze; non inserisce raw quote o contratti nel repository pubblico.
Le condizioni contrattuali dei fornitori per i prezzi restano valide e
la ricezione di un dato non conferisce ulteriori diritti di licenza.

## Convalida

```bash
node scripts/test-v7-phase-b-forward-paper.mjs
node scripts/test-paper-v7-phase-b-preparation.mjs
node scripts/scan-repository-secrets.mjs
```

Non riutilizzare né toccare i file V6
`data/paper-validation-approval.json`, `data/paper-validation-campaign.json`,
`data/paper-oms-state.json` o fingerprint storico.
