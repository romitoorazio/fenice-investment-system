# Fenice — Decision packet PAPER Phase B e V7 forward (26/10/2026)

**Stato: PROPOSTA PER REVISIONE, NON AUTORIZZAZIONE ESECUTIVA.**
Questo documento non contiene credenziali e non crea/riattiva PAPER, non abilita
Directa, non permette operazioni LIVE e non altera alcun file della baseline V6.

## 1. Fatto osservato: cosa rimane della V6

| Punto | Evidenza | Stato |
| --- | --- | --- |
| Campagna V6 | iniziata 25/09/2026 15:40:35.178 UTC, >=30 giorni, >=25 giorni validi, >=10 fill reali PAPER | finestra temporale maturata |
| Ultima evidenza | 26/10/2026, 32 righe giornaliere, **7 fill su 10**; audit chain e riconciliazione in ordine | target fill incompleto |
| Autorizzazione originale | `fenice-paper-validation-v6-2026-09-24`, scadenza **24/10/2026 21:59:59 UTC** | SCADUTA |
| Fingerprint di custodia | digest SHA-256 `9af99a3da2fcebef1cf8d6e804d8717ed2bdbe89cf13c19870d0cff88d04ede8` | deve restare verificabile e immutato |
| Capitale reale / broker | nessuna autorizzazione di invio ordini, `liveTradingAllowed=false` | BLOCCATO |

**Decisione:** NON rinnovare la V6, NON creare tre fill artificiali,
NON conteggiare di nuovo i vecchi sette fill, NON retrodatare osservazioni.
Conservare OMS, queue, campagna, fingerprint e audit originali in sola lettura.

## 2. Condizioni per proporre una nuova Phase B

La Phase B è **una campagna diversa**, non una proroga implicita della V6.
Prima di presentare la proposta di consenso esecutivo al proprietario:

1. **Baseline distinta:** selezionare SHA di codice esatto; documentare e
   verificare un fingerprint nuovo dei componenti Phase B, preservando
   integralmente la baseline V6. Le correzioni di controllo temporale
   future/non plausibili richiamate dalle issue #214 e PR #224 vanno valutate
   e collaudate sul core nuovo, non inserite retroattivamente nella V6.
2. **Autorizzazione umana specifica:** ID univoco Phase B, titolare, finalità
   solo PAPER, SHA/fingerprint di riferimento, ora di inizio e **scadenza
   esplicita futura**, limiti, test negativi, procedura di arresto. Questo file,
   una chat generica o un workflow verde NON valgono come approvazione.
3. **Limiti non più permissivi di V6:** max 1 ordine simulato al giorno UTC,
   max 20 tentativi per il target 10 fill, max 300 EUR e 3% del capitale per
   ordine, max 15% sul singolo asset, score comitato >=70, data confidence
   >=90, risk score <=75, FX USD/EUR originale da Twelve Data con age
   massimo 120 secondi e mai una conversione sintetica di stress.
   L'eventuale probe da 250–300 EUR resta solo nel simulatore.
4. **Market-data quorum:** almeno due famiglie indipendenti ammissibili
   (Alpaca e Twelve Data quando coerenti), quote datate e verificabili,
   sessione realmente aperta, spread/outlier e freshness validati. Il
   segnale research-only non diventa execution price per comodità.
5. **Controlli tecnici:** test di rischio, position sizing, audit chain,
   kill-switch, idempotenza, limiti giornalieri, riconciliazione e controlli
   anti-lookahead/future timestamps superati sullo SHA di Phase B.
6. **Certificazione:** nuova campagna forward separata, >=30 giorni
   calendario, >=25 giorni di evidenze valide, >=10 fill genuini della
   nuova Phase B, fingerprint stabile, audit e riconciliazione integri.
   Il raggiungimento numerico comporta revisione indipendente, NON ordini LIVE.

**Gate finale corrente: `PHASE_B_AUTHORIZATION_NOT_PRESENT`.**
Non esiste in questo documento alcun `approved=true`, token di consenso
o data di scadenza fittizia. Prima dell'approvazione nuova:
`newPaperOrdersAllowed=false`, `liveTradingAllowed=false`,
`brokerWritesAllowed=false`. Non modificare la V6 originale.

## 3. Trattamento credenziali

Continuare solo a utilizzare le credenziali già configurate negli ambienti
protetti, quando le verifiche ordinarie dei provider sono verdi e in
conformità ai limiti dei rispettivi piani. **Nessuna lettura, copia,
rotazione o sostituzione di segreti fa parte del packet.**
La precedente esposizione documentata in issue #26 rimane una verifica
storica aperta: fonti GREEN e funzionamento delle credenziali correnti
non provano revoca delle vecchie. Non autocertificare quella issue
e non abbassare il gate di sicurezza.

## 4. Evidenza V7 SHADOW prospettica — routine già prevista

Workflow **esistenti**, giorni feriali, in UTC:

| Finestra programmata | Workflow | Che cosa produce |
| --- | --- | --- |
| 19:07 | Fenice V7 Decision Outcomes | esiti decisioni osservati dopo il segnale |
| 23:07 | Fenice V7 Horizon Split | lista shadow strategica |
| 23:22 | Fenice V7 Shadow Strategy Evaluation | confronto forward, checkpoint 7d/30d, ledger |
| 23:37 | Fenice V7 Shadow Promotion Gate | diagnostica LOCKED/revisione, MAI promozione automatica |

Il rapporto V7 salvato il **24 ottobre alle 01:56 UTC** non prova che
l'automazione sia guasta la sera del 26 ottobre, prima dell'esecuzione
programmata. Per accertarlo verificare **dopo** l'orario previsto
l'ultimo run, il commit e i `generatedAt` di report e ledger.

Soglie V7 già codificate: almeno **30 coppie matched e 30 giornate
d'ingresso indipendenti a 7d E a 30d**, rendimento ipotetico extra-SPY
positivo dopo costi, successo benchmark >50%, criteri di drawdown e
revisione umana. I segnali non possono essere registrati dopo aver
visto il rendimento futuro. Nessun campione sintetico o ricostruzione
retroattiva di quote senza timestamp ammissibile.

**Ultima baseline osservata, non risultato finale:**
7d 4 osservazioni mature (ritorno ipotetico medio -4,77%); 30d 0;
coppie benchmark indipendenti 0 in entrambi gli orizzonti;
stato `LOCKED`. L'esperimento iniziale del 13/10 non matura a 30d
prima del 12/11/2026. Non trasformare un backtest storico in prova forward.

## 5. Chi può fare cosa adesso

- **Automatico già operativo**: fonti, terminal, decisioni e workflow
  SHADOW nella cadenza esistente e nei limiti delle quote pubbliche.
- **Preparazione permessa**: test, raccolta dei log, revisione baseline
  futura, stesura della nuova approvazione, confronto prezzi/benchmark.
- **Decisione richiesta prima di qualunque nuovo ordine simulato**:
  esplicita approvazione autenticata Phase B su una nuova baseline e una
  scadenza futura. La sola autorizzazione ad usare le stesse chiavi
  dei provider NON autorizza nuovi fill PAPER.

**Riferimenti:** `docs/PAPER_V6_OWNER_CONTINUATION_RUNBOOK.md`,
`docs/ZERO_COST_PAPER_CERTIFICATION_POLICY.md`,
`data/paper-v6-continuation-plan.json`,
issue #226, issue #217 e issue #26.
