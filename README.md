# Fenice Investment System

Software di supporto decisionale per il **Progetto 100.000 €** di Orazio.

Fenice analizza autonomamente mercati, macroeconomia, geopolitica, aziende innovative e strumenti emergenti con un orizzonte di dieci anni. Il capitale di riferimento iniziale è 10.000 €.

## Fenice Autopilot

La versione 0.2 introduce un motore programmato che:

- osserva azioni, ETF, benchmark, obbligazioni, crypto e altre classi disponibili;
- cerca IPO, nuove quotazioni e depositi SEC S-1, F-1, 8-A e 10-12B;
- intercetta token in tendenza e, con CoinGecko Pro, i token appena aggiunti;
- legge inflazione, tassi, volatilità, occupazione e curva dei rendimenti;
- cerca società private, round di finanziamento, biotech e tecnologie emergenti nelle notizie globali;
- calcola opportunità, rischio, fiducia e verdetto;
- salva un rapporto aggiornato e uno storico giornaliero;
- pubblica automaticamente i nuovi dati quando il repository è collegato a Vercel.

La pagina `/autonomia` mostra fonti, copertura, strumenti, segnali emergenti, limiti e stato dell'ultimo rapporto.

## Regola fondamentale

```text
Analisi autonoma: SÌ
Scoperta nuovi strumenti: SÌ
Invio ordini: NO
Spostamento denaro: NO
Conferma umana: OBBLIGATORIA
```

Fenice **non compra e non vende automaticamente**. Ogni decisione finanziaria deve essere confermata da Orazio.

## Fonti dati

Senza chiave:

- SEC EDGAR;
- GDELT;
- CoinGecko pubblico con limiti.

Con chiave GitHub Actions:

- `ALPHA_VANTAGE_API_KEY` per mercati tradizionali, ETF, IPO, forex, commodities e opzioni;
- `FRED_API_KEY` per macroeconomia;
- `COINGECKO_API_KEY` per accesso crypto più stabile;
- `COINGECKO_PRO_API_KEY` per i token più recenti;
- `SEC_USER_AGENT` per identificare correttamente le richieste SEC.

Vedere [docs/AUTONOMY.md](docs/AUTONOMY.md) per configurazione, copertura e limiti.

## Automazione

Il workflow `.github/workflows/autonomy.yml` viene eseguito:

- ogni giorno alle 05:17 UTC;
- manualmente dalla scheda GitHub Actions;
- quando viene modificato il motore autonomo.

Il risultato viene scritto in:

- `data/latest-snapshot.json`;
- `data/history/YYYY-MM-DD.json`.

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- GitHub Actions
- Vercel

## Avvio locale

```bash
npm install
npm run dev
```

Aprire `http://localhost:3000`.

Per eseguire una raccolta dati manuale:

```bash
npm run analyze
```

## Controlli

```bash
npm run lint
npm run build
```

## Architettura principale

- `app/page.tsx`: dashboard principale;
- `app/autonomia/page.tsx`: centro di controllo autonomo;
- `app/api/autonomy/status/route.ts`: API dell'ultimo rapporto;
- `components/FeniceDashboard.tsx`: interfaccia iniziale;
- `components/AutonomyPanel.tsx`: monitoraggio multi-mercato;
- `scripts/run-autonomy.mjs`: raccolta, scoperta e punteggio;
- `lib/autonomy.ts`: tipi, copertura e regole;
- `data/`: rapporto attuale e storico.

## Limite realistico

Nessuna singola fonte gratuita copre ogni borsa, mercato OTC, società privata, round non annunciato, token appena creato o strumento non regolamentato. Fenice è quindi estensibile e segnala sempre la copertura mancante. Una copertura istituzionale completa richiederà provider professionali a pagamento.

> Fenice è uno strumento di analisi e screening. Non costituisce consulenza finanziaria e non esegue ordini.
