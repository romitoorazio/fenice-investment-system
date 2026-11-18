# FENICE ONE GLOBAL — Fase 8: verbale di verifica

**Data:** 2026-11-18T16:28:00.667Z
**Audit tecnico:** PASS
**PAPER certificato:** NO | **Ordini Directa:** 0

## Controlli

| Verifica | Esito | Evidenza |
|---|---|---|
| SIGNAL_JOURNAL_INTEGRITY | PASS | 55 valid entries |
| HISTORICAL_LEDGER_INTEGRITY | PASS | 19 valid entries |
| FORWARD_LEDGER_INTEGRITY | PASS | 3 valid events |
| RISK_CONTROLS_MATCH | PASS | ACTIVE |
| BROKER_ISOLATION | PASS | 0 orders |
| RESEARCH_VENUE_COVERAGE | PASS | 8/8 |
| FORWARD_MATURED_OUTCOMES | PENDING | 0 closed, 0 wins, 0 losses, 0 venues, 0 exit dates |
| INDEPENDENT_EXECUTABLE_QUOTES | PENDING | 0 independently attested providers |

## Performance e provenienza
- Segnali forward valutabili: 55; esclusi motivatamente: 0
- Operazioni forward chiuse: 0; positive: 0; negative: 0
- Risultato forward simulato: €0.0000
- Backtest storico, completamente separato: €-0.9035
- Campione mondiale: 8/8 borse, non una scansione di tutte le azioni.
- Due vecchie osservazioni storiche potenzialmente provvisorie: 2
- Prezzi Yahoo non attestati; cambi BCE indicativi, non eseguibili.

## Blocchi alla certificazione
- FORWARD_MATURED_OUTCOMES
- INDEPENDENT_EXECUTABLE_QUOTES

## Integrità registri
- Segnali: e7824ec62b85fee6f2d844a740db1ae75d02d5bf2327464c0fda01186cc7b359
- Storico: 60c96f0ca4cd0b194c32527d0ebe2c7386d369b0d4799858e465b78350a20f92
- Forward: 95e4667fe51511f2c9ea553eb9ba8138a7dbbd95129cb6cd1e3212d7eac750ec

**L'audit della Fase 8 è implementato ed eseguito; non autorizza PAPER certificato o ordini reali.**
