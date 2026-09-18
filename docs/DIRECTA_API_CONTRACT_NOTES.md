# Directa dAPI contract notes

Fonte verificata: documentazione ufficiale Directa dAPI, ultimo aggiornamento indicato 16/07/2025.

## Trasporto
- Socket TCP locale su `127.0.0.1`.
- Porta default trading: `10002`.
- Porta default datafeed: `10001`.
- Porta default storico: `10003`.
- Messaggi UTF-8 terminati da newline.
- Heartbeat `H\n` emesso periodicamente dal servizio.
- Le porte possono cambiare con più utenze; Darwin mantiene `~/.directa/engine/APIPortSettings.txt` con `codiceUtente;portaPrezzi;portaTrading;portaStorico`.

## Comandi read-only sul canale TRADING
- `DARWINSTATUS`
- `INFOACCOUNT`
- `INFOAVAILABILITY`
- `INFOSTOCKS`
- `GETPOSITION <ticker>`
- `ORDERLIST`
- `ORDERLISTNOREV`
- `ORDERLISTPENDING`

## Messaggi informativi
- `DARWIN_STATUS`
- `INFOACCOUNT`
- `AVAILABILITY`
- `STOCK`
- `ORDER`
- `ERR`
- `H`

## Stati ordine ORDER
- `2000`: in negoziazione
- `2001`: errore immissione
- `2002`: in negoziazione dopo conferma
- `2003`: eseguito
- `2004`: revocato
- `2005`: in attesa di conferma

## Risposte trading
- `TRADOK` 3000: ordine immesso
- `TRADOK` 3001: ordine eseguito
- `TRADOK` 3002: ordine revocato
- `TRADCONFIRM` 3003: richiesta conferma ordine
- `TRADERR`: errore operazione

## Estensioni utili future
- `PRICEEXE TRUE`: arricchisce TRADOK/ORDER con prezzo eseguito, quantità eseguita/residua e riferimento Directa.
- `POINTUPDATEORDER TRUE`: produce blocchi coerenti `BEGIN UPDATEORDER` / `UORDER` / `USTOCK` / `UAVAILABILITY` / `UINFOACCOUNT` / `END UPDATEORDER`.
- `LOGCMD TRUE`: include il comando origine nei messaggi di risposta.

## Regola Fenice
Questa integrazione implementa prima solo lettura. I comandi di scrittura (`ACQAZ`, `VENAZ`, `ACQMARK`, `VENMARK`, `ACQSTOP`, `VENSTOP`, `ACQSTOPLIMIT`, `VENSTOPLIMIT`, `REVORD`, `REVALL`, `CONFORD`, `KID_ACCEPT`, `MODORD`) non devono essere trasmessi dal bridge read-only.

Il trading reale resta soggetto al compile-time lock Fenice e a una futura PR separata.
