# ONE GLOBAL: report per-borsa su fonti e diritti PAPER
10 novembre 2026 · Intervento 2 della strategia unificata.

Questo aggiornamento riutilizza i dati reali già raccolti dai workflow mondiali e non esegue nuove chiamate a provider, non pubblica prezzi proprietari e non attribuisce artificialmente idoneità a ordini simulati.

## Risultati verificati allo snapshot

- **Milano XMIL / ENEL**: analisi Alpha Vantage respinta per mismatch simbolo, dati intraday Twelve Data non qualificati; il catalogo diagnosticato indica un piano `Pro`. Nessuna coppia di fornitori indipendenti abilitati o prova autorevole dell'apertura del segmento.
- **Francoforte XETR / DTE**: 100 barre giornaliere e 13 giorni di ricerca storica ma mapping `DTE.DEX` provvisorio. Il catalogo Twelve Data segnala `Grow`. Questi dati NON sono prezzi real-time eseguibili e l'osservazione del provider è datata.
- **Tokyo XTKS / 7203**: mapping storico `7203.TYO` non ammesso. Il controllo di apertura del provider cita `XJPX`, un mercato aggregato che non verifica direttamente la sessione `XTKS`. Mancano due feed indipendenti e un cambio JPY/EUR real-time abilitato.
- **US XNAS/XNYS/ARCX**: V8 gestisce prove PAPER **tecniche** su un gruppo ristretto di strumenti, ma non autorizza automaticamente la strategia mondiale. I dati di coverage persistentemente salvati possono essere vecchi; il report marca esplicitamente la loro età.
- **BVMF e XASX**: nessun feed pilota qualificato.

## Cos'è stato sviluppato

`scripts/diagnose-one-global-venues.mjs` produce per otto mercati: provenienza della prova, timestamp, età, fonte/costo dichiarato dal catalogo, identificativo esatto MIC e motivazioni di esclusione. Il parser non eleva MAI diagnosi one-provider o barre EOD a quotazioni certificate. Rifiuta i file in cui compaiano flags LIVE/PAPER impropri o dati di quote illecitamente ripubblicati.

`scripts/test-one-global-venue-readiness.mjs` collauda i dati persistiti e prova il rifiuto di manomissioni: false autorizzazioni, MIC errato, prezzo pubblicato, prove temporali dal futuro e ipotesi errate di indipendenza. Il workflow già presente `Fenice ONE GLOBAL — Unified PAPER Evidence` pubblica insieme tre artefatti: report PAPER unificato, diagnostica segnali e diagnostica otto mercati.

## Cosa occorre per procedere alle vere simulazioni strategiche mondiali

1. Verificare la disponibilità di feed indipendenti legalmente utilizzabili per PAPER, possibilmente senza canoni, su XMIL/XETR/XTKS. La dicitura Grow/Pro nei cataloghi rilevati non è un'autorizzazione a sottoscrivere servizi a pagamento.
2. Risolvere l'identità titolo e borsa (MIC/ISIN), con timestamp di sessione autorevole. Tokyo deve provare XTKS, non inferirlo da XJPX.
3. Ottenere FX realtime documentato e compatibile con uso PAPER per titoli non-EUR.
4. Solo dopo consentire un ciclo prospettico di strategia con autorizzazione dedicata e ledger attestabile. Non convertire i risultati tecnici V8 o lo storico di ricerca in trade certificati.

Resta invariato: **LIVE Directa OFF, costi/chiavi immutati, nessun storico riscritto, nessun credito Phase 9**.
