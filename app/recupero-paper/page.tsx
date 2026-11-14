"use client";

import {useEffect,useState} from "react";
import OneGlobalPrivateInputPanel from "@/components/OneGlobalPrivateInputPanel";
type CbaWindow={state:string;nextRegularSessionDate:string;
  evidenceDeadlineAt:string;ownerManualRetirementAvailable:boolean;};
type Status={state:string;journalEventCount?:number;pendingSignalCount?:number;
  virtualBuyCount?:number;virtualSellCount?:number;brokerConnectivityAllowed?:boolean;
  signalWindows?:{withinRegularWindowCount:number;elapsedRegularWindowCount:number;
    pendingCbaPilot:CbaWindow|null};};
const NO_LIVE="Nessun ordine reale: Directa esclusa. Nessun FILL creato dal recupero.";
const URL="/api/paper/one-global-private-status";
const RESTORE="/api/paper/one-global-private-recover";
const EXPIRE="/api/paper/one-global-private-expire-cba";

export default function FeniceRecoverPage(){
  const [authenticated,setAuthenticated]=useState(false);
  const [status,setStatus]=useState<Status|null>(null);
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [expiring,setExpiring]=useState(false);
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
        virtualSellCount:payload?.virtualSellCount,
        signalWindows:payload?.signalWindows});
    }catch{setStatus({state:"CLOUD_CONNECTION_UNAVAILABLE"});}
    finally{setLoading(false);}
  }
  useEffect(()=>{queueMicrotask(()=>{void reload();});},[]);
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
  async function expireCba(){
    if(!authenticated||!status?.signalWindows?.pendingCbaPilot?.ownerManualRetirementAvailable
      ||submitting||expiring)return;
    setExpiring(true);setNote("");
    try{
      const response=await fetch(EXPIRE,{
        method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({confirm:"RETIRE_EXPIRED_CBA_ORIGINAL_PAPER_PILOT"}),
        cache:"no-store",
      });
      const payload=await response.json() as {state?:string};
      if(response.ok&&payload.state==="ORIGINAL_CBA_RETIRED_APPEND_ONLY"){
        setNote("Segnale CBA scaduto archiviato con un nuovo evento: i tre originali sono conservati.");
        await reload();
      }else setNote("Nessuna modifica al registro: "+(payload.state||"VERIFICA_NON_SUPERATA"));
    }catch{
      setNote("Nessuna scadenza confermata: controlla la connessione prima di ripetere.");
    }finally{setExpiring(false);}
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
            {status?.state==="ORIGINAL_JOURNAL_VALID_PRIVATE"
              &&status?.signalWindows?.pendingCbaPilot?
              <section style={{marginTop:18,padding:16,border:"1px solid #475569",borderRadius:10}}>
                <h2 style={{fontWeight:600,marginBottom:8}}>CBA Australia · finestra PAPER</h2>
                <p>Prima seduta ordinaria prevista: {status.signalWindows.pendingCbaPilot.nextRegularSessionDate}.</p>
                <p>Scadenza tecnica delle ricevute: {new Date(status.signalWindows.pendingCbaPilot.evidenceDeadlineAt).toLocaleString("it-IT",{timeZone:"Europe/Rome"})} (ora italiana).</p>
                {status.signalWindows.pendingCbaPilot.ownerManualRetirementAvailable?
                  <>
                    <p>La finestra di 48 ore è trascorsa. Il segnale resta nello storico, ma non può essere trasformato in un FILL usando prezzi tardivi. Puoi archiviare solo il segnale scaduto con un nuovo evento firmato e conservare il journal originale.</p>
                    <button type="button" disabled={submitting||expiring} onClick={()=>void expireCba()}
                      style={{background:"#334155",color:"#fff",padding:"12px 15px",borderRadius:8}}>
                      {expiring?"Verifico il registro originale...":"Archivia segnale CBA scaduto (senza FILL)"}
                    </button>
                  </>:
                  <p>Il segnale è ancora pendente: prima della scadenza non è possibile archiviarlo per questa ragione. Servono comunque due fonti e le autorizzazioni richieste per un eventuale FILL.</p>}
              </section>:null}
            {status?.state==="ORIGINAL_JOURNAL_NOT_MIGRATED"?
              <div>
                <p>Il Blob privato è raggiungibile ma vuoto. Premi una sola volta per recuperare il registro originale verificato, senza sovrascrivere dati.</p>
                <button disabled={submitting} type="button" onClick={()=>void restore()}
                  style={{background:"#111",color:"#fff",padding:"14px 20px",borderRadius:8,cursor:"pointer"}}>
                  {submitting?"Verifica e importazione in corso...":"Recupera journal originale 13/11"}
                </button>
              </div>:null}
            <p><button type="button" onClick={()=>void reload()} disabled={loading||submitting}
              style={{border:"1px solid #999",padding:"10px 16px",borderRadius:8}}>
                Ricontrolla stato privato
              </button></p>
            {status?.state==="ORIGINAL_JOURNAL_VALID_PRIVATE"?<OneGlobalPrivateInputPanel/>:null}
          </section>}
      {note?<p role="status">{note}</p>:null}
      <p style={{fontSize:13,opacity:.75}}>L&apos;operazione conserva gli eventi originali. Nessuna quotazione o credenziale è resa pubblica. Il recupero non certifica operazioni né autorizza Directa.</p>
    </main>
  );
}
