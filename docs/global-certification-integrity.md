# Integrità delle prove di mercato non USA

Il percorso globale della PR #123 resta un laboratorio di osservazione. Un risultato positivo riguarda i dati del singolo strumento; non certifica rischio, portafoglio, campagna PAPER o operatività LIVE.

## Correzioni del 5 ottobre 2026

Le regressioni riproducevano cinque ammissioni errate: una sessione di un'altra Borsa, una sessione vecchia, un clock NaN, una risposta di errore contenente anche prezzi e due semplici etichette PAPER potevano superare i controlli.

- La prova di sessione deve essere accettata, esplicitamente aperta, della stessa MIC della quotazione e non più vecchia di 60 secondi. Viene ricontrollata anche quando si genera il report, dopo la raccolta dei provider. Nessuna finestra oraria costituisce prova di apertura effettiva.
- La quotazione richiede identità e valuta esatte, prezzo positivo, clock valido e timestamp non ambiguo. Un errore del provider non diventa un prezzo ammesso anche se contiene campi apparentemente validi. Un datetime senza offset non viene reinterpretato come UTC.
- L'ammissione indipendente rifiuta clock/limiti invalidi, prezzi coercibili ma non numerici e famiglie Twelve Data alternative usate come secondo provider indipendente.
- Ogni quotazione candidata PAPER porta la prova di ammissione legata a famiglia, simbolo, MIC, valuta, prezzo e timestamp. Sono richiesti il riferimento/hash del controllo di entitlement, validità, uso interno automatizzato e doppio controllo. L'etichetta PAPER o LIVE da sola non dimostra il diritto d'uso.
- Normalizzazione e deduplicazione conservano le prove. La certificazione conta solo famiglie ammesse e fresche; alias con spazi o maiuscole non aumentano il quorum. Modificare il prezzo o il timestamp invalida la prova associata.
- Il collector inoltra ora la conferma temporale dell'entitlement (`FENICE_TWELVE_DATA_GLOBAL_ENTITLEMENT_CONFIRMED_AT`) al resolver esistente, che continua a richiedere una conferma realmente recente. Non la rinnova automaticamente. Prima mancava il campo necessario, anche con gli altri riferimenti configurati.
- Un budget di zero probe o zero retry resta zero. Valori invalidi vengono respinti prima delle richieste ai provider; non si trasformano nel budget predefinito.

Le prove sono metadati controllati prodotti dagli adattatori del server, non una firma digitale del provider. Devono provenire dal percorso autenticato e dai resolver di entitlement; non sono un sostituto del controllo di origine o dell'approvazione dei diritti d'uso.

## Verifica

`node --experimental-strip-types scripts/test-global-certification-integrity.mjs`

`node scripts/test-global-observation-collector.mjs`

La suite usa esclusivamente fixture offline: non produce quotazioni vere, entitlement effettivi, fill o giorni di certificazione. Comprende il percorso positivo completo (due famiglie ammesse), la serializzazione/deduplicazione delle prove e le regressioni negative. Le suite esistenti degli adattatori rimangono necessarie.

La prova del collector esegue il programma completo con provider simulati e una directory temporanea (`FENICE_GLOBAL_OBSERVATION_DATA_DIR`): verifica mercato aperto/chiuso, errori, doppio controllo, limiti zero, rifiuto della modalità di mutazione e integrità byte per byte dei dataset PAPER. La directory di produzione rimane quella usuale quando l'override non è specificato.

I registri di entitlement e identità broker restano vuoti e con rifiuto predefinito fino a prove reali. Il collector non viene inserito nel ciclo PAPER V6 e non scrive `execution-market-evidence.json`. Il fingerprint dei 92 file V6 deve restare invariato.

## Limite operativo ancora aperto

Servono quotazioni correnti di due famiglie realmente indipendenti, con identità esatta e diritti d'uso verificati per ogni mercato. Test verdi, sessione aperta e provider candidati non dimostrano quella disponibilità. Il laboratorio globale non abilita acquisti reali o scritture Directa.
