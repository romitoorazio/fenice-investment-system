# PAPER V6: continuità e controlli temporali — 12 ottobre 2026

## Finestre distinte, senza rinnovo implicito

La V6 è iniziata il 25 settembre 2026 alle 15:40:35.178 UTC e richiede 30 periodi completi di 24 ore, 25 giorni di evidenza e almeno 10 fill PAPER validi. La prima maturazione temporale è il 25 ottobre 2026 alle 15:40:35.178 UTC (16:40 in Italia).

L'approvazione esistente autorizza nuovi probe PAPER fino al 24 ottobre 2026 alle 21:59:59 UTC. Lo stager canonico rifiuta nuovi probe dopo la scadenza. La scadenza non annulla fill o prove raccolte prima e non impedisce la maturazione passiva del calendario. Il recorder canonico permette giornate senza nuovo rischio mantenendo fingerprint, audit e riconciliazione.

Procedura operativa:

1. Fino alla scadenza, solo i probe già autorizzati possono avvenire e soltanto se tutti i gate canonici passano. Nessuna soglia, quantità, frequenza o limite viene aumentato.
2. Dopo la scadenza, nessun nuovo probe viene autorizzato da questa modifica. Le prove esistenti restano conservate; l'osservazione senza rischio può maturare il calendario.
3. Se mancano fill dopo la scadenza, una futura approvazione esplicita e una procedura compatibile con il fingerprint sono necessarie per aggiungerli. Il calendario non produce fill artificiali.
4. Raggiungere i numeri è solo un requisito per una revisione: non certifica automaticamente né apre LIVE, broker connectivity o Directa.

Il calendario UI distingue questi casi e non modifica `data/paper-validation-approval.json`, la campagna, la coda o il ledger.

## Date future e baseline immutabile

Il difetto del `risk-engine.ts` V6 è confermato tramite una fixture pura: il singolo modulo accetta una data della quotazione nel futuro. La correzione del core resta preparata nella PR #224 per una baseline successiva. Non viene integrata nella V6 congelata né viene simulata una correzione del fingerprint.

La revisione Sì/No usa ora un controllo aggiuntivo che rifiuta date future, invalide, prive di timezone, calendarialmente impossibili e scadute prima di ammettere la simulazione isolata. Il gate runtime delle quotazioni controlla anche identità e contatori del catalogo richiesto: quotazioni di simboli esterni non possono soddisfare il quorum.

Readiness/API espongono il difetto del core come `TESTING`, anche se la suite storica passa. La nuova protezione non rappresenta una correzione del core canonico congelato o una prova di connessione broker.

## Verifica

- Regressioni negative su clock, date future/impossibili, scadenza, contatori e identità del quorum.
- Regressioni di continuità prima/dopo la scadenza, target incompleti e 30 giorni non anticipabili.
- Revisione Sì/No, no provider calls dal refresh pubblico, nessun ordine LIVE.
- Confronto byte-per-byte/hash dei 92 file della baseline V6: nessuna modifica ammessa.

## FENICE100K · Checkpoint proprietario, 13 ottobre 2026

Nuovo controllo informativo indipendente `lib/ui/paper-continuity-owner-checkpoint.ts`, visibile in `/readiness` e nella risposta `/api/trading/readiness`. Presenta i fill riportati mancanti, le giornate verificate mancanti, il limite preesistente di ordini PAPER al giorno e un minimo **esclusivamente teorico** di giornate per tentare i fill restanti (ipotizzando al più un fill per prova). Non pianifica né avvia nuove prove e non presume liquidità, feed o sessioni aperte.

Stato verificato il 13 ottobre: 19 giornate riportate e 7/10 fill, con approvazione per nuove prove fino al 24 ottobre 2026 ore 21:59:59 UTC. La durata minima di 30 giorni non matura prima del 25 ottobre 2026 ore 15:40:35.178 UTC. Il controllo distingue revisione umana prima della scadenza, osservazione passiva dopo scadenza e blocco in caso di evidenze incoerenti.

Non vengono modificate policy, approvazione, motore V6, audit o dati; non vengono create approvazioni né simulazioni di fill. Il checkpoint è solo diagnostico e non concede permessi PAPER o LIVE. Le regressioni riproducibili sono nel workflow autonomo `Fenice PAPER Owner Continuity Advisory`.
