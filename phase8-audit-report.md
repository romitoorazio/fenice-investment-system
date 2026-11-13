# FENICE ONE GLOBAL — Fase 8: verbale di verifica

**Data:** 2026-11-13T15:24:32.831Z
**Audit tecnico:** PASS
**PAPER certificato:** NO | **Ordini Directa:** 0

## Controlli

| Verifica | Esito | Evidenza |
|---|---|---|
| SIGNAL_JOURNAL_INTEGRITY | PASS | 31 valid entries |
| HISTORICAL_LEDGER_INTEGRITY | PASS | 12 valid entries |
| FORWARD_LEDGER_INTEGRITY | PASS | 3 valid events |
| RISK_CONTROLS_MATCH | PASS | ACTIVE |
| BROKER_ISOLATION | PASS | 0 orders |
| RESEARCH_VENUE_COVERAGE | PASS | 8/8 |
| FORWARD_MATURED_OUTCOMES | PENDING | 0 closed, 0 wins, 0 losses, 0 venues, 0 exit dates |
| INDEPENDENT_EXECUTABLE_QUOTES | PENDING | 0 independently attested providers |

## Performance e provenienza
- Segnali forward valutabili: 31; esclusi motivatamente: 0
- Operazioni forward chiuse: 0; positive: 0; negative: 0
- Risultato forward simulato: €0.0000
- Backtest storico, completamente separato: €-1.8053
- Campione mondiale: 8/8 borse, non una scansione di tutte le azioni.
- Due vecchie osservazioni storiche potenzialmente provvisorie: 2
- Prezzi Yahoo non attestati; cambi BCE indicativi, non eseguibili.

## Blocchi alla certificazione
- FORWARD_MATURED_OUTCOMES
- INDEPENDENT_EXECUTABLE_QUOTES

## Integrità registri
- Segnali: 927e57bfe3945c3f0451436ba459ac751a1e9c406c0a9b117aff8d440454056c
- Storico: d21bff53209815cc7956dc9a82ce00ccbfe28bba27376c1a8ad6eb4d36377d25
- Forward: 95e4667fe51511f2c9ea553eb9ba8138a7dbbd95129cb6cd1e3212d7eac750ec

**L'audit della Fase 8 è implementato ed eseguito; non autorizza PAPER certificato o ordini reali.**
