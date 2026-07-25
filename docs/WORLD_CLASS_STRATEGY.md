# Fenice: strategia di prodotto mondiale

## Decisione

Fenice non deve copiare ProRealTime, TradingView, FinChat, Danelfin, Trade Ideas o Composer. Deve diventare il livello di intelligence che unifica le loro migliori funzioni, mantenendo charting ed esecuzione su terminali specializzati finché dati, licenze e broker non rendono conveniente internalizzarli.

## Posizionamento

Fenice sarà un **Investment Intelligence Operating System** con cinque motori separati:

1. **Research Engine** — bilanci, KPI, filings, earnings call, stime, notizie e macro con citazioni e tracciabilità.
2. **Scoring Engine** — punteggi fondamentali, tecnici, sentiment, qualità dati e rischio per più orizzonti temporali.
3. **Strategy Lab** — regole visuali, backtest walk-forward, costi, slippage, benchmark e analisi dei drawdown.
4. **Signal Engine** — scanner intraday, alert, spiegazioni, invalidazione del segnale e controllo regime.
5. **Execution Gateway** — paper trading prima; broker reale solo con conferma umana, limiti di rischio e audit completo.

## Integrazioni

### ProRealTime

- Esportazione automatica della watchlist Fenice in TXT/CSV.
- Generazione futura di codice ProScreener, ProBuilder e ProOrder.
- Ponte locale Windows opzionale per ricevere dati DDE quando ProRealTime è aperto.
- Nessuna dipendenza da ProRealTime per il motore fondamentale o per il ranking Fenice.

### TradingView

- Generazione Pine Script per indicatori e strategie Fenice.
- Ricezione webhook firmati dagli alert TradingView.
- Verifica del segnale dentro Fenice prima di qualunque azione.

### Provider esterni

- Danelfin può essere usato come segnale indipendente tramite API, non come unica fonte.
- Provider fondamentali e transcript saranno scelti con fallback multipli e controlli di licenza.
- I provider professionali saranno aggiunti come adattatori sostituibili.

## Regole non negoziabili

- Un segnale forte richiede almeno due famiglie di dati indipendenti.
- Nessun backtest può usare dati futuri o universi sopravvissuti.
- Costi, spread, slippage e delisting devono essere inclusi.
- Ogni punteggio deve mostrare fonte, timestamp e confidenza.
- Nessun ordine reale senza conferma umana esplicita.
- Ogni modello deve essere confrontato con benchmark e strategia passiva.

## Priorità di sviluppo

1. Copertura prezzi e fondamentali affidabile.
2. Modello dati societario normalizzato.
3. Terminale di ricerca con risposte citate.
4. Scoring multi-orizzonte e validazione storica.
5. Strategy Lab e paper portfolio.
6. TradingView webhook e generatori Pine Script.
7. Generatori ProRealTime e ponte DDE Windows.
8. Broker gateway con risk engine e approvazione umana.

## Criterio di successo

Fenice non sarà definito “migliore” per il numero di grafici o indicatori. Sarà migliore quando ogni decisione sarà più spiegabile, più verificabile, più personalizzata e più disciplinata rispetto all'uso separato delle singole piattaforme.
