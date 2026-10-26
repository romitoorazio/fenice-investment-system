# FENICE100K — Audit della baseline tecnica candidata V7 Phase B

**26 ottobre 2026 | Solo riferimento tecnico, non certificato e non autorizzato.**

## Cosa è stato controllato

Il commit `8e8ae4ebb3d547e1f61605f58791be4a853b5c1d`
è un **riferimento storico immutabile** per sette file del simulatore
V7 e del suo bridge dati privato. I sette hash Git dei file sono
elencati in `data/paper-v7-phase-b-candidate-reference.json`.

`node scripts/check-paper-v7-phase-b-candidate.mjs` verifica:
- che il commit e tutti i blob siano effettivamente recuperabili
  da Git e identici ai file dell'HEAD in esame;
- che il fingerprint completo della **vecchia V6**, ricalcolato dai
  suoi file protetti, rimanga uguale al digest storico;
- che il manifesto Phase B continui `PREPARATION_ONLY`;
- il limite numerico per posizione e il capitale virtuale iniziale
  del simulatore isolato; le differenze con i limiti Phase B approvati
  alla sola preparazione vengono riportate come **BLOCCANTI**.

Questo calcolo riproducibile della candidata SHA-256 **non** sostituisce
una baseline Phase B definitivamente selezionata o un'attestazione di
operatività autorizzata. Se un blob differisce, l'audit fallisce.

## Problemi tecnici reali da correggere nella nuova fase

| Vincolo Phase B | Situazione motore WORLD PAPER V7 | Risultato |
| --- | --- | --- |
| Capitale teorico adeguato per probe 250–300 EUR e cap 3% | Seed `1.000 EUR`; il 3% è `30 EUR` | INCOMPATIBILE |
| Cap per ordine 3% del capitale virtuale | Motore isolato: `MAX_POSITION_FRACTION=0.05` (5%) | INCOMPATIBILE |
| 1 tentativo/ordine al giorno UTC e max 20 tentativi | Mancano attestazione e collegamento a un ledger Phase B indipendente | NON VERIFICATO |
| 10 nuovi fill, 30 giorni, 25 giorni validi | Solo preparazione; la V6 ha 7 fill storici, nessuno attribuibile a Phase B | NON AVVIATO |
| Due fonti indipendenti con diritti di utilizzo, prezzo FX e sessione OPEN | Il runner pubblico V7 passa liste vuote, `paperRunAuthorized:false` | DATI DI ESECUZIONE NON ATTESTATI |
| Approvatore, SHA/fingerprint finale, scadenza futura e consenso specifico | `approved:false`, `expiresAt:null` | NON AUTORIZZATO |
| Directa, broker e denaro reale | non consentiti | BLOCCATI |

Il motore V7 ha già controlli severi contro quote future, timestamp
impossibili e fonti non indipendenti. La PR #224 applica controlli
analoghi al core V6 congelato: **non fonderla direttamente** nella
V6 senza la procedura distinta di migrazione della baseline.

## Prossima implementazione richiesta

1. Progettare il **nuovo** adattatore Phase B sul motore V7 separato,
   con capitale teorico coerente con 3%, max 300 EUR e max uno
   per giorno; non modificare i file V6 protetti.
2. Legare il limite di 20 tentativi e l'unicità dei fill a un
   registro append-only, senza retrodatare né riciclare i fill V6.
3. Dimostrare da una fonte esterna il diritto alla quotazione e i
   due provider indipendenti per i soli strumenti ammessi.
4. Completare il collaudo della baseline **dopo** le correzioni,
   e solo a quel punto sottoporre al proprietario un'autorizzazione
   Phase B **specifica e temporalmente limitata**.
5. Senza tutti questi requisiti: `mayProducePhaseBFills=false`,
   `liveTradingAllowed=false`; mantenere SHADOW autonomo.

Nessuna modifica alle chiavi API correnti è necessaria per questo audit.
La verifica storica di issue #26 rimane separata.

**L'esito atteso di un CI verde è
`CANDIDATE_BLOCKED_FOR_PHASE_B_EXECUTION`: il software di audit
funziona perché identifica gli impedimenti, NON perché certifica la
possibilità di generare PAPER.**
