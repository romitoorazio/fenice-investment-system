# FENICE ONE GLOBAL — Fase 8: verbale di verifica

**Data:** 2026-11-26T17:44:42.080Z
**Audit tecnico:** PASS
**PAPER certificato:** NO | **Ordini Directa:** 0

## Controlli

| Verifica | Esito | Evidenza |
|---|---|---|
| SIGNAL_JOURNAL_INTEGRITY | PASS | 101 valid entries |
| HISTORICAL_LEDGER_INTEGRITY | PASS | 33 valid entries |
| FORWARD_LEDGER_INTEGRITY | PASS | 19 valid events |
| RISK_CONTROLS_MATCH | PASS | HALT_NEW_VIRTUAL_ENTRIES |
| BROKER_ISOLATION | PASS | 0 orders |
| RESEARCH_VENUE_COVERAGE | PASS | 8/8 |
| FORWARD_MATURED_OUTCOMES | PENDING | 9 closed, 3 wins, 6 losses, 4 venues, 5 exit dates |
| INDEPENDENT_EXECUTABLE_QUOTES | PENDING | 0 independently attested providers |

## Performance e provenienza
- Segnali forward valutabili: 101; esclusi motivatamente: 0
- Operazioni forward chiuse: 9; positive: 3; negative: 6
- Risultato forward simulato: €-16.2696
- Backtest storico, completamente separato: €-18.9272
- Campione mondiale: 8/8 borse, non una scansione di tutte le azioni.
- Due vecchie osservazioni storiche potenzialmente provvisorie: 2
- Prezzi Yahoo non attestati; cambi BCE indicativi, non eseguibili.

## Blocchi alla certificazione
- FORWARD_MATURED_OUTCOMES
- INDEPENDENT_EXECUTABLE_QUOTES

## Integrità registri
- Segnali: c4bfbad877a7ac3ac8030e9762388836ae5dedf5067a848c0d2e6c1d0acc2633
- Storico: f925c42f2dee7a821154d8405d313bbee4b7ef82050e2499596aeb71d5ba55a1
- Forward: 2201fe8c1441c14b1970cbcd466110eefe8c12f33e275cfe2db8273463937b71

**L'audit della Fase 8 è implementato ed eseguito; non autorizza PAPER certificato o ordini reali.**
