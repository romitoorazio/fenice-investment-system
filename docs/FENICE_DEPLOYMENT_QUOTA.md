# Fenice — riduzione quota deployment Vercel senza toccare PAPER V6

## Riscontro del 14 ottobre 2026
Vercel Hobby ha risposto con `402 api-deployments-free-per-day` (100 deployment in 24 ore). Un numero elevato di commit di soli dati innesca una catena di pubblicazioni: Foundation → Terminal → V7 Shadow → Promotion, con nuove evidenze CI.

## Intervento con core V6 intatto
1. **Foundation** `.github/workflows/autonomy.yml`: da hourly a ogni tre ore, quindi 8 cicli/giorno, più il refresh completo giornaliero; dispatch manuale sempre disponibile.
2. **Engineering Validation Evidence**: un nuovo commit soltanto se è cambiato il codice validato, se la prova precedente non è attendibile o se è trascorsa una finestra di almeno sei ore. Non rallenta la CI: elimina commit ridondanti di prove tecniche già valide. Se il controllo di confronto fallisce, pubblica la prova invece di saltarla.
3. `.github/workflows/ci.yml` e `.github/workflows/paper-validation.yml` restano **byte per byte invariati**: appartengono al fingerprint PAPER V6 attivo.
4. Test offline `scripts/test-deployment-budget-policy.mjs` e `scripts/test-engineering-evidence-publish-policy.mjs` verificano la cadenza, il rispetto del freeze e il comportamento del throttling.

## Da non fare
- Non usare `ignoreCommand` come soluzione della quota: Vercel conteggia anche deployment cancellati con Ignored Build Step.
- Non cambiare il core PAPER, la scadenza o le autorizzazioni dei test; il blocco LIVE resta intatto.
- Non considerare la produzione aggiornata quando il merge GitHub è verde ma manca un deployment Vercel READY allo stesso SHA.
- Non nascondere l'età dei dati: gli snapshot JSON inclusi nel bundle rimangono quelli dell'ultima build READY.

## Validazione dopo il merge
Controllare il numero di commit/deployment nelle successive 24 ore, il rispetto della quota, il SHA della prima build di produzione READY dopo la riapertura della quota e gli errori runtime. Se il limite è ancora raggiunto, rivedere altri produttori di dati senza toccare PAPER V6 o fare upgrade a pagamento senza autorizzazione.

Fonti: https://vercel.com/docs/limits — https://vercel.com/docs/project-configuration/project-settings
