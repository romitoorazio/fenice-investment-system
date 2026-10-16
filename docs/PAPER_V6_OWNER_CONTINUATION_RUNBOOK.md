# FENICE100K — Procedura di prosecuzione PAPER V6 (16 ottobre 2026)

## Consenso e confini tecnici

Il proprietario ha autorizzato **la preparazione** della prosecuzione della sola validazione simulata oltre il 24 ottobre 2026, preservando limiti, evidenze, impronta V6 e blocco LIVE. L'istruzione in chat non costituisce una firma crittografica sul repository e **non** è una nuova approvazione esecutiva né stabilisce una futura scadenza. Il file separato `data/paper-v6-continuation-plan.json` registra solo questa scelta preparatoria.

### Riferimenti immutabili della V6

- Inizio: **25/09/2026 15:40:35.178 UTC**, maturazione dei 30×24h dal **25/10/2026 15:40:35.178 UTC** (16:40 italiane dopo il cambio d'ora).
- Consenso V6 originale: `fenice-paper-validation-v6-2026-09-24`, termina **24/10/2026 21:59:59 UTC** (23:59:59 italiane).
- Baseline commit: `4ccb2d2c21b0545de5b99149222afa5b444bb4c2`; fingerprint SHA-256: `9af99a3da2fcebef1cf8d6e804d8717ed2bdbe89cf13c19870d0cff88d04ede8`.
- Requisiti: 30 giorni pieni, almeno 25 giornate verificate, almeno 10 fill **autentici** PAPER.
- Limiti invariati: 1 probe per giorno UTC, massimo 20 tentativi totali, 300 €/ordine, 3% capitale/probe, 15% per singolo asset, gli stessi vincoli di fonti, rischio e conversione FX.
- PAPER OMS, approval, stager, script recorder, fingerprint, workflow canonical e ledger sono **immutati**.

## Decisione operativa senza scorciatoie

1. **Prima della scadenza:** la V6 prosegue con approvazione originale, soltanto se tutte le prove, l'orologio di borsa, quote, qualità e kill switch risultano ammissibili. Il piano preparatorio **non** può generare ordini.
2. **Se 10 fill validi sono già raggiunti prima della scadenza:** non crearne altri; la campagna osserva passivamente audit, riconciliazione e giornate fino alla maturazione temporale. Il risultato numerico è soggetto a revisione indipendente, non apre LIVE.
3. **Se dopo la scadenza mancano fill:** **arrestare i nuovi probe**. Conservare in sola lettura coda/OMS, snapshot originali, digest, audit e cronologia V6. Eseguire `node --experimental-strip-types scripts/check-paper-v6-continuation.mjs`: lo stato atteso è `SEPARATE_PHASE_B_REQUIRED` e `postExpiryProbeAllowedFromPlan=false`.
4. **Per tornare a fare prove dopo scadenza:** preparare un distinto percorso **Phase B**, con approvazione autenticata, scadenza esatta e limiti non aumentati, nuova baseline/fingerprint e catena di provenienza che **collega** alla V6 storica. Prima dei nuovi ordini applicare le correzioni temporali nel nuovo core, eseguire test di rischio, secret scan, CI e revisione del proprietario. I 7 fill precedenti restano storici della V6 e **non** diventano fill della nuova baseline, salvo metodologia di equivalenza indipendente formalmente convalidata.
5. Se evidenze, digest, conteggi o ordini in coda risultano incoerenti, sospendere e avviare revisione: non modificare retroattivamente i record.

## Collaudo riproducibile e prove di custodia

```bash
node --experimental-strip-types scripts/test-paper-v6-continuation.mjs
node --experimental-strip-types scripts/check-paper-v6-continuation.mjs
node scripts/scan-repository-secrets.mjs
```

Il preflight è una lettura pura e verifica fingerprint **ricalcolato** dei file V6 congelati; confronta l'approvazione originale con tutti i limiti e i contatori del ledger con la cronologia del calendario. Test negativi: falsificazione data scadenza, modifica cap, digest alterato, fill inventato/post-scadenza, queue pendente dopo scadenza, clock non valido, broker/LIVE attivati. Fallisce in modo chiuso (`exit 2` per dati incoerenti).

Nessun segreto, token, saldo reale o password deve essere pubblicato nei log o nei file di piano. **Nessun nuovo provider a pagamento**. L'autorizzazione a predisporre la continuazione non modifica `data/paper-validation-approval.json` o `data/paper-validation-campaign.json` e non prolunga magicamente il consenso operativo originale.
