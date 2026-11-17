# FENICE ONE GLOBAL — Fase 8: verbale di verifica

**Data:** 2026-11-17T16:54:26.986Z
**Audit tecnico:** PASS
**PAPER certificato:** NO | **Ordini Directa:** 0

## Controlli

| Verifica | Esito | Evidenza |
|---|---|---|
| SIGNAL_JOURNAL_INTEGRITY | PASS | 47 valid entries |
| HISTORICAL_LEDGER_INTEGRITY | PASS | 16 valid entries |
| FORWARD_LEDGER_INTEGRITY | PASS | 3 valid events |
| RISK_CONTROLS_MATCH | PASS | ACTIVE |
| BROKER_ISOLATION | PASS | 0 orders |
| RESEARCH_VENUE_COVERAGE | PASS | 8/8 |
| FORWARD_MATURED_OUTCOMES | PENDING | 0 closed, 0 wins, 0 losses, 0 venues, 0 exit dates |
| INDEPENDENT_EXECUTABLE_QUOTES | PENDING | 0 independently attested providers |

## Performance e provenienza
- Segnali forward valutabili: 47; esclusi motivatamente: 0
- Operazioni forward chiuse: 0; positive: 0; negative: 0
- Risultato forward simulato: €0.0000
- Backtest storico, completamente separato: €-10.6833
- Campione mondiale: 8/8 borse, non una scansione di tutte le azioni.
- Due vecchie osservazioni storiche potenzialmente provvisorie: 2
- Prezzi Yahoo non attestati; cambi BCE indicativi, non eseguibili.

## Blocchi alla certificazione
- FORWARD_MATURED_OUTCOMES
- INDEPENDENT_EXECUTABLE_QUOTES

## Integrità registri
- Segnali: 2f550315d1aa2f4aa076d7e9315e14eda7b76d2629c2fefd0844d8d339d8c72f
- Storico: f2f2b758c9fa827ca0add299b8051863ed7e8180543d1f3e9ad179f84e78548b
- Forward: 95e4667fe51511f2c9ea553eb9ba8138a7dbbd95129cb6cd1e3212d7eac750ec

**L'audit della Fase 8 è implementato ed eseguito; non autorizza PAPER certificato o ordini reali.**
