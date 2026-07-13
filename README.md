# Fenice Investment System

Software di supporto decisionale per il **Progetto 100.000 €** di Orazio.

Obiettivo: analizzare in modo disciplinato geopolitica, macroeconomia, mercati, intelligenza artificiale, biotech e agritech con un orizzonte di dieci anni, partendo da un capitale di riferimento di 10.000 €.

## Stato attuale

La prima versione completa dell'interfaccia include:

- dashboard operativa con verdetto, opportunità, rischio e fiducia;
- sei indicatori dello scenario mondiale;
- classifica delle cinque aziende monitorate;
- schede con tesi, rischio e segnali da aspettare;
- portafoglio candidato con simulazione degli importi;
- storico dei report;
- avvisi prioritari;
- capitale modificabile e salvato nel browser;
- registro locale delle decisioni;
- conferma umana obbligatoria.

Il software **non compra e non vende automaticamente**. Ogni decisione finanziaria deve essere confermata da Orazio.

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4

## Avvio locale

```bash
npm install
npm run dev
```

Aprire `http://localhost:3000`.

## Controlli

```bash
npm run lint
npm run build
```

## Architettura

- `app/page.tsx`: ingresso dell'applicazione;
- `components/FeniceDashboard.tsx`: interfaccia e interazioni;
- `lib/fenice.ts`: modello dati, aziende, indicatori, portafoglio e report;
- `app/globals.css`: stile globale.

## Prossime fasi

1. collegare fonti dati finanziarie e informative reali;
2. aggiungere database per storico e decisioni multi-dispositivo;
3. creare processi programmati di analisi;
4. inviare notifiche solo quando cambia realmente il verdetto;
5. aggiungere autenticazione privata;
6. pubblicare su Vercel.

> I valori presenti nella prima versione sono dimostrativi e servono a verificare struttura, flusso e interfaccia. Il sistema non costituisce consulenza finanziaria e non esegue ordini.
