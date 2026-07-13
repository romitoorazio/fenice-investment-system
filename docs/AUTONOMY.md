# Fenice Autopilot

Fenice Autopilot rende autonoma **l'analisi**, non l'esecuzione di ordini.

## Cosa fa automaticamente

Ogni giorno il workflow `.github/workflows/autonomy.yml`:

1. legge i depositi SEC recenti per intercettare S-1, F-1, 8-A e 10-12B;
2. cerca IPO e quotazioni di azioni, ETF e benchmark con Alpha Vantage;
3. osserva le principali criptovalute, i token in tendenza e, con piano Pro, i token appena aggiunti a CoinGecko;
4. raccoglie inflazione, tassi, curva dei rendimenti, disoccupazione, volatilità e liquidità da FRED;
5. esamina notizie globali, geopolitica, round di finanziamento, biotech e tecnologie emergenti tramite GDELT;
6. calcola opportunità, rischio, fiducia e verdetto;
7. salva `data/latest-snapshot.json` e uno storico giornaliero in `data/history/`;
8. esegue un commit automatico, così un progetto Vercel collegato a GitHub pubblica il nuovo rapporto.

## Fonti

### Senza chiave

- SEC EDGAR
- GDELT
- CoinGecko in modalità pubblica limitata

### Con chiave

- `ALPHA_VANTAGE_API_KEY`: azioni, ETF, IPO, forex, commodities, opzioni e altre serie di mercato;
- `FRED_API_KEY`: indicatori macroeconomici;
- `COINGECKO_API_KEY`: accesso crypto più stabile;
- `COINGECKO_PRO_API_KEY`: elenco dei token aggiunti più recentemente;
- `SEC_USER_AGENT`: identificazione corretta delle richieste SEC.

Le chiavi devono essere inserite in **GitHub → Settings → Secrets and variables → Actions**.

## Avvio manuale

Aprire GitHub:

1. scheda **Actions**;
2. workflow **Fenice Autonomous Analysis**;
3. **Run workflow**;
4. scegliere `main`;
5. premere **Run workflow**.

Oppure localmente:

```bash
npm run analyze
```

## Politica di sicurezza

```text
Analisi autonoma: SÌ
Scoperta nuovi strumenti: SÌ
Produzione di punteggi: SÌ
Invio ordini al broker: NO
Spostamento di denaro: NO
Conferma umana: OBBLIGATORIA
```

## Copertura reale e limiti

Nessun servizio gratuito copre in modo completo ogni borsa, mercato OTC, società privata, round non annunciato, token appena creato o strumento non regolamentato del mondo.

Fenice è quindi costruito come motore estensibile: nuove fonti possono essere aggiunte senza rifare l'interfaccia. Per una copertura istituzionale saranno necessari provider a pagamento per dati realtime, mercati privati, fondamentali globali, opzioni complete e notizie premium.

Un segnale nuovo non equivale a un investimento valido. IPO, società private e token emergenti ricevono un rischio iniziale elevato finché non vengono confermati da più fonti.
