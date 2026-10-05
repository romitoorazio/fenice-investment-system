# Fenice: consolidamento del percorso di decisione

Questa modifica recupera selettivamente la revisione Sì/No della PR #140 nella PR #143, sulla versione di main verificata il 5 ottobre 2026. Non importa la storia divergente dei vecchi rami.

## Risultato concreto

- Il nucleo IA restituisce sempre `advisoryOnly=true` ed `executable=false`. L'idoneità di una proposta PAPER è distinta dall'autorità di eseguire un ordine.
- Il blocco LIVE e delle scritture broker non impedisce di preparare una proposta PAPER; aprire quei blocchi invalida questo percorso PAPER.
- Dati mancanti, NaN, Infinity, score fuori intervallo, tesi future/scadute, azioni non ammesse e condizioni di invalidazione assenti bloccano una proposta.
- Il collegamento alle proposte richiede almeno due famiglie indipendenti, evidenza fresca, termini completi e conferma umana. Il conteggio da solo non dimostra indipendenza.
- La classifica esclude opportunità con rischio non valido invece di assegnare loro una penalità pari a zero. Risultati e duplicati per simbolo/orizzonte sono gestiti deterministicamente.
- Il confronto delle tesi rifiuta revisioni con identificativi riutilizzati, date invertite e riferimenti alle evidenze mancanti/duplicati. Gli snapshot storici restano confrontabili senza promuoverli a evidenza di prezzo corrente.
- La pagina `/proposte` ripete i controlli prima del Sì e simula localmente con limiti cumulativi. Nessun percorso scrive nella campagna o raggiunge il broker.

## Diagnosi delle due operazioni PAPER

Le prove sono ancora insufficienti per certificare la campagna V6: nell'ultimo record disponibile del 4 ottobre risultano dieci giorni di evidenza e due fill, su almeno venticinque giorni di evidenza, dieci fill e trenta giorni di durata richiesti.

Due casi osservati spiegano occasioni mancate, senza dimostrare che un fill sarebbe stato possibile:

1. [Probe del 2 ottobre, run 37066209683](https://github.com/romitoorazio/fenice-investment-system/actions/runs/37066209683): avvio alle 21:20 UTC, sessione autorevole CLOSED alle 21:23, risultato `NO_ORDER reason=market-session-not-open`. Il workflow è verde perché il blocco sicuro ha funzionato.
2. [Recovery del 2 ottobre, run 37029751245](https://github.com/romitoorazio/fenice-investment-system/actions/runs/37029751245): qualità/fonti/budget passavano, ma intelligence aggiornata 2,2 minuti prima impostava `cooldown_ready=false`. Main contiene già la correzione che lega il cooldown a evidenza dei provider e cicli PAPER effettivi, descritta in `paper-probe-recovery-cooldown.md`.

La verifica ancora necessaria è un recovery effettivo durante una sessione aperta, con dati indipendenti e FX freschi, candidato idoneo, rischio, audit e riconciliazione validi. Nessun test di questa PR inventa un fill o aggiunge giorni di certificazione.

## Quattro gates separati

| Gate | Evidenza necessaria |
| --- | --- |
| Data Quality | Fonti e report freschi, quorum ammesso per il singolo strumento, cambio verificato, assenza di divergenza. Il punteggio generale non certifica automaticamente il prezzo di un'azione. |
| Risk/System Tests | Test CI, consenso legato ai termini, identità, limiti cumulativi, duplicati, audit, riconciliazione e controllo della sessione. |
| PAPER Certification | Campagna con baseline immutabile, durata ed evidenze richieste, almeno dieci fill verificati e qualità di esecuzione accettabile. |
| Live Lock | LIVE e operatività broker restano disabilitati. Un Sì nel laboratorio non è un consenso utilizzabile per ordini reali. |

## Lavoro ancora aperto

- Integrazione con un modello IA e persistenza durevole delle sue tesi/evidenze: le funzioni aggiunte qui controllano input effettivi, non attestano che un modello remoto sia già collegato.
- Generazione di proposte complete da rivedere: una coda vuota mostra uno stato onesto e consente solo l'esempio inventato.
- Maturazione della campagna V6 e verifica dei recovery a mercato aperto.
- Certificazione effettiva dei feed non USA per identità/venue e delle prove locali Directa in lettura/shadow.
- Un percorso futuro per operazioni reali richiede approvazione autenticata, ricontrollo server dei termini, broker locale e gates separatamente verificati. Non è parte di questa PR.

## Verifica riproducibile

Eseguire `node --experimental-strip-types scripts/test-fenice-ai.mjs`, `node --experimental-strip-types scripts/test-paper-proposal-review.mjs`, `npm run lint` e `npm run build`. I controlli di sicurezza esistenti rimangono nella Production CI.

Verificare inoltre che `computePaperValidationFingerprint` restituisca il digest della campagna attiva. I novantadue file fingerprinted non sono modificati.
