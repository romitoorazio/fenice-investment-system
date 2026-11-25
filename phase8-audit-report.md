# FENICE ONE GLOBAL — Fase 8: verbale di verifica

**Data:** 2026-11-25T17:59:13.461Z
**Audit tecnico:** PASS
**PAPER certificato:** NO | **Ordini Directa:** 0

## Controlli

| Verifica | Esito | Evidenza |
|---|---|---|
| SIGNAL_JOURNAL_INTEGRITY | PASS | 93 valid entries |
| HISTORICAL_LEDGER_INTEGRITY | PASS | 30 valid entries |
| FORWARD_LEDGER_INTEGRITY | PASS | 17 valid events |
| RISK_CONTROLS_MATCH | PASS | ACTIVE |
| BROKER_ISOLATION | PASS | 0 orders |
| RESEARCH_VENUE_COVERAGE | PASS | 8/8 |
| FORWARD_MATURED_OUTCOMES | PENDING | 7 closed, 3 wins, 4 losses, 4 venues, 4 exit dates |
| INDEPENDENT_EXECUTABLE_QUOTES | PENDING | 0 independently attested providers |

## Performance e provenienza
- Segnali forward valutabili: 93; esclusi motivatamente: 0
- Operazioni forward chiuse: 7; positive: 3; negative: 4
- Risultato forward simulato: €-10.7318
- Backtest storico, completamente separato: €-9.2431
- Campione mondiale: 8/8 borse, non una scansione di tutte le azioni.
- Due vecchie osservazioni storiche potenzialmente provvisorie: 2
- Prezzi Yahoo non attestati; cambi BCE indicativi, non eseguibili.

## Blocchi alla certificazione
- FORWARD_MATURED_OUTCOMES
- INDEPENDENT_EXECUTABLE_QUOTES

## Integrità registri
- Segnali: d4dd246b900b49abfd38f1fba05a942a8eb0b68255b6b086caf406ceee0a648d
- Storico: 7cae4cb133507c0a52de3124fe52a44aae3c6413dc30cae9dd430a369f896a9e
- Forward: 9ae105d6fafab11d05a48cf7871521b683c3d875d87e836c17e0eb95d892618d

**L'audit della Fase 8 è implementato ed eseguito; non autorizza PAPER certificato o ordini reali.**
