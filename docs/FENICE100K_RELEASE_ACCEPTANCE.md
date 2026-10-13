# FENICE100K — collaudo finale della release di ricerca

Data della prima verifica: **13 ottobre 2026**. Target progetto: **31 ottobre 2026**.

## Cosa significa «completare» onestamente

La release di ricerca può essere utilizzabile per **consultare opportunità e motivazioni** quando qualità dati e controlli software sono aggiornati. Non equivale a:
- profitto netto dimostrato, NAV Directa riconciliato o obiettivo 10x già raggiunto;
- feed multi-borsa in tempo reale o fonte market data con quorum execution per ogni titolo;
- **PAPER certificata** o esecuzione automatica LIVE;
- autorizzazione a rinnovare o creare permessi, falsificare fill o retrodatare prove.

La schermata `/readiness` include un collaudo dinamico che non conferisce permessi (`lib/ui/fenice100k-release-gate.mjs`). Ogni gate è indipendente. Il codice **non deve mai inferire la verifica del commit Vercel attuale da una prova CI storica**, né dichiarare attendibile un profitto perché è positivo un backtest.

## Quattro gate da non confondere

| Gate | Cosa serve | Stato della prima verifica (13/10/2026) |
|---|---|---|
| Data Quality | Source report GREEN, timestamp e decisioni aggiornati, evidenza per titolo | Source score 94/100; 19 titoli; prezzi research timestamped parziali |
| Risk/System | Test/CI sul codice corrente, integrità, kill switch, policy e isolamento | Evidenza di CI principale disponibile, ma ogni SHA di produzione richiede controllo separato |
| PAPER Certification | Durata minima 30 giorni, >=25 giorni di prove, >=10 fill genuini, quorum ed audit integri | Campagna iniziata 25/09/2026, 18 giorni nel registro al 12/10, 7/10 fill. Non certificata |
| Live Lock | Esecuzione denaro reale impedita e autorizzazione umana esplicita | LOCKED; non abilitarla con questa release |

## Evidenza economica che manca

- Forward-only SHADOW: nuove osservazioni iniziate il **13 ottobre**, senza rivalutazione retrospettiva di record storici privi di timestamp originario.
- Confronto coerente con SPY/cash, dopo costi teorici e su **giornate d'ingresso indipendenti**; almeno 30 coppie e 30 date diverse a 7d e 30d per maturità **numerica**, che non prova comunque un vantaggio investibile.
- Segnali `COMPRA` prospettici realmente registrati, senza selezione ex post; nessun ritorno del broker `Directa` è stato verificato o riconciliato.
- Il primo checkpoint di 30 giorni per gli esperimenti del 13/10 non potrà maturare prima del **12 novembre 2026**, ben dopo l'obiettivo di rilascio del 31/10.

## Azioni P0, P1 e condizioni di sicurezza

1. **P0**: conservare freeze V6, verificare nuove prove PAPER e scadenza approvazione **24/10/2026 21:59:59 UTC**. La durata minima della campagna matura non prima di **25/10/2026 15:40:35.178 UTC**. Se mancano fill occorre revisione umana; nessun rinnovo autonomo.
2. **P0**: source timestamp e market-session coerenti; mai sostituire l'orario del rapporto all'orario di ultimo scambio. Solo fonti lecite e con policy costi rispettata.
3. **P1**: archivio decisioni congelate, successivi prezzi osservati, benchmark, costi/FX e stress senza look-ahead; contraddizioni e campioni insufficienti devono mostrare N/D.
4. **P1**: verifica *eventuale* broker Directa via dispositivo locale autorizzato in **sola lettura**; indisponibilità => N/D, niente ordini.
5. **P2**: dashboard chiara, spiegazioni IA basate su evidenze, regressioni negative, release candidate documentata.

## Accettazione software

La qualità di una release va confermata contro **lo SHA esatto** nel repository e in Vercel, con controlli GitHub verdi e assenza di errori runtime. L'engine di collaudo è **solo informativo**, non un attestato di compliance o un certificato economico.

Comandi di test aggiunti:
```
node scripts/test-fenice100k-release-gate.mjs
node --experimental-strip-types scripts/test-paper-certification-window.mjs
```

Le prove di requisito temporale e gli esiti SHADOW non sono comprimibili: **non si deve dichiarare «tutto completato oggi» quando questi controlli non sono ancora soddisfatti**.
