# FENICE ONE GLOBAL — Fase 8: verbale di verifica

**Data:** 2026-11-10T16:06:41.468Z
**Audit tecnico:** PASS
**PAPER certificato:** NO | **Ordini Directa:** 0

## Controlli

| Verifica | Esito | Evidenza |
|---|---|---|
| SIGNAL_JOURNAL_INTEGRITY | PASS | 14 valid entries |
| HISTORICAL_LEDGER_INTEGRITY | PASS | 7 valid entries |
| FORWARD_LEDGER_INTEGRITY | PASS | 0 valid events |
| RISK_CONTROLS_MATCH | PASS | ACTIVE |
| BROKER_ISOLATION | PASS | 0 orders |
| RESEARCH_VENUE_COVERAGE | PASS | 8/8 |
| FORWARD_MATURED_OUTCOMES | PENDING | 0 closed, 0 wins, 0 losses, 0 venues, 0 exit dates |
| INDEPENDENT_EXECUTABLE_QUOTES | PENDING | 0 independently attested providers |

## Performance e provenienza
- Segnali forward valutabili: 12; esclusi motivatamente: 2
- Operazioni forward chiuse: 0; positive: 0; negative: 0
- Risultato forward simulato: €0.0000
- Backtest storico, completamente separato: €-14.2712
- Campione mondiale: 8/8 borse, non una scansione di tutte le azioni.
- Due vecchie osservazioni storiche potenzialmente provvisorie: 2
- Prezzi Yahoo non attestati; cambi BCE indicativi, non eseguibili.

## Blocchi alla certificazione
- FORWARD_MATURED_OUTCOMES
- INDEPENDENT_EXECUTABLE_QUOTES

## Integrità registri
- Segnali: 8481e4137d95361c7d9af7a22d0bf161692a512065aa3709e02b92dfdff0151d
- Storico: d7b436e6881939171befa0a3ee4c2f2731960d49f76aa0c0841ebbc85798c378
- Forward: GENESIS

**L'audit della Fase 8 è implementato ed eseguito; non autorizza PAPER certificato o ordini reali.**
