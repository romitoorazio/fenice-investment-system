# FENICE100K — protocollo operativo permanente

**Parola di attivazione esatta:** FENICE100K  
**Scopo:** trasformare Fenice in un sistema di investimento intelligente che **cerchi, confronti, selezioni e verifichi opportunità di profitto netto**.  
**Obiettivo economico dell'utente:** partire da EUR 10.000 e puntare a EUR 100.000 in 10 anni senza versamenti aggiuntivi (rendimento composto necessario ~25,89% annuo *prima* di imposte/costi; obiettivo estremamente ambizioso, non garantito).  
**Data target per la prima release utilizzabile come supporto alle decisioni:** 31 ottobre 2026, fuso Europe/Rome.  
**Stato del protocollo:** attivo, lavoro incrementale; questo documento è l'autorità di progetto sulla **direzione economica** e rimanda alle policy più restrittive per trading e certificazione.

## Significato della parola FENICE100K

Quando l'utente invia anche soltanto **FENICE100K**, senza altri dettagli, interpreta il comando come:

> Riprendi lo sviluppo effettivo del progetto GitHub romitoorazio/fenice-investment-system verso la missione economica, leggendo questo protocollo e lo stato corrente. Trova il prossimo collo di bottiglia che impedisce di identificare e dimostrare opportunità di profitto netto. Esegui una modifica verificabile, con test, CI, PR ed eventuale merge/deploy sicuro nel turno corrente. Non limitarti a un report o a ripetere una strategia; non presumere accesso o autorizzazione al broker. Non proporre ordini LIVE.

Il codice indica **direzione, priorità e continuità**, non un'autorizzazione a spendere, accedere a dati privati non connessi, sbloccare conti o effettuare operazioni. Se strumenti GitHub/Vercel non sono disponibili, dire con esattezza il blocco, senza fingere interventi.

### Procedura obbligatoria a ogni richiamo
1. Leggere questa pagina e le policy in docs/FENICE_AUTONOMOUS_ROADMAP_2026.md, docs/ZERO_COST_PAPER_CERTIFICATION_POLICY.md e docs/PROFESSIONAL_BENCHMARK_2026.md.
2. Leggere stato *attuale* del repository/main, issue critiche, PR aperte, workflow e deployment Vercel; non usare dati di memoria come evidenza corrente.
3. Leggere data/investment-committee.json, data/v7-decision-outcomes.json, data/paper-validation-campaign.json, data/paper-validation-approval.json e gli evidence di quote/source health; riconoscere dati scaduti e separare PAPER, SHADOW, modello e denaro reale.
4. Fare diagnosi P0 (sicurezza e certificazione), poi P1 (qualità delle opportunità e risultati economici netti), P2 (AI e interfaccia); scegliere **il singolo miglior intervento ad alto impatto** coerente con le dipendenze.
5. Scrivere o estendere un test riproducibile; implementare su branch isolato; non modificare file/core V6 congelati; osservare i limiti di costo provider.
6. Verificare lint/TypeScript, CI, segreti, integrità dei dati, PAPER Freeze Guard, test regressivi, V7 isolation e nessun percorso LIVE. Non integrare se richieste non verdi.
7. Con modifiche a basso rischio, merge e verifica del deploy READY per lo SHA esatto e runtime errors; altrimenti lasciare PR aperta con blocchi espliciti.
8. Comunicare in italiano cosa è stato **realmente** cambiato, PR/SHA, test, nuova capacità economica verificabile, limiti e prossimo collo di bottiglia. Non presentare P&L ipotetico come profitto incassato.
9. Non promettere lavoro continuativo asincrono: l'esecuzione avviene nel turno in cui l'utente invia la parola o tramite automazioni/workflow esplicitamente configurati.

## Priorità invariabile: profitto NETTO dimostrabile

La funzione di ogni feature è una fra:
- aumentare la probabilità **misurabile** di trovare un vantaggio di rendimento rispetto a una base alternativa;
- evitare errori, costi, drawdown o perdite che distruggono il rendimento composto;
- rendere verificabile una decisione già suggerita;
- aumentare copertura/velocità solo quando migliora uno dei tre obiettivi precedenti.

**Non contano come profitti:** notizie raccolte, score 90/100, watchlist, decisioni ATTENDI, risultati di backfill, fill PAPER, simulazioni senza NAV riconciliato, selezione fatta dopo aver conosciuto l'esito. Il sistema deve indicare N/D quando mancano evidenze.

