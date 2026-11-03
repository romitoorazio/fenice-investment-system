# FENICE V8 — metodologia PAPER tecnico prospettica

**Decisione dell'utente (3 novembre 2026):** «Approviamo un'altra metodologia». Autorizzazione ESCLUSIVAMENTE a una nuova certificazione **tecnica virtuale** per misurare acquisizione di quotazioni, simulazioni e riconciliazione. Non estende autorizzazioni a ordini reali, broker, servizi a pagamento, modifiche agli storici precedenti.

## Due percorsi distinti

1. **V8 PAPER TECNICO.** Non richiede segnali COMPRA del comitato: il test di esecuzione non è una raccomandazione d'investimento. Usa capitale virtuale di 10.000 euro.
2. **Ricerca e decisioni finanziarie.** I segnali, gli score, le opportunità globali e le analisi del rendimento restano indipendenti; nessuna soglia di rischio del comitato viene abbassata. Il via libera tecnico V8 non abilita il trading reale.

## Regole V8 vincolanti

- Campagna nuova attiva soltanto dopo pin della baseline mediante Git blob SHA dei cinque file critici (workflow, motore virtuale e test, valutatore V8 e test). Modifiche successive a tali file bloccano V8.
- Nessun backfill. Solo le prove e i campioni raccolti **dopo** l'attivazione contano. V6, V7 e V7 B2 non vengono modificati o utilizzati come credito.
- Minimo **30 giorni di calendario**, **25 giornate distinte valide** e **10 campioni tecnici** di esecuzione virtuale. Una giornata valida richiede prova di dati utilizzabili e mercato aperto, ma non un segnale COMPRA e non necessariamente un fill.
- Massimo un campione al giorno e dieci in totale; nozionale 250–300 euro virtuali, fee simulata 1 euro, concentrazione massima di 1.500 euro per asset. Universi tecnici attuali: SPY, QQQ, AAPL e MSFT; non sono suggerimenti di investimento.
- Sessione USA autorevole Alpaca OPEN, almeno 5 minuti prima di chiusura. Quote non future e recenti entro 120 secondi da due fonti indipendenti Alpaca/Twelve Data per almeno tre strumenti, provenienza verificata e dispersione massimo 1%; cambio USD/EUR Twelve Data verificato entro 120 secondi. Un dato assente, scaduto o discordante invalida la giornata.
- Prova dei prezzi e della sessione conservata per ciascuna giornata, hash SHA256, catena immutabile e replay. I test con dati sintetici non danno credito.
- Anche raggiunti i 30/25/10, il sistema riporta soltanto **READY_FOR_INDEPENDENT_TECHNICAL_REVIEW**. Non conferma qualità delle decisioni o rendimenti, non abilita Directa né altri ordini reali.
- Legacy credit sempre zero: creditTowardV6=false, creditTowardB2=false, liveTradingAllowed=false, brokerConnectivityAllowed=false.

## Limiti

I campioni sono fill **simulati** da dati esterni, non ordini eseguiti in Borsa; non provano slippage reale, liquidità ottenibile o profitti. La ricerca di opportunità di crescita e la certificazione del sistema per eventuale uso reale sono fasi distinte, non automaticamente autorizzate.

## Registri

- Autorizzazione prospettica: data/paper-v8-technical-approval.json
- Registro giornate: data/paper-v8-technical-days.json
- Progresso e cause blocco: data/paper-v8-technical-status.json
- Registro virtuale: data/paper-execution-lab-ledger.json
- Valutatore e replay: scripts/run-v8-technical-evidence.mjs

Il periodo minimo non garantisce la data finale: 25 giornate valide dipendono da effettive sessioni aperte e dalla qualità delle fonti. Le festività non possono diventare giornate valide.
