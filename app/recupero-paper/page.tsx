"use client";

import {useEffect,useState} from "react";
type Status={state:string;journalEventCount?:number;pendingSignalCount?:number;
  virtualBuyCount?:number;virtualSellCount?:number;brokerConnectivityAllowed?:boolean;};
const NO_LIVE="Nessun ordine reale: Directa esclusa. Nessun FILL creato dal recupero.";
const URL="/api/paper/one-global-private-status";
const RESTORE="/api/paper/one-global-private-recover";

export default function FeniceRecoverPage(){
  const [authenticated,setAuthenticated]=useState(false);
  const [status,setStatus]=useState<Status|null>(null);
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [note,setNote]=useState("");
  async function reload(){
    setLoading(true);
    try{
      const session=await fetch("/api/analista-generativa/session",{credentials:"same-origin",cache:"no-store"});
      const j=await session.json() as {authenticated?:boolean};
      if(j.authenticated!==true){
        setAuthenticated(false);
        setStatus(null);
        return;
      }
      setAuthenticated(true);
      const response=await fetch(URL,{credentials:"same-origin",cache:"no-store"});
      const payload=await response.json() as Status;
      setStatus({state:typeof payload?.state==="string"?payload.state:"CHECK_UNAVAILABLE",
        journalEventCount:payload?.journalEventCount,
        pendingSignalCount:payload?.pendingSignalCount,
        virtualBuyCount:payload?.virtualBuyCount,
        virtualSellCount:payload?.virtualSellCount});
    }catch{setStatus({state:"CLOUD_CONNECTION_UNAVAILABLE"});}
    finally{setLoading(false);}
  }
  useEffect(()=>{void reload();},[]);
  async function restore(){
    if(!authenticated||status?.state!=="ORIGINAL_JOURNAL_NOT_MIGRATED"||submitting)return;
    setSubmitting(true);setNote("");
    try{
      const response=await fetch(RESTORE,{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({confirm:"RECOVER_ORIGINAL_EOD_20261113"}),
        cache:"no-store",
      });
      const payload=await response.json() as {state?:string};
      if(response.ok&&payload.state==="ORIGINAL_JOURNAL_RECOVERED_PRIVATE"){
        setNote("Registro originale recuperato nel Blob privato e riverificato.");
        await reload();
      }else{
        setNote("Recupero non eseguito: "+(payload.state||"CONTROLLI_NON_SUPERATI"));
      }
    }catch{setNote("Collegamento cloud non disponibile: nessun recupero confermato.");}
    finally{setSubmitting(false);}
  }
  return (
    <main style={{maxWidth:740,margin:"0 auto",padding:"32px 20px",lineHeight:1.55}}>
      <h1 style={{fontSize:28,fontWeight:700}}>FENICE · Registro PAPER privato</h1>
      <p>Verifica e recupero del journal EOD del 13 novembre 2026, con due segnali originali CBA/BAMI e successivo annullamento BAMI.</p>
      <p>{NO_LIVE}</p>
      {loading?<p>Controllo del collegamento privato...</p>:
        !authenticated?
          <section><p>Accesso proprietario richiesto. Apri l’analista FENICE e accedi con la sessione proprietario già configurata, poi torna qui.</p>
            <a href="/analista" style={{textDecoration:"underline"}}>Vai all’analista FENICE</a>
          </section>:
          <section>
            <p><strong>Stato:</strong> {status?.state||"NON_DISPONIBILE"}</p>
            {status?.state==="ORIGINAL_JOURNAL_VALID_PRIVATE"?
              <p>Registro verificato. Eventi: {status.journalEventCount}. Segnali pendenti: {status.pendingSignalCount}. BUY virtuali: {status.virtualBuyCount??0}. SELL virtuali: {status.virtualSellCount??0}.</p>:null}
            {status?.state==="ORIGINAL_JOURNAL_NOT_MIGRATED"?
              <div>
                <p>Il Blob privato è raggiungibile ma vuoto. Premi una sola volta per recuperare **il registro originale** verificato, senza sovrascrivere dati.</p>
                <button disabled={submitting} type="button" onClick={()=>void restore()}
                  style={{background:"#111",color:"#fff",padding:"14px 20px",borderRadius:8,cursor:"pointer"}}>
                  {submitting?"Verifica e importazione in corso...":"Recupera journal originale 13/11"}
                </button>
              </div>:null}
            <p><button type="button" onClick={()=>void reload()} disabled={loading||submitting}
              style={{border:"1px solid #999",padding:"10px 16px",borderRadius:8}}>
                Ricontrolla stato privato
              </button></p>
          </section>}
      {note?<p role="status">{note}</p>:null}
      <p style={{fontSize:13,opacity:.75}}>L'operazione conserva gli eventi originali. Nessuna quotazione o credenziale è resa pubblica. Il recupero non certifica operazioni né autorizza Directa.</p>
    </main>
  );
}
