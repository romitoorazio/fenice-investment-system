# FENICE UNICA — audit delle prove e collaudo tecnico in 3 sedute

Data di ricognizione: 2026-11-03. Stato: **PIANO DI INTEGRAZIONE E PROVE, NON CERTIFICAZIONE**.

## Inventario verificato, con fonti originali
- V6: 40 osservazioni giornaliere dal 25/09 al 03/11; 22 giornate con OPEN autorevole + dati istituzionali, quote, FX e audit pronti secondo un **filtro preliminare comparativo**. Le altre osservazioni possono essere utili per test di fail-closed, non sono giornate idonee allo stesso filtro.
- V6: 7 fill virtuali della strategia e 2 ordini correttamente respinti dal rischio, nel registro PAPER OMS.
- V7 Fase B: 7 osservazioni di campagna con mercato non confermato secondo il suo campo evidence, e 0 fill; **non** costituiscono 7 giornate V8 valide.
- V7 B2: registro campagna separato, 2 osservazioni senza evidenza di mercato valida e nessun fill PAPER all'atto della ricognizione. Le sue soglie congelate non vengono modificate.
- Laboratorio tecnico pre-V8: 1 campione precedente all'attivazione V8; escluso dal budget ufficiale V8, ma conservato per regressione.
- V8: una simulazione tecnica PAPER su SPY e una giornata con prove ammesse in data 03/11, dopo attivazione della sua baseline.
- La giornata 03/11 compare anche in V6. Inventario con date distinte = **22**, non 23.
- **7 fill strategici V6 + 1 campione tecnico V8 NON diventano otto fill certificati di una campagna unificata**: si tratta di categorie e versioni diverse. Possono validare capacità tecniche pregresse, ma non essere accreditati a V8, B2 o a un motore nuovo.

## Azione immediata, senza rifare il motore
1. Conservare la V8 attuale e il suo ledger con fingerprint e LIVE spento.
2. Eseguire l'audit in sola lettura con: node scripts/audit-fenice-unica-readonly.mjs. Lo script aggrega solo **metadati e prove**, mantiene l'origine delle versioni e calcola date distinte.
3. Confrontare i componenti V6 (rischio/reconciliation/OMS), V7 (radar e ricerca globale), V8 (quorum di due fonti e simulazioni) mediante test di integrazione **senza sostituire i moduli congelati in produzione**.
4. Sedute USA 04/11, 05/11, 06/11: raccogliere prove prospective di mercato OPEN, two-source quote freshness, FX, un campione V8 al giorno quando il sistema lo consente, crash/recovery, audit/replay, fail-closed del rischio e stato LIVE=false. Le tre sedute devono essere effettuate su baseline invariata; qualsiasi errore invalidante si registra e si corregge senza falsificare una giornata.
5. Alla fine delle tre sedute produrre un verbale **PILOT_TECNICO_PASS/FAIL** basato su test reali, con gap e anomalie. Se pass, si può dire che l'integrazione tecnica ha superato un collaudo di 72 ore/tre sessioni, **non** che una strategia è profittevole o certificata per il broker.

## Cosa rimane da certificare separatamente
- **V8 originale:** 30 giorni di calendario, 25 giornate valide prospettiche, 10 campioni tecnici dal nuovo ledger. Le prove V6 precedenti non si trasformano in giorni V8; la presente ricognizione non altera queste regole.
- **Investimenti:** selezione segnali, qualità dei rendimenti, slippage realizzabile e robustezza fuori campione. I test V8 di execution plumbing non dimostrano che un BUY sia profittevole.
- **Reale/LIVE:** richiede successiva decisione, valutazione dei rischi e autorizzazione espressa. Nessun percorso automatico dai test a Directa.

Perché tre giorni possono essere utili: l'inventario preliminare ha già **22 date storiche** con prove coerenti. Se le sedute 04–06/11 sono tutte valide, si possono esaminare **25 date distinte nell'archivio comparativo**. Non sono però 25 date della **nuova baseline**: l'esercizio è *riutilizzo comparativo di evidenze*, non backfill di certificazione.
