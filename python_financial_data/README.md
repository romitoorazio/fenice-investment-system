# Fenice Python Financial Data

Modulo Python per acquisire dati finanziari, azionari, Forex e macroeconomici usando provider gratuiti.

## Provider

- **Yahoo Finance / yfinance**: storico di azioni, ETF, indici, Forex e materie prime. Non richiede API key.
- **FRED / fredapi**: tassi ufficiali, inflazione, moneta e altre serie macroeconomiche. Richiede una chiave gratuita FRED.
- **Alpha Vantage REST**: fonte aggiuntiva, attualmente implementata per lo storico Forex giornaliero. Richiede una chiave gratuita.

> Nota: yfinance usa dati pubblicamente disponibili di Yahoo Finance ed è indicato soprattutto per ricerca e uso personale. Verificare sempre i termini del provider prima di un utilizzo commerciale.

## 1. Installazione

Aprire il terminale nella cartella del progetto e lanciare:

```bash
cd python_financial_data
python -m venv .venv
```

Attivare l'ambiente virtuale.

### Windows PowerShell

```powershell
.\.venv\Scripts\Activate.ps1
```

### macOS / Linux

```bash
source .venv/bin/activate
```

Installare le librerie:

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## 2. Creazione delle API key

### FRED

1. Creare gratuitamente un account sul sito FRED della Federal Reserve Bank of St. Louis.
2. Aprire la pagina dedicata alle API key.
3. Richiedere una nuova chiave indicando una breve descrizione del progetto, per esempio `Fenice Investment System`.
4. Copiare la chiave generata.

### Alpha Vantage

1. Aprire la pagina `Claim your Free API Key` di Alpha Vantage.
2. Compilare il modulo con un indirizzo email valido.
3. Copiare la chiave mostrata.

Yahoo Finance tramite `yfinance` non richiede chiavi.

## 3. Configurazione sicura

Copiare il file di esempio:

### Windows

```powershell
Copy-Item .env.example .env
```

### macOS / Linux

```bash
cp .env.example .env
```

Aprire `.env` e compilare:

```dotenv
FRED_API_KEY=LA_TUA_CHIAVE_FRED
ALPHA_VANTAGE_API_KEY=LA_TUA_CHIAVE_ALPHA_VANTAGE
FINANCIAL_DATA_OUTPUT_DIR=output
FINANCIAL_DATA_HTTP_TIMEOUT=30
```

Non pubblicare mai il file `.env` e non inserire le chiavi direttamente nel codice.

## 4. Esecuzione

### Storico Apple da Yahoo Finance

```bash
python financial_data.py yahoo AAPL --period 5y --interval 1d
```

### FTSE MIB

Il simbolo corretto comunemente usato da Yahoo Finance è `^FTMIB`:

```bash
python financial_data.py yahoo "^FTMIB" --start 2020-01-01
```

### Tasso effettivo Fed Funds

```bash
python financial_data.py fred FEDFUNDS --start 2015-01-01
```

### Tasso sui depositi BCE

```bash
python financial_data.py fred ECBDFR --start 2015-01-01
```

### Inflazione USA

```bash
python financial_data.py fred CPIAUCSL --start 2015-01-01
```

### Forex EUR/USD da Alpha Vantage

```bash
python financial_data.py fx EUR USD --output-size compact
```

I CSV vengono salvati nella cartella `output`.

## 5. Utilizzo come modulo

```python
from financial_data import (
    download_market_history,
    get_alpha_vantage_fx_daily,
    get_fred_series,
)

apple = download_market_history("AAPL", period="1y")
fed_rate = get_fred_series("FEDFUNDS", start="2020-01-01")
eur_usd = get_alpha_vantage_fx_daily("EUR", "USD")

print(apple.tail())
print(fed_rate.tail())
print(eur_usd.tail())
```

Ogni funzione restituisce un `pandas.DataFrame`. Impostare `save_csv=False` per evitare la scrittura su disco.

## 6. Gestione degli errori

Il modulo distingue:

- `MissingApiKeyError`: chiave API mancante;
- `ProviderRateLimitError`: limite gratuito del provider raggiunto;
- `EmptyDataError`: simbolo o serie senza dati;
- `FinancialDataError`: errore generico del provider o della rete.

Le richieste REST vengono ritentate automaticamente fino a tre volte in caso di timeout o problemi di connessione. Gli errori non vengono nascosti: lo script termina con codice diverso da zero e registra una descrizione leggibile.

## Serie FRED iniziali consigliate per Fenice

| Area | Serie | Descrizione |
|---|---|---|
| USA | `FEDFUNDS` | Federal Funds Effective Rate |
| USA | `CPIAUCSL` | Consumer Price Index |
| USA | `M2SL` | Offerta monetaria M2 |
| Eurozona | `ECBDFR` | Tasso sui depositi BCE |
| Eurozona | `CP0000EZ19M086NEST` | Indice armonizzato prezzi al consumo |

Il catalogo FRED contiene anche serie internazionali provenienti da banche centrali, OCSE, FMI e altre istituzioni. La disponibilità e la frequenza variano per serie.
