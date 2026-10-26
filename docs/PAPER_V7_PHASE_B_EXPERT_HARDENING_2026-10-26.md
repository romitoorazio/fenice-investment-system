# FENICE100K — Phase B V7: expert hardening del confine PAPER (26/10/2026)

**Decisione:** `EXPERT_PREFLIGHT_COMPLETE_WHEN_CI_GREEN` significa che i controlli
**di collaudo e verifica** funzionano; NON che la Phase B esegua PAPER operativa.
La V6 è chiusa per nuovi ordini e i sette fill storici rimangono di esclusiva
competenza V6. Capitale Phase B confermato: **10.000 EUR soltanto virtuali**.

## Modello delle minacce e mitigazioni introdotte

| Rischio | Prevenzione tecnica | Evidenza di test |
| --- | --- | --- |
| Una quotazione auto-dichiarata viene trattata come realmente certificata | `paper-v7-phase-b-offline-bridge.mjs` passa tutte le quotazioni attraverso il WORLD V7 con due provider distinti, prova diritti separata dall'observation bundle, mercato esattamente OPEN, timestamp recenti e controlli FX | No fonte, fonte sola, family duplicata per lo stesso provider, diritti vuoti, sessione chiusa, authority falsa, quote future/stale, price divergence |
| Quorum e controllo budget separati | Il bridge applica **prima** l'ammissibilità dati WORLD, **poi** lo screening economico del 3%, 250–300 EUR, max 1 UTC day / 20 tentativi, **infine** un append al registro soltanto di collaudo | Falso capitale, daily cap allargato, tentativo duplicato, storico manomesso |
| Un attaccante produce una nuova firma ed esibisce la propria chiave pubblica | Il verificatore firma ED25519 ora richiede anche **SHA-256 della chiave SPKI DER** fissato da un canale indipendente. Chiave e firma consegnate insieme non bastano | Test negative su pin assente/falso e sostituzione simultanea di chiave+firma |
| Test fittizi contabilizzati come fill prospettici | Tutte le operazioni usano esplicitamente `V7_PHASE_B_TEST_FIXTURE_ONLY`; il WORLD runner è invocato `paperRunAuthorized=false`, `intents=[]` | Zero `genuineOperationalPhaseBFills`, zero broker/LIVE, nessun ledger V6 modificato |
| Dati di esempio pubblicati o spacciati per dati di mercato autorizzati | Nessun runner network, accesso a secrets o persistenza; i test sintetici sono identificati come test | CI con diritti minimi `contents:read` e scansione segreti |

La verifica di mercato del bridge può soltanto attestare che **i campi
e le condizioni di runtime sono coerenti**. **NON può attestare la licenza
commerciale** di un feed, l'identità di chi presenta un registro di diritti
o la validità giuridica dei permessi d'uso. Una prova esterna è necessaria
prima di qualsiasi futuro percorso operativo.

Analogamente, il pin dell'operatore deve essere distribuito tramite
una procedura di fiducia indipendente, non accettato da un payload
che include anche la firma. Il collaudo genera chiavi effimere solo
durante il test CI; **non genera la firma del titolare**.

## Stato delle responsabilità

**Software finora pronto per il collaudo:**
- Capitale virtuale 10.000 EUR fissato nel manifesto e nella futura policy
  firmata; limite 300 EUR / 3%, 1 tentativo/UTC day e massimo 20.
- Ledger *fixture* con replay e riconciliazione, senza broker o I/O.
- Gate finto end-to-end quotazioni→rischio→fixture.
- Verifica offline delle firme con ancoraggio SHA-256 della chiave fidata.
- Verifiche automatiche e negative dei casi fail-closed.

**Non è stato ancora costruito o attestato:**
- Un writer operativo PAPER con persistenza **atomica**, idempotenza
  concorrente, kill switch e custodia audit sigillata indipendentemente.
- Un operatore firmatario reale, identità verificata, chiave fidata
  ancorata esternamente, consenso specifico, SHA/digest definitivo
  e data/scadenza future.
- Quorum quote, sessione e FX **reali**, autorizzazione commerciale
  di ciascuna fonte e prove legalmente utilizzabili per PAPER.
- Un ciclo reale con 30 giorni, 25 giorni di evidenze e 10 fill
  autenticamente simulati prospettici. Tutti i test valgono **0**.

**Policy di fail-closed:** senza prova completa,
`newPaperOrdersAllowed=false`, `brokerSubmissionAllowed=false`,
`liveTradingAllowed=false`. Nessuna nuova rotazione delle credenziali
correnti e nessuna modifica alla baseline V6.

## Riproduzione

```bash
node scripts/test-paper-v7-phase-b-offline-bridge.mjs
node scripts/test-paper-v7-phase-b-authorization.mjs
node scripts/test-paper-v7-phase-b-fixture-ledger.mjs
node scripts/check-paper-v7-phase-b-readiness.mjs
```

Questi test non effettuano richieste di quotazioni ai provider. Una
pipeline verde non dimostra alfa economico né PAPER certificata.
