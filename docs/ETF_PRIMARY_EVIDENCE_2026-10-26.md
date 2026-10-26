# ETF: evidenze ufficiali disponibili il 26 ottobre 2026

## Scopo e limiti

Questo documento registra **fonti pubbliche dell'emittente**, consultate il 26/10/2026,
per i tre ETF USA già analizzati dal Comitato Fenice. I dati sono indicatori
di **costo annuo del fondo**, non costi reali Directa, prezzi di scambio, previsioni
di guadagno o autorizzazioni ad acquistare. Nessuna richiesta a provider a pagamento.

| Ticker | ISIN | Emittente | Indice seguito | Rapporto di spesa annuo | Definizione dichiarata |
| --- | --- | --- | --- | ---: | --- |
| SPY | US78462F1030 | State Street | S&P 500 Index | 0,0945% | Gross expense ratio |
| QQQ | US46090E1038 | Invesco | Nasdaq-100 Index | 0,18% | Total expense ratio |
| IWM | US4642876555 | iShares / BlackRock | Russell 2000 Index | 0,19% | Expense ratio da prospetto |

### Fonti primarie

- SPY: https://www.ssga.com/us/en/individual/etfs/state-street-spdr-sp-500-etf-trust-spy
- QQQ: https://www.invesco.com/us/en/financial-products/etfs/invesco-qqq-trust-series-1.html
- IWM: https://www.ishares.com/us/products/239710/ishares-russell-2000-etf

I tre valori non sono omogenei in ogni definizione (gross / total / prospectus).
Non confrontare direttamente tali percentuali con costi di spread, commissione,
conversione valutaria, imposte o tracking difference. I fondi sono denominati
in USD; disponibilità, idoneità e costi per un investitore italiano sono N/D.

## Regole di ammissione

La funzione di riferimento controlla classe ETF, simbolo, denominazione
coerente, valuta USD, fonte HTTPS esplicita e validità temporale di 60 giorni
dal controllo manuale. Il dato scaduto torna **N/D** automaticamente.
Il controllo umano della pagina non equivale a una verifica API continua.
Per aggiornare le fonti, leggere nuovamente la pagina ufficiale e modificarne
il dato/datetime in un commit rivisto e testato.

Il punteggio storicamente assegnato 50/100 a valuation nel Comitato è
solo un fallback tecnico. Questo intervento **non cambia** lo score, non genera
COMPRA, non modifica il motore PAPER V6, non estende approvazioni, non chiama
broker né apre LIVE.

Tracking difference rigorosa richiede rendimento NAV del fondo e relativo
indice su finestre identiche, convenzioni di valuta e reinvestimento compatibili,
date verificabili e costi effettivi. In assenza di questa prova il risultato è
**N/D**. Anche un confronto storico favorevole non è alpha forward certificata.

## Sicurezza della release

La issue #26 sulla rotazione delle vecchie credenziali dei provider resta
irrisolta senza conferma dai rispettivi account. La verifica attuale di
segreti nel repository non dimostra la revoca di credenziali già pubblicate.
La PAPER V6 mantiene la scadenza del 24 ottobre 2026 e 7/10 fill; nessuna
procedura di estensione automatica è autorizzata. LIVE resta chiuso.
