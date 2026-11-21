# FENICE — audit A–Z, inventario e piano di verifica (2026-11-06)

## Perimetro e limiti
Inventario ricavato dalla tree GitHub non troncata del commit `d10f16246eaf58fd3f77170c5de994e9f8104d11`: **4.293 file**, di cui **3.507 sotto data/**, **218 sotto lib/**, **324 sotto scripts/**, **98 workflow sotto .github/workflows/** e **204 file scripts/test***. Questo documento è un **audit preliminare basato su inventario e ispezione mirata**; NON è una certificazione A–Z, non prova l'esecuzione di tutti i test, né certifica PAPER reali.

## Riscontri verificati (evidenza nel codice)
| ID | Gravità | Evidenza | Azione / criterio di chiusura |
| --- | --- | --- | --- |
| A01 | Alta | `.github/workflows/fenice-one-global-contracts.yml` aveva `concurrency.group` costante e `cancel-in-progress: true`: PR indipendenti si annullavano a vicenda. | Gruppo per PR/ref modificato in questa branch; attendere CI PASS. |
| A02 | Bloccante PAPER reale | `lib/global/paper-shadow-pipeline.mjs` è una funzione pura che riceve quote/calendario/FX/fill dall'esterno; non recupera né persiste evidenze di mercato. | Realizzare e testare orchestratore read-only con quote e calendari autentici, errori espliciti e audit persistente. |
| A03 | Bloccante PAPER reale | `scripts/test-fenice-one-global-pipeline.mjs` usa `synthetic-contract`, `synthetic-calendar`, quote e FX statici. | Prova end-to-end distinta dai fixture, con origine, timestamp, venue, valuta, due famiglie indipendenti e zero dati inventati. |
| A04 | Alta | `lib/global/venue-session-evidence.mjs` accetta `authoritative: true` dichiarato dal chiamante; non verifica l'autorità della fonte. | Registro allowlist delle fonti calendario e verifica provenienza reale; test su falsificazione e ferie/DST. |
| A05 | Alta | `lib/global/quote-provider-adapter.mjs` marca le risposte `PROVIDER_RESPONSE_UNVERIFIED`; il bridge Twelve Data rifiuta correttamente quote senza bid/ask. | Non considerare una risposta HTTPS prova indipendente; connettere almeno due fonti che offrano spread eseguibili, senza derivare bid/ask dal close. |
| A06 | Alta | `lib/global/evidence-bundle.mjs` e `runPaperShadow` non condividono ancora un unico criterio di attestazione end-to-end; i fixture sintetici sono ammessi nei test. | Separare rigorosamente modalità test e campagna PAPER reale, con attestazione obbligatoria al confine di esecuzione. |
| A07 | Alta | `lib/global/virtual-ledger.mjs` produce hash e deduplica in memoria ma non scrive né carica un ledger durevole. | Persistenza atomica, replay dopo riavvio, lock/idempotenza concorrente, artifact firmato e riconciliazione. |
| A08 | Alta | `.github/workflows/fenice-one-global-contracts.yml` esegue secret scan e 9 test di contratto, non un ciclo PAPER con dati live. | Workflow separato di audit read-only, con diagnostica di provider, sessioni e motivi di blocco; non presentare i contract PASS come PAPER PASS. |
| A09 | Operativa | Il cron `*/5` dei workflow GitHub Actions gira soltanto dal default branch e non garantisce puntualità. | Verificare deploy su main prima di dichiararlo attivo; registrare last-run, ritardi e risultati. |
| A10 | Architetturale | Esistono almeno due percorsi: `fenice-unica-paper-cycle.yml` (read-only, dispatch/PR main) e `fenice-one-global-contracts.yml` (contratti). | Mappare esecuzioni V6/V7/V8/Unica/ONE GLOBAL, proprietario del ledger e fonte unica di verità, senza mutare lo storico. |

## Checklist A–Z di completamento
1. **Repository e CI:** inventario dei 98 workflow; permessi minimi; workflow duplicati e cancellazioni; secret scan; build/lint/test; dipendenze; protezioni branch.
2. **Mercati mondiali:** MIC, identità strumento, listing, fuso, DST, festività, sessioni, halt, asta, sospensioni, delisting.
3. **Dati:** provider reali e licenze; disponibilità bid/ask; timestamp; latenza; rate limit; API error; valuta; fonte indipendente; quorum.
4. **FX:** EUR e tutte le valute supportate; convenzione di quotazione; indipendenza; timestamp; consenso e conversioni.
5. **Segnali e strategia:** criteri riproducibili; universi Asia/Europa/Americhe paritari; rischio, commissioni, liquidità, survivorship e look-ahead bias.
6. **PAPER:** generazione segnali, fill realistici, spread, costi, FX, ledger persistente, replay, dedupe, concorrenti, report P&L e prove scaricabili.
7. **Sicurezza:** isolamento broker/Directa, no LIVE, chiavi intatte, fail-closed, controlli contro dati sintetici scambiati per reali.
8. **Operatività:** heartbeat, diagnostica dei blocchi, monitoraggio cron, recovery e report giornaliero senza falsi successi.

## Criterio di successo
NON dichiarare FENICE ONE GLOBAL completata finché una campagna PAPER reale e verificabile non dimostra: sessione di una borsa effettivamente aperta, quotazioni da almeno due famiglie indipendenti, bid/ask e FX verificati, segnale con timestamp, fill virtuale senza look-ahead, ledger durevole con replay e report auditable. Nessun collegamento LIVE/Directa richiesto per questo audit.

## Sicurezza del lavoro
Branch e PR in bozza, senza merge su main, senza modifiche a segreti, broker, core storico V8 o ledger preesistenti.
