# FENICE ONE GLOBAL — Fase 8: verbale di verifica

**Data:** 2026-11-27T17:28:42.323Z
**Audit tecnico:** PASS
**PAPER certificato:** NO | **Ordini Directa:** 0

## Controlli

| Verifica | Esito | Evidenza |
|---|---|---|
| SIGNAL_JOURNAL_INTEGRITY | PASS | 107 valid entries |
| HISTORICAL_LEDGER_INTEGRITY | PASS | 35 valid entries |
| FORWARD_LEDGER_INTEGRITY | PASS | 19 valid events |
| RISK_CONTROLS_MATCH | PASS | HALT_NEW_VIRTUAL_ENTRIES |
| BROKER_ISOLATION | PASS | 0 orders |
| RESEARCH_VENUE_COVERAGE | PASS | 8/8 |
| FORWARD_MATURED_OUTCOMES | PENDING | 9 closed, 3 wins, 6 losses, 4 venues, 5 exit dates |
| INDEPENDENT_EXECUTABLE_QUOTES | PENDING | 0 independently attested providers |

## Performance e provenienza
- Segnali forward valutabili: 107; esclusi motivatamente: 0
- Operazioni forward chiuse: 9; positive: 3; negative: 6
- Risultato forward simulato: €-16.2696
- Backtest storico, completamente separato: €-15.2886
- Campione mondiale: 8/8 borse, non una scansione di tutte le azioni.
- Due vecchie osservazioni storiche potenzialmente provvisorie: 2
- Prezzi Yahoo non attestati; cambi BCE indicativi, non eseguibili.

## Blocchi alla certificazione
- FORWARD_MATURED_OUTCOMES
- INDEPENDENT_EXECUTABLE_QUOTES

## Integrità registri
- Segnali: 9cccbef646f7e6b4e68070f75e4153f7a87c4258d908e03ba805597c575c92b0
- Storico: a850882b4ac9d70b138d560d65a66ebc0a00cb60a76a4c87a6f6f30702f59fb6
- Forward: 2201fe8c1441c14b1970cbcd466110eefe8c12f33e275cfe2db8273463937b71

**L'audit della Fase 8 è implementato ed eseguito; non autorizza PAPER certificato o ordini reali.**
