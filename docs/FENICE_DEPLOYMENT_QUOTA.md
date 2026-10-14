# Fenice: evitare deployment inutili senza interrompere i dati

Ultimo riscontro 14 ottobre 2026: Vercel Hobby ha risposto `402 api-deployments-free-per-day` (oltre 100 deployment / 24 ore); il codice `main` testato puo' essere piu' recente della produzione finche' questa quota non si sblocca.

## Causa verificata
Le pubblicazioni delle fonti su `main` innescano piu' workflow in cascata: Foundation -> World Terminal -> V7 Shadow Evaluation -> Promotion. Prima Foundation era eseguita ogni ora. Il CI di produzione era eseguito anch'esso ogni ora e su ogni push di dati, poi la sua conclusione generava un nuovo commit di engineering evidence. Tutto questo crea molti deployment Vercel della stessa applicazione.

## Intervento
- Foundation: ogni 3 ore (8 volte al giorno) piu' una esecuzione giornaliera completa; workflow_dispatch resta disponibile.
- Production CI: quattro esecuzioni periodiche al giorno, e sempre sui cambiamenti di codice/PR e sui dati sensibili PAPER, OMS, FX e quote di esecuzione. Esclusi dal trigger *push* soltanto i dataset generati e verificati dai rispettivi writer (es. V7, storico, Foundation, terminale, engineering evidence).
- Le finestre, i controlli e i commit di certificazione PAPER V6 **non vengono modificati**.
- I bot continuano ad aggiornare gli snapshot, con minore frequenza a monte. Le dashboard basate sui JSON impacchettati non si aggiornano in tempo reale tra due deployment riusciti: mostrarne sempre il timestamp originale.
- Non configurare un semplice `ignoreCommand` come cura della quota: su Vercel anche un deployment cancellato dal comando di ignore conta verso il limite; non serve a evitare il `402`.

## Collaudo operativo
1. Esaminare CI della PR: build, no-lookahead, freeze guard PAPER e test di budget tutti verdi.
2. Verificare merge SHA su `main` e non confondere un workflow GitHub verde con un deployment Vercel READY.
3. Alla successiva finestra quota, controllare il nuovo deployment produzione, SHA e runtime error; se ancora bloccato, consultare **Vercel > Project > Deployments** e la quota team.
4. Misurare per 24h il numero di nuovi commit e deployment, oltre alla freschezza di `data/investment-committee.json`, `data/v7-decision-outcomes.json` e `data/paper-validation-campaign.json`. Ulteriori interventi solo se la frequenza resta troppo alta.
5. Evitare upgrade fatturazione, rotazione chiavi e cambi di broker non richiesti; non attribuire la quota a un bug di mercato o a una perdita di dati.

Il limite Vercel Hobby indicato nella documentazione corrente e' di 100 deployment nelle 24 ore. Nessuna modifica a un cron o un limite di build autorizza ordini LIVE.

Fonti:
- https://vercel.com/docs/limits
- https://vercel.com/docs/project-configuration/project-settings
