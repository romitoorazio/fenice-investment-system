# Fenice Multi-Broker — Directa + eToro (research only)

La pagina `/brokers` e la API pubblica `/api/brokers/status` mostrano **soltanto lo stato di preparazione**. Non leggono bilanci, non accedono a conti o credenziali, non attivano nuovi provider, non effettuano ordini e non autorizzano denaro reale. Nessuna delle due connessioni e' attestata come attiva.

- **Directa:** ponte localhost read-only gia' presente; il server Vercel non puo' stabilire da solo se Darwin sul PC dell'utente sia aperto.
- **eToro:** client DEMO/Read **predisposto e testato offline** in `lib/brokers/etoro-demo-readonly.ts`, senza chiavi, chiamate automatiche, route pubbliche o sessione verificata. Le credenziali e il transport non sono configurati. Un account eToro idoneo e verificato e' richiesto dalla guida API ufficiale.
- **PAPER V6:** baseline congelata invariata; gli ordini LIVE restano bloccati. Nessuna condivisione di prezzi, segnali basati su dati proprietari o posizioni fra le due piattaforme prima della verifica dei termini di licenza.
- **Tasse e costi:** per un futuro rendimento netto servono commissioni, spread, FX e fiscalita' per broker; non mostrare P&L aggregati inventati ne' sommare euro/dollari senza conversione valida.

Prossimi passi: confermare la disponibilita' API eToro; creare *nel proprio account* la chiave DEMO con permesso Read (mai in GitHub, chat o frontend); sviluppare il transport server-side opt-in con timeout, rate limit e controlli di provenienza; verificare separatamente accesso read-only Directa eToro, saldi e posizioni. Non modificare i gate PAPER durante la certificazione.

API ufficiale eToro: https://builders.etoro.com/get-started

Test senza credenziali o accesso esterno:
`node --experimental-strip-types scripts/test-multi-broker-readiness.mjs` e `node --experimental-strip-types scripts/test-etoro-demo-readonly.mjs`.