### Orizzonte prodotto
- Strumento prioritario: azioni ed ETF liquidi con opportunità da **giorni a mesi**, oltre a un nucleo di lungo periodo e liquidità; valutare classi/mercati mondiali per livelli di affidabilità, non dichiarare feed live universali.
- Segnali: COMPRA, VENDI, MANTIENI/OSSERVA, ATTENDI, EVITA; rispettare differenza fra *candidate*, *decisione research*, *PAPER eligible* e *LIVE authorized*.
- Per ogni proposta: ticker/strumento/venue/valuta, fonte e data, catalyst ufficiale, prezzo osservato, scenario bullish/bearish, atteso netto dopo ipotesi di costi, rischio, dimensionamento, orizzonte, invalidazione, alternativa ETF/cash, confidence **calibrata** e stato di eseguibilità reale.
- Non forzare COMPRA per "fare soldi": **zero BUY veritieri** meglio di acquisti fittizi. Analizzare però i motivi misurabili dell'eccessiva cautela in ambiente SHADOW senza allentare arbitrariamente i gate.

## Lavori da completare in ordine di dipendenza

### F0 — Baseline e blocchi critici, 13–14 ottobre [P0]
- [ ] Audit della main, tutte le PR pendenti (in particolare #224 sul core), source status, budget e segreti; riportare baseline SHA/data e vincoli di freeze.
- [ ] Confermare compile-time/runtime LIVE lock, nessun broker write, zero secrets esposti, zero ordini doppi e quote future/stale ammesse.
- [ ] Trattare #215 (refresh provider e budget API), #214 (quote future next-core): correzioni sicure e isolate, test negativi, non invalidare fingerprint V6.
- [ ] Fotografia non alterabile delle evidenze PAPER; readiness non equivale a CI verde.

**PASS:** nessun nuovo rischio P0, scanner segreti e test critical PASS, patch non modifica baseline protetta.

### F1 — Radar mondiale verificato, 13–17 ottobre [P1]
- [ ] Rafforzare SEC EDGAR, comunicati emittenti, banche centrali, calendario macro, sorgenti finanziarie autorevoli e notizie internazionali; gestione GDELT 429/timeout senza richieste abusive.
- [ ] Deduplicare e tradurre/categorizzare eventi con data di pubblicazione e data effettiva, feed/fonte, dominio, URL HTTPS e verificabilità primaria/indipendente.
- [ ] Associare evento → emittente/ticker/ISIN/venue e settore beneficiato/danneggiato. Nessuna promozione da una sola keyword o articolo non confermato.
- [ ] Introdurre limiti costi/timeout, osservabilità per sorgente, validazione multi-fonte dei prezzi e FX; fallback falliscono chiusi per dati execution.
- [ ] Verificare cronologie e possibili effetti indiretti; non usare informazione pubblicata dopo il prezzo di ingresso simulato.

**PASS:** eventi riproducibili e tracciabili fino al simbolo, feed falliti dichiarati, nessun segnale "verificato" da fonte debole.

### F2 — Motore OPPORTUNITÀ con timestamp e costi, 16–21 ottobre [P1]
- [ ] Collegare notizie primarie con dati fondamentali, trend, volumi, volatilità, rischio di evento, valutazione e regime.
- [ ] Congelare decisione e prezzi osservati **prima** del movimento futuro; archivio append-only e replay contro look-ahead/survivorship bias.
- [ ] Produrre ranking multi-orizzonte 1/7/30/90 giorni; opportunità ipotetica netta dopo ipotesi esplicite di commissioni, slippage, spread, FX e imposte; evitare di spacciare l'ipotesi per costo reale Directa.
- [ ] Confrontare con benchmark coerenti (es. SPY soltanto per azioni USD e finestre comparabili) e cash; conteggiare giornate indipendenti, campioni BUY veri e campioni retrospettivi separatamente.
- [ ] Shadow testare regole alternative per ridurre false attese, con periodi fuori campione e soglie di prova, senza modificare automaticamente le decisioni eseguibili.
- [ ] Spiegare perché BUY non scatta e quali condizioni verificabili dovrebbero cambiare per ciascun candidato.

**PASS:** ogni candidato ha spiegazione, provenance e conto costi; backtest e forward scorecard separati, test contro timestamp e rendimenti falsificati.

### F3 — Strategia e rischio per la crescita composta, 19–24 ottobre [P1]
- [ ] Definire universo investibile liquido, filtri costo/volatilità, regime, esposizione per titolo/settore/paese/valuta e limite alle operazioni speculative.
- [ ] Confrontare strategia selettiva, ETF passivo e liquidità su finestre **comparabili** dopo costi; analizzare drawdown, volatilità, Sharpe/Sortino, turnover, percentuale di decisioni corrette e campione effettivo.
- [ ] Walk-forward robusto, stress test macro/shock, sensitivity dei costi, controllo leakage e assenza di selezione ex post del "vincitore".
- [ ] Rendere impossibile un suggerimento di quantità reale quando liquidità e posizioni Directa sono N/D.
- [ ] Motivare VENDI/ATTENDI con trigger controllabili; distinguere uscita tecnica, gestione rischio e ottimizzazione fiscale (nessuna automazione fiscale presunta).

**PASS:** strategie riproducibili, limiti massimi di rischio rispettati; nessun benchmark o rendimento inventato.

### F4 — PAPER V6 e scadenza autorizzazione, azione entro **24 ottobre** [P0, dipendenza esterna]
- [ ] Rispettare in data/paper-validation-campaign.json partenza **25 settembre 2026 ore 15:40:35 UTC**, durata minima **30×24h**, >=25 giornate di evidenza valida, >=10 fill PAPER reali e audit/fingerprint intatti.
- [ ] Verificare **issue #226**: data/paper-validation-approval.json scade il **24 ottobre 2026 ore 21:59:59 UTC**; prima possibile maturazione dei 30 giorni il **25 ottobre ore 15:40:35 UTC**. La scadenza precede la maturazione.
- [ ] Portare all'utente prima della scadenza la sola decisione di rinnovo/continuità consentita dalle policy; nessuna proroga silenziosa, retrodatazione, reset o falso fill.
- [ ] In assenza di approvazione/entitlement appropriati, fermarsi in sicurezza, preservare la catena di prova e dichiarare BLOCKED.
- [ ] Non confondere la certificazione PAPER generale con Directa-pilot: dAPI locale read-only e presenza del computer autorizzato sono verifiche separate; assenza di dati Directa realtime a pagamento non basta per invalidare certificazione PAPER generale.

**PASS:** evidenze genuine, minimum temporale maturato e autorizzazione legittima se necessaria; LIVE resta comunque bloccato.

### F5 — AI investigativa economica, 20–27 ottobre [P2]
- [ ] Assistente che parta da fonti/quote/eventi identificabili, non inventi un ticker vincente o un profitto.
- [ ] Spiegazioni per ogni COMPRA/ATTENDI/VENDI: opportunità potenziale, alternative, controtesi, rischio e cosa farebbe cambiare la decisione.
- [ ] Tool e dati solo read-only; verificatore delle uscite e difesa prompt injection contro testo delle notizie.
- [ ] Valutare l'eventuale AI generativa solo se credenziali API e **budget separato** sono davvero disponibili; ChatGPT Plus non equivale a consumo API gratuito.
- [ ] Ridurre chiamate/token tramite cache, ragionamento deterministico sui dati e uso AI solo su pochi candidati verificati.

**PASS:** tracciabilità delle fonti, test su allucinazioni e costi sotto controllo, zero potere broker.

### F6 — Un'unica pagina "dove sono i soldi?", 23–29 ottobre [P2]
- [ ] Dashboard oggi: opportunità top, motivi, possibile rendimento netto ipotetico, perdita plausibile, dimensionamento *solo teorico*, prezzi/fonte/timestamp, prezzo/condizione di ingresso e invalidazione.
- [ ] Stato chiaro: ricerca / PAPER / Directa read-only / LIVE non autorizzato.
- [ ] Performance Center: confronto indici corretto, risultati forward-only vs backfill, campione decisioni COMPRA, profitto netto reale N/D se non riconciliato.
- [ ] Report sintetico ogni giorno: cosa è cambiato, eventi importanti, titoli, cosa osservare e se è emerso un vero segnale economicamente interessante.
- [ ] Usabilità su desktop e telefono; messaggi di errore leggibili, niente badge verdi per fonti non verificate.

**PASS:** l'utente distingue cosa analizzare, perché, quale rischio e se esistono profitti dimostrati entro una schermata.

### F7 — Affidabilità, conti e resilienza, 24–30 ottobre [P0/P2]
- [ ] Consolidare backup/restore, audit append-only, coerenza quote/FX/sessioni, stato mancante fail-closed, watchdog cron e monitoraggio Vercel.
- [ ] Eseguire security regression, verifica secret scan, provider budget/rate limits, CI tests e riproducibilità di dati e segnali.
- [ ] Directa read-only: quando possibile verificare **sul PC locale autorizzato** cash, posizioni e ordini senza invio; altrimenti N/D e blocco auto-esecuzione.
- [ ] Nessun merge delle PR legacy/core per comodità: verificare obsolescenza, interazione con fingerprint e recertification.

**PASS:** main/produzione coerenti, nessun evento LIVE o segreto esposto, tutti gate critici PASS, ripristino testato o blocker documentato.

### F8 — Collaudo e decisione 31 ottobre [RELEASE GATE]
- [ ] Test e CI GREEN allo SHA finale e Vercel READY allo **stesso SHA**, errori runtime verificati.
- [ ] Eventi principali con provenienza/ora, correlazione titolo e valore economico ipotetico riproducibili.
- [ ] Ogni opportunità mostra confronto benchmark e costi senza look-ahead.
- [ ] Shadow/forward results chiaramente separati dai risultati retrospettivi; se non esistono campioni COMPRA maturati, dire **insufficienti**.
- [ ] Regole di rischio e PAPER freeze intatti; readiness e scadenze vere e verificabili.
- [ ] Dashboard e AI utili a una decisione umana, costi provider controllati, documentazione per riprendere il lavoro.
- [ ] Emissione di un report 31/10: **RESEARCH-READY / PAPER-READY / LIVE-BLOCKED**, con PASS, BLOCKED, N/D e azioni manuali rimanenti.

**Definizione realistica di "pronta per fine mese":** versione affidabile di *ricerca, selezione e verifica prospettica in ambiente PAPER/SHADOW*, con cruscotto utilizzabile e sicurezza. **Non significa** "10x già validato", profitto garantito, dati realtime per ogni borsa, certificazione Directa automatica o trading LIVE pronto. I segnali iniziati a metà ottobre non possono avere uno storico forward a 30/90 giorni già maturo al 31/10. Se un gate manca, classificarlo onestamente come BLOCKED e non aggirarlo.

## Ordine dei lavori in ogni iterazione

1. **P0: legalità, autorizzazioni, scadenze, correttezza di dati e sicurezza del capitale**.
2. **P1: nuove opportunità verificabili e predittività fuori campione**.
3. **P1: redditività ipotetica netta vs benchmark, misurazione delle perdite**.
4. **P2: AI, riduzione costi e UI per decisioni**.
5. **P3: espansione funzionalità soltanto se migliora le precedenti**.

Non rinviare P1 indefinitamente per aggiungere altre schermate. Ogni PR deve rispondere: "Questo cambia la capacità di guadagnare, di misurarla con onestà, o di evitare di perdere?". In assenza di risposta verificabile, ridimensionare o scartare.

## Metriche da seguire nel report di ogni FENICE100K
- Fonte mercato e confidenza: sana/parziale/fallita, ultima osservazione, dati execution vs solo ricerca.
- Eventi ufficiali nuovi con ticker attribuito; segnali research emessi e congelati prima di osservare il risultato.
- Conteggio prospettico di COMPRA effettivi e maturati a 1/7/30/90 giorni; campioni retrospettivi riportati separatamente.
- Vantaggio medio e distribuzione rispetto a ETF/cash al netto dei costi **ipotetici dichiarati**, su finestre coerenti; nessun "profitto" senza NAV/costi reali.
- Max drawdown, perdite evitate e guadagni mancati, turnover e rischio di concentrazione.
- PAPER campaign: giorni validi/fill/minima maturazione/scadenza approval/blocked reasons.
- CI + release SHA, Vercel READY, errori, sicurezza, PR unite e blocker residui.
- Tempo e numero di passi fino al 31/10.

## Link rapidi e controllo delle fonti di verità
- Repo: https://github.com/romitoorazio/fenice-investment-system
- App: https://fenice-investment-system.vercel.app/
- Performance: https://fenice-investment-system.vercel.app/performance
- Dashboard decisioni: https://fenice-investment-system.vercel.app/decisioni
- Readiness: https://fenice-investment-system.vercel.app/readiness
- Roadmap preesistente: docs/FENICE_AUTONOMOUS_ROADMAP_2026.md
- Policy certificazione: docs/ZERO_COST_PAPER_CERTIFICATION_POLICY.md
- Issue critiche: #214, #215, #216, #217, #218, #219, #220, #221, #222, soprattutto #226.
- Sviluppi recenti: PR #245 (missione 10x visibile), #246 (catalizzatori primari), #247 (confronto ipotetico SPY), #248 (distinzione retrospettivo/prospettico).

## Nota su memoria e continuità
Questo file **versionato in GitHub** è il promemoria stabile e controllabile. La memoria conversazionale di ChatGPT può variare e non garantisce recupero perfetto; a ogni FENICE100K rileggere esplicitamente il repository e questo protocollo, invece di dire di aver lavorato quando non è successo. Aggiornare questo file se la rotta o lo stato cambiano, mantenendo la missione economica e i vincoli di sicurezza.
