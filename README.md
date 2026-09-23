# Fenice Investment System

Software di supporto decisionale e validazione PAPER per il **Progetto 100.000 €** di Orazio.

Fenice analizza autonomamente mercati, macroeconomia, geopolitica, fondamentali, aziende innovative e strumenti emergenti con un orizzonte di lungo periodo. Il capitale reale resta separato dalla campagna di validazione.

## Regola fondamentale

```text
Analisi autonoma: SÌ
Scoperta nuovi strumenti: SÌ
Ordini PAPER di validazione: SÌ, entro gate e limiti fail-closed
Ordini LIVE: NO
Connettività broker LIVE: NO
Spostamento denaro reale: NO
Certificazione prima del pilot reale: OBBLIGATORIA
```

La campagna PAPER attiva richiede 30 giorni di calendario, almeno 25 giorni di evidenza valida e almeno 10 fill PAPER, mantenendo audit, riconciliazione, fingerprint del core e blocco LIVE. Un fill PAPER non equivale ad autorizzazione a investire capitale reale.

La pagina `/readiness` mostra l'avanzamento reale della certificazione: giorni di evidenza, fill, audit/reconciliation, execution quality, live-lock e ridondanza delle famiglie dati.

## Fenice Autopilot

Il motore autonomo:

- osserva azioni, ETF, benchmark, obbligazioni, crypto e altre classi disponibili;
- cerca IPO, nuove quotazioni e depositi SEC S-1, F-1, 8-A e 10-12B;
- legge inflazione, tassi, volatilità, occupazione e curva dei rendimenti;
- cerca società private, round di finanziamento, biotech e tecnologie emergenti nelle notizie globali;
- esegue ricerca fondamentale e cross-check multi-fonte;
- calcola opportunità, rischio, fiducia e verdetto;
- applica gate operativi, risk engine, audit e riconciliazione;
- salva evidenza e storico per rendere verificabile la readiness.

La pagina `/autonomia` mostra fonti, copertura, strumenti, segnali emergenti, limiti e stato dell'ultimo rapporto.

## Fonti dati

Fonti pubbliche o utilizzabili senza chiave quando previste dal relativo collector:

- SEC EDGAR;
- GDELT;
- CoinGecko pubblico con limiti;
- fonti di validazione pubblica che restano escluse dal quorum PAPER se provenienza/entitlement non sono provati.

Con chiavi GitHub Actions:

- `TWELVE_DATA_API_KEY` per una famiglia realtime del quorum PAPER, solo quando venue, freshness e provenance superano i gate;
- `ALPACA_API_KEY` + `ALPACA_API_SECRET` (oppure gli alias `APCA_API_KEY_ID` + `APCA_API_SECRET_KEY`) per Alpaca Basic/IEX;
- `ALPHA_VANTAGE_API_KEY` per analisi di mercato e come candidato execution solo con entitlement realtime effettivamente dimostrato;
- `FRED_API_KEY` per macroeconomia;
- `COINGECKO_API_KEY` per accesso crypto più stabile;
- `COINGECKO_PRO_API_KEY` per i token più recenti;
- `SEC_USER_AGENT` per identificare correttamente le richieste SEC.

Il quorum PAPER minimo corrente è di 2 famiglie indipendenti verificate; l'obiettivo professionale preferito è 3. Una nuova famiglia non viene promossa durante una campagna attiva se la modifica richiede di alterare il core fingerprintato: viene preparata e validata per una futura baseline.

Vedere:

- [docs/AUTONOMY.md](docs/AUTONOMY.md) per configurazione, copertura e limiti;
- [docs/MARKET_DATA_THIRD_SOURCE.md](docs/MARKET_DATA_THIRD_SOURCE.md) per la valutazione della terza famiglia dati.

## Sicurezza della baseline PAPER

La campagna usa un fingerprint SHA-256 di un insieme esplicito di file core: OMS, risk, market-data/quorum, audit/recovery, broker boundaries, certificazione e workflow principali. Se uno di questi file cambia durante la campagna, la nuova evidenza non deve essere accettata come equivalente alla baseline iniziale.

Documentazione, esempi di ambiente e UI possono essere migliorati senza mutare il motore validato, purché la CI confermi che i gate della campagna restano integri.

## Automazione

Fenice usa GitHub Actions sia per l'analisi autonoma sia per la raccolta/verifica dell'evidenza PAPER. I workflow mantengono il principio fail-closed: una fonte mancante, stantia, non autorizzata o non verificabile non viene elevata artificialmente a fonte PAPER.

I principali output operativi sono salvati sotto `data/`, inclusi snapshot di intelligence, market-data evidence, audit/reconciliation e stato della campagna PAPER.

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

La readiness istituzionale include inoltre test su rischio, routing, market-data quorum, execution quality, audit, recovery e campagna PAPER.

## Architettura principale

- `app/page.tsx`: dashboard principale;
- `app/autonomia/page.tsx`: centro di controllo autonomo;
- `app/readiness/page.tsx`: stato di certificazione e controlli istituzionali;
- `lib/trading/`: risk, OMS PAPER, SOR, market data, audit/recovery e readiness;
- `scripts/`: collector, verifiche, ciclo PAPER e certificazione;
- `data/`: evidenza operativa e storico.

## Limite realistico

Nessuna singola fonte gratuita copre ogni borsa, mercato OTC, società privata, round non annunciato, token appena creato o strumento non regolamentato. Fenice usa quindi ridondanza, provenienza, freshness e cross-check; quando l'evidenza non è sufficiente, deve degradare o bloccare invece di inventare copertura.

> Fenice è uno strumento di analisi, screening e validazione PAPER. Non costituisce consulenza finanziaria e non è autorizzato a eseguire ordini LIVE o muovere capitale reale.
