# Proposte Sì / No

La pagina `/proposte`, raggiungibile da “Sì / No” nella navigazione di Fenice, mostra una proposta alla volta: nome, quantità, prezzo massimo, valuta, costi stimati, totale, motivazione e scadenza.

- **Sì** esegue una simulazione locale isolata dopo un nuovo controllo della proposta e salva la risposta su quel dispositivo.
- **No** salva il rifiuto e non esegue neppure la simulazione.
- Una risposta vale per una sola proposta e per i suoi dettagli esatti. Doppie risposte e riutilizzo della stessa proposta non producono altre simulazioni.
- Le conferme sono sospese per prezzi/evidenze scaduti, proposte modificate, mercato non verificato, rischio fuori limite o registro locale non leggibile.
- Ogni proposta mostra le fonti effettivamente ammesse, i rispettivi prezzi/orari, il cambio e la verifica della sessione. Etichette PAPER su fonti non registrate non creano un quorum.
- I Sì già registrati consumano i limiti di concentrazione, esposizione, turnover e liquidità del laboratorio locale. Il budget non riparte da zero per ogni nuova proposta.
- Il registro conserva fino a 100 risposte e poi sospende nuove registrazioni; non elimina ricevute vecchie riaprendo gli stessi identificativi.
- La prova con lo strumento inventato “DEMO” è disponibile anche quando la coda PAPER è vuota.

## Confine operativo

Il caricamento usa solo GET e legge la coda PAPER esistente. Nessun endpoint scrive ordini o decisioni nel server, nessuna chiamata raggiunge Directa e nessuna credenziale del broker è richiesta. Un Sì non autorizza né invia un acquisto reale.

Il simulatore usa `PaperOms` con costi e slippage virtuali. I risultati restano nel browser: non sono un portafoglio consolidato, non cambiano le evidenze della campagna PAPER attiva e non valgono per la sua certificazione. Le commissioni visualizzate sono quelle del modello, non le tariffe Directa. Le quantità frazionarie non attestano disponibilità o negoziabilità dello strumento presso Directa.

Le proposte ammesse per la revisione sono acquisti PAPER LIMIT/DAY con i dettagli completi. I probe MARKET della campagna non vengono trasformati silenziosamente in ordini LIMIT. La pagina resta vuota quando la coda non contiene proposte. La proposta mantiene la scadenza originale e non riceve una nuova validità a ogni refresh.

Il consenso è legato all’identità e ai termini della proposta. Prima del Sì per una proposta della coda il browser rilegge le evidenze dal server. La registrazione usa Web Locks per serializzare le risposte di più schede. I dati locali sono un registro di prove dell’interfaccia, non una prova autenticata di consenso utilizzabile per ordini reali.

Quando una voce della coda contiene una vera `aiThesis`, il server ne verifica azione, simbolo, punteggi, motivazioni, condizioni di invalidazione, freschezza e controlli PAPER prima della revisione. Una tesi assente non viene fabbricata. La pagina può quindi mostrare una tesi IA verificabile, ma questa PR non collega un modello remoto né genera automaticamente nuove idee o proposte. Metadati IA malformati, anche se esplicitamente nulli, bloccano la conferma.

## Verifica

`node --experimental-strip-types scripts/test-paper-proposal-review.mjs`

`node --experimental-strip-types scripts/test-fenice-ai.mjs`

Il workflow dedicato non modifica `package.json`, il core di validazione, i workflow fingerprinted, la coda o lo stato della campagna attiva. La modifica resta su branch dedicato e PR per la revisione.
