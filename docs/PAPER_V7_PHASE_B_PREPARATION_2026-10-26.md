# FENICE100K — V7 Phase B PAPER: preparazione autorizzata, esecuzione NON approvata

**26 ottobre 2026 · proposta tecnica, non autorizzazione operativa**

Il proprietario ha autorizzato in chat la **preparazione** della futura Phase B
PAPER V7 con i limiti dichiarati. Questo consenso conversazionale non prova
identità/firma sul repository, non sceglie la baseline definitiva, non indica
una scadenza operativa e **non è un permesso di creare nuovi fill PAPER**.

## Artefatti introdotti

- `data/paper-v7-phase-b-preparation.json`: manifesto della proposta,
  `PREPARATION_ONLY`, `approved=false`, scadenza nulla, baseline finale
  nulla, nuove operazioni non autorizzate.
- `lib/ui/paper-v7-phase-b-preparation.mjs`: controllo puro di custodia
  V6 e confronto puntuale dei limiti proposti con V6; il suo esito
  `PREPARATION_SAFE_UNAPPROVED` **non** abilita nuovi ordini.
- `scripts/check-paper-v7-phase-b-preparation.mjs`: report di sola lettura.
- `scripts/test-paper-v7-phase-b-preparation.mjs`: regressioni negative per
  approvazioni false, digest/storia falsificati, limiti più larghi e LIVE.
- Workflow dedicato con soli permessi `contents: read` e scansione segreti.

## Limiti proposti, non esecutivi

| Proprietà | Proposta |
| --- | ---: |
| Capitali reali | 0 € |
| Operazioni | Esclusivamente simulate PAPER, previa nuova approvazione |
| Notional massimo per probe | 300 € virtuali |
| Massimo percentuale per probe | 3% del capitale teorico |
| Operazioni al giorno | Massimo 1 per giorno UTC |
| Tentativi | Massimo 20 |
| Obiettivo fill nuovi | Minimo 10 genuini |
| Durata osservazione | Almeno 30 giorni, 25 con evidenza valida |
| Controlli quote | Due famiglie indipendenti, FX e orario borsa ammissibili |
| LIVE / Directa broker write | Sempre bloccato |

La V6 è scaduta il 24 ottobre 2026 alle 21:59:59 UTC, con 7 fill
genuini su 10. Rimangono nel **registro storico V6**, e contano come
**zero** fill Phase B. I suoi file core, OMS, approvazione, fingerprint
e registro di audit non vengono modificati da questa proposta.

### Cosa manca prima di una nuova approvazione esecutiva

1. Definire **nuova baseline SHA e digest**, separata dalla V6, con
   revisione delle correzioni ai timestamp futuri/impossibili (issue #214 /
   PR #224) nel **nuovo core**, testata senza sovrascrivere V6.
2. Collaudare market-data quorum, prezzi e FX freschi, calendario,
   anti-duplicati, gestione rischi, kill switch, idempotenza, audit e
   riconciliazione sul nuovo codice.
3. Sottoporre una distinta autorizzazione PAPER verificabile con **data
   di inizio e scadenza future esplicite**, limite di tentativi e policy,
   prima di qualsiasi ordine simulato. Nessuna auto-approvazione.
4. Avviare solo allora una nuova campagna indipendente, preservando
   integralmente la prova V6 e il blocco LIVE; nessun fill retrodatato.

### Chiavi API

Nessuna rotazione, lettura, copia o sostituzione delle credenziali correnti
è prevista. Rimane distinta la verifica storica non conclusa sulle chiavi
che comparivano in vecchie revisioni (issue #26): non attestare
automaticamente una revoca già eseguita.

### V7 SHADOW

I workflow prospettici già programmati possono continuare in sola ricerca.
La quantità di risultati futuri non si anticipa e nessun backtest
sostituisce dati raccolti dopo il segnale.

**Verifica locale riproducibile:**
```bash
node scripts/test-paper-v7-phase-b-preparation.mjs
node scripts/check-paper-v7-phase-b-preparation.mjs
```

L'esito atteso del preflight è `PREPARATION_SAFE_UNAPPROVED` con
`allowsNewPaperFills=false`, `brokerSubmissionAllowed=false` e
`liveTradingAllowed=false`. Un risultato verde non è certificazione PAPER.
