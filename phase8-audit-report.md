# FENICE ONE GLOBAL — Fase 8: verbale di verifica

**Data:** 2026-11-24T18:54:19.159Z
**Audit tecnico:** PASS
**PAPER certificato:** NO | **Ordini Directa:** 0

## Controlli

| Verifica | Esito | Evidenza |
|---|---|---|
| SIGNAL_JOURNAL_INTEGRITY | PASS | 86 valid entries |
| HISTORICAL_LEDGER_INTEGRITY | PASS | 27 valid entries |
| FORWARD_LEDGER_INTEGRITY | PASS | 15 valid events |
| RISK_CONTROLS_MATCH | PASS | ACTIVE |
| BROKER_ISOLATION | PASS | 0 orders |
| RESEARCH_VENUE_COVERAGE | PASS | 8/8 |
| FORWARD_MATURED_OUTCOMES | PENDING | 6 closed, 3 wins, 3 losses, 3 venues, 3 exit dates |
| INDEPENDENT_EXECUTABLE_QUOTES | PENDING | 0 independently attested providers |

## Performance e provenienza
- Segnali forward valutabili: 86; esclusi motivatamente: 0
- Operazioni forward chiuse: 6; positive: 3; negative: 3
- Risultato forward simulato: €-3.1210
- Backtest storico, completamente separato: €-8.9410
- Campione mondiale: 8/8 borse, non una scansione di tutte le azioni.
- Due vecchie osservazioni storiche potenzialmente provvisorie: 2
- Prezzi Yahoo non attestati; cambi BCE indicativi, non eseguibili.

## Blocchi alla certificazione
- FORWARD_MATURED_OUTCOMES
- INDEPENDENT_EXECUTABLE_QUOTES

## Integrità registri
- Segnali: 84fa29e0bce427b4724e858266bcb2d86c54c75c2d52b81ec36f74fca0084fc4
- Storico: c3063b8c5cee64be61b986c557b155c65775ccb9ced788fd7dfe6cf3deb217fc
- Forward: 18ba76e3e517ea8a43c8f1d0302384e1e6c5e7e5211be11a2fa7d1d252c9c353

**L'audit della Fase 8 è implementato ed eseguito; non autorizza PAPER certificato o ordini reali.**
