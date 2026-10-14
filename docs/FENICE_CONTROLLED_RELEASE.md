# Fenice — pubblicazione esatta controllata

La pipeline `.github/workflows/vercel-deploy.yml` usa **un singolo tentativo programmato al giorno**, oltre alla richiesta manuale strettamente sorvegliata gia' presente. Evita di inseguire ogni commit dei bot di ricerca.

Il rilascio programmato verifica che il ref sia `main`, che esista il segreto GitHub `VERCEL_TOKEN` e che il commit esatto `GITHUB_SHA` non sia gia' `READY` su Vercel; se lo e', salta il rilascio. Quando crea un deployment passa quel SHA **direttamente in `gitSource.sha`** e in metadata: niente `withLatestCommit`, che avrebbe potuto portare un altro commit durante gli aggiornamenti dei dataset.

Se il limite Hobby 100/24h è raggiunto, la procedura fallisce e NON deve sostenere che il sito sia aggiornato. Anche un workflow completato non costituisce certificazione PAPER o permesso di operare con denaro reale.

**Importante:** l'integrazione automatica Git di Vercel resta attiva: questa modifica non arresta ancora tutti i deployment da push. Non applicare `git.deploymentEnabled.main=false` fino a quando il rilascio controllato tramite segreto GitHub e il suo smoke test su un vero deployment `READY` non siano stati verificati. Verificare l'esito nella pagina GitHub Actions 'Fenice Production Deploy'; se manca `VERCEL_TOKEN`, va configurato in modo privato nell'interfaccia GitHub, senza inserirlo in file o chat.

Quando il rilascio controllato e' comprovato, sara' possibile disabilitare i deployment automatici per `main` tramite `vercel.json` e usare questo rilascio per evitare la quota, senza spostare i file V6.
