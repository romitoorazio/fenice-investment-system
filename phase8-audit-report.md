# FENICE ONE GLOBAL — Fase 8: verbale di verifica

**Data:** 2026-11-23T19:15:32.464Z
**Audit tecnico:** PASS
**PAPER certificato:** NO | **Ordini Directa:** 0

## Controlli

| Verifica | Esito | Evidenza |
|---|---|---|
| SIGNAL_JOURNAL_INTEGRITY | PASS | 79 valid entries |
| HISTORICAL_LEDGER_INTEGRITY | PASS | 27 valid entries |
| FORWARD_LEDGER_INTEGRITY | PASS | 13 valid events |
| RISK_CONTROLS_MATCH | PASS | ACTIVE |
| BROKER_ISOLATION | PASS | 0 orders |
| RESEARCH_VENUE_COVERAGE | PASS | 8/8 |
| FORWARD_MATURED_OUTCOMES | PENDING | 5 closed, 2 wins, 3 losses, 3 venues, 2 exit dates |
| INDEPENDENT_EXECUTABLE_QUOTES | PENDING | 0 independently attested providers |

## Performance e provenienza
- Segnali forward valutabili: 79; esclusi motivatamente: 0
- Operazioni forward chiuse: 5; positive: 2; negative: 3
- Risultato forward simulato: €-3.8307
- Backtest storico, completamente separato: €-8.9410
- Campione mondiale: 8/8 borse, non una scansione di tutte le azioni.
- Due vecchie osservazioni storiche potenzialmente provvisorie: 2
- Prezzi Yahoo non attestati; cambi BCE indicativi, non eseguibili.

## Blocchi alla certificazione
- FORWARD_MATURED_OUTCOMES
- INDEPENDENT_EXECUTABLE_QUOTES

## Integrità registri
- Segnali: 3855a26595e0eb15a1bcd8cab6111f50a27529eeb03d697dc572ff73641fdce7
- Storico: c3063b8c5cee64be61b986c557b155c65775ccb9ced788fd7dfe6cf3deb217fc
- Forward: a3507fe95ebcbc5a07ecac421be53ebcc6c4ba8f90b970d48f9b5ddd312a7e3f

**L'audit della Fase 8 è implementato ed eseguito; non autorizza PAPER certificato o ordini reali.**
