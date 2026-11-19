# FENICE ONE GLOBAL — Fase 8: verbale di verifica

**Data:** 2026-11-19T16:35:02.281Z
**Audit tecnico:** PASS
**PAPER certificato:** NO | **Ordini Directa:** 0

## Controlli

| Verifica | Esito | Evidenza |
|---|---|---|
| SIGNAL_JOURNAL_INTEGRITY | PASS | 63 valid entries |
| HISTORICAL_LEDGER_INTEGRITY | PASS | 22 valid entries |
| FORWARD_LEDGER_INTEGRITY | PASS | 9 valid events |
| RISK_CONTROLS_MATCH | PASS | ACTIVE |
| BROKER_ISOLATION | PASS | 0 orders |
| RESEARCH_VENUE_COVERAGE | PASS | 8/8 |
| FORWARD_MATURED_OUTCOMES | PENDING | 3 closed, 1 wins, 2 losses, 3 venues, 1 exit dates |
| INDEPENDENT_EXECUTABLE_QUOTES | PENDING | 0 independently attested providers |

## Performance e provenienza
- Segnali forward valutabili: 63; esclusi motivatamente: 0
- Operazioni forward chiuse: 3; positive: 1; negative: 2
- Risultato forward simulato: €-1.8144
- Backtest storico, completamente separato: €-1.9717
- Campione mondiale: 8/8 borse, non una scansione di tutte le azioni.
- Due vecchie osservazioni storiche potenzialmente provvisorie: 2
- Prezzi Yahoo non attestati; cambi BCE indicativi, non eseguibili.

## Blocchi alla certificazione
- FORWARD_MATURED_OUTCOMES
- INDEPENDENT_EXECUTABLE_QUOTES

## Integrità registri
- Segnali: 90ddd1423bf0b300996599cde6ceebbdd9c7f10d0e384354fe1f3c58cf75b6d8
- Storico: 182735cef193fe066d41dca71a005bf41f1f431ee1b1bc5d312c276aa6e3eeda
- Forward: b40175345d773324ade632b30d3480a8803725dad5c974c8802e1da36af7fb4c

**L'audit della Fase 8 è implementato ed eseguito; non autorizza PAPER certificato o ordini reali.**
