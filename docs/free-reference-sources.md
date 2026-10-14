# FENICE100K — Fonti di riferimento gratuite (solo ricerca)

Questa integrazione è **separata dal core PAPER V6 congelato** e non abilita ordine broker, quorum PAPER, quotazioni realtime o operatività LIVE. I risultati identificano strumenti e qualità dei dati: **non sono raccomandazioni di trading**.

## Avvio (nessuna credenziale necessaria per OpenFIGI, SEC, ESMA)

```bash
node scripts/test-free-reference-sources.mjs
node scripts/check-free-reference-sources.mjs
# Opzionale, crea solo data/free-reference-source-status.json:
node scripts/check-free-reference-sources.mjs --write
```

Le richieste di prova sono limitate a: OpenFIGI una POST fino a 5 ISIN dall'anagrafica Fenice; SEC un issuer Apple CIK 0000320193; ESMA un documento indice (`rows=1`); nessun download FIRDS massivo. Quando ESMA blocca l'accesso/risponde HTML, il report indica FAILED: **non bypassare captcha o condizioni di accesso**.

| Fonte | Stato della configurazione software | Requisiti per uso più ampio |
| --- | --- | --- |
| OpenFIGI | Adapter e mapping ISIN attivi su esecuzione esplicita | Chiave facoltativa `OPENFIGI_API_KEY`, per quote maggiori; non salva FIGI ambiguo |
| SEC Companyfacts | Già usata da `scripts/run-fundamental-engine.mjs`; prova indipendente aggiunta | `SEC_USER_AGENT` identificabile, limiti SEC fair access e caching |
| ESMA FIRDS | Verifica indice; **NON** import full/delta | Pipeline ETL XML/ZIP, checksum, ISIN+MIC, limiti e provenienza |
| FINRA Public | OAuth e controllo già presenti in `scripts/check-global-sources.mjs` | Account personale FINRA + `FINRA_CLIENT_ID`, `FINRA_CLIENT_SECRET` nei secrets GitHub/Vercel, mai nel repository |
| Nasdaq Data Link | Adapter opt-in su dataset esplicitamente scelto | `NASDAQ_DATA_LINK_API_KEY`, `NASDAQ_DATA_LINK_DATASET` (es. solo se verificato come gratuito), `NASDAQ_ALLOW_FREE_DATASET_PROBE=1` |
| Borse ufficiali | Mappatura 43 mercati europei già esistente in `data/europe-market-registry.json` | Downloader per ogni Borsa con verifica licenze e disponibilità, no equivalenza con feed realtime |

**Privacy e sicurezza:** le credenziali si impostano solo in GitHub Actions/Vercel come secrets, mai in chat o in commit. L'output non stampa chiavi, URL con API key, token o dati grezzi dei bilanci. Il risultato FINRA è una lettura dell'ultimo rapporto già salvato (non una nuova connessione). Le verifiche di sorgente sono `RESEARCH_ONLY` e non modificano punteggi, proposte di acquisto, portafogli, autorizzazioni, ordini, code, prezzi PAPER o LIVE.

**Rate limits:** OpenFIGI anonimo usa limiti pubblici e batch fino a 5 per sicurezza. SEC un sample e una identificazione User-Agent. Nessuna chiamata automatica Nasdaq a dataset commerciali; l'opt-in va effettuato solo dopo verifica di gratuito/permessi. Nessun processo distribuito di download di tutti i 205.757 riferimenti: servirà un servizio di caching, identity resolution e priorità.

Documentazione ufficiale:
- OpenFIGI https://www.openfigi.com/api/documentation
- SEC https://www.sec.gov/edgar/sec-api-documentation
- ESMA https://registers.esma.europa.eu/publication/searchRegister?core=esma_registers_firds_files
- FINRA https://developer.finra.org/docs
- Nasdaq Data Link https://docs.data.nasdaq.com/v1.0

## Verifica di accettazione

1. Test offline green con risposta valida, ambigua, vuota e rate-limit.
2. L'output non dichiara esecuzione PAPER o LIVE.
3. I primi due adapter rispondono con dati validi solo quando una esecuzione *reale* li controlla; gli endpoint bloccati restano FAILED.
4. FINRA resta NOT_CONFIGURED in assenza dei due secrets; Nasdaq resta NOT_CONFIGURED senza consenso esplicito sul dataset.
5. Il core V6 e `data/global-source-registry.json` rimangono invariati.
