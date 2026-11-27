"use client";

import {useEffect,useRef,useState} from "react";
import OneGlobalPrivateInputPanel from "@/components/OneGlobalPrivateInputPanel";
import FenicePrivateOwnerLogin from "@/components/FenicePrivateOwnerLogin";
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
const R2_PROBE="/api/paper/one-global-r2-probe";
const R2_PENDING_KEY="fenice:r2-probe-unresolved:v1";
const R2_CHECKS=["conditionalCreate","concurrentExclusive","sha256Verified","conditionalUpdate","staleUpdateRejected","finalSha256Verified","cleanup"] as const;
type R2Result={state:string;checks?:Partial<Record<typeof R2_CHECKS[number],boolean>>;diagnosticId?:string;cleanupPending?:boolean;writeOutcomeAmbiguous?:boolean;failedStep?:string;failureCode?:string};

const R2_GENESIS="/api/paper/one-global-r2-prospective-genesis";
type GenesisResult={state:string;verified?:boolean;eventCount?:number;startedAt?:string;backupAccountSeparated?:boolean};
function R2ProspectiveGenesisPanel(){
  const [result,setResult]=useState<GenesisResult|null>(null);
  const [busy,setBusy]=useState(false);
  const [backupResult,setBackupResult]=useState<GenesisResult|null>(null);
  const inFlight=useRef(false);
  async function request(initialize:boolean){
    if(inFlight.current||(initialize&&result?.state!=="R2_PROSPECTIVE_GENESIS_ABSENT"))return;
    inFlight.current=true;setBusy(true);setBackupResult(null);
    try{
      const options:RequestInit={method:initialize?"POST":"GET",credentials:"same-origin",cache:"no-store"};
      if(initialize){
        options.headers={"Content-Type":"application/json","x-fenice-diagnostic":"r2-prospective-genesis"};
        options.body=JSON.stringify({action:"INITIALIZE_PAPER_GENESIS"});
      }
      const response=await fetch(R2_GENESIS,options);
      const payload=await response.json() as GenesisResult;
      if(!response.ok){setResult({state:"R2_GENESIS_CHECK_REQUIRED"});return;}
      if(payload.state==="R2_PROSPECTIVE_GENESIS_ABSENT"&&!initialize)setResult({state:payload.state});
      else if(payload.verified===true&&(payload.state==="R2_PROSPECTIVE_GENESIS_PRESENT"||payload.state==="R2_PROSPECTIVE_GENESIS_VERIFIED"))
        setResult({state:payload.state,verified:true,eventCount:payload.eventCount,startedAt:payload.startedAt});
      else setResult({state:"R2_GENESIS_CHECK_REQUIRED"});
    }catch{setResult({state:"R2_GENESIS_CHECK_REQUIRED"});}
    finally{inFlight.current=false;setBusy(false);}
  }
  async function backup(){
    if(inFlight.current||result?.verified!==true)return;
    inFlight.current=true;setBusy(true);setBackupResult(null);
    try{
      const response=await fetch(R2_GENESIS,{method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json","x-fenice-diagnostic":"r2-prospective-genesis"},
        body:JSON.stringify({action:"BACKUP_PAPER_JOURNAL"})});
      const payload=await response.json() as GenesisResult;
      if(response.ok&&payload.state==="R2_ENCRYPTED_BACKUP_VERIFIED"&&payload.verified===true)
        setBackupResult({state:payload.state,verified:true,eventCount:payload.eventCount,startedAt:payload.startedAt,backupAccountSeparated:payload.backupAccountSeparated});
      else setBackupResult({state:"R2_ENCRYPTED_BACKUP_BLOCKED"});
    }catch{setBackupResult({state:"R2_ENCRYPTED_BACKUP_BLOCKED"});}
    finally{inFlight.current=false;setBusy(false);}
  }
  return <section style={{marginTop:18,padding:16,border:"1px solid #475569",borderRadius:10}} aria-label="Nuova campagna PAPER R2">
    <h2 style={{fontWeight:600}}>Nuova campagna PAPER R2</h2>
    <p>Registro prospettico separato dallo storico. La genesis non crea operazioni, non attiva il motore PAPER e non autorizza Directa.</p>
    <button type="button" disabled={busy} onClick={()=>void request(false)} style={{border:"1px solid #999",padding:"10px 16px",borderRadius:8}}>Verifica genesis R2</button>
    {result?.state==="R2_PROSPECTIVE_GENESIS_ABSENT"?<button type="button" disabled={busy} onClick={()=>void request(true)} style={{background:"#334155",color:"#fff",padding:"12px 15px",borderRadius:8}}>Inizializza nuova campagna PAPER</button>:null}
    <div role="status">{busy?"Verifica in corso...":result?.state}
      {result?.verified?<p>Snapshot R2 verificato nello stesso bucket. Eventi: {result.eventCount??"N/D"}. {backupResult?.verified?"Backup cifrato su bucket separato verificato per "+(backupResult.eventCount??"N/D")+" eventi in questa sessione. "+(backupResult.backupAccountSeparated===true?"Account R2 distinti configurati; non prova di protezione fuori Cloudflare.":"Stesso account: non protegge dalla perdita dell’intero account."):"Backup su bucket separato non attestato."}</p>:null}
      {result?.verified?<button type="button" disabled={busy} onClick={()=>void backup()} style={{border:"1px solid #999",padding:"10px 16px",borderRadius:8}}>Esegui e verifica backup cifrato</button>:null}
      {backupResult?<p>{backupResult.state}{backupResult.verified?" — copia cifrata riletta e replay riuscito.":" — verificare configurazione privata e riprovare dopo una nuova verifica della genesis."}</p>:null}
      {result?.state==="R2_GENESIS_CHECK_REQUIRED"?<p>Esito non confermato: eseguire una nuova verifica in sola lettura prima di inizializzare.</p>:null}
    </div>
  </section>;
}

export default function FeniceRecoverPage(){
  const [authenticated,setAuthenticated]=useState(false);
  const [status,setStatus]=useState<Status|null>(null);
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [expiring,setExpiring]=useState(false);
  const [note,setNote]=useState("");
  const [r2Busy,setR2Busy]=useState(false);
  const [r2Result,setR2Result]=useState<R2Result|null>(null);
  const r2InFlight=useRef(false);
  const [r2Blocked,setR2Blocked]=useState(true);
  function restoreR2Guard(){
    try{
      const pending=window.localStorage.getItem(R2_PENDING_KEY);
      setR2Blocked(pending!==null);
      if(pending!==null){
        const id=/^[a-f0-9-]{36}$/.test(pending)?pending:undefined;
        setR2Result({state:"R2_PROBE_RECONCILIATION_REQUIRED",cleanupPending:true,diagnosticId:id});
      }
    }catch{setR2Blocked(true);setR2Result({state:"R2_PROBE_LOCAL_GUARD_UNAVAILABLE"});}
  }
  async function runR2Probe(){
    if(!authenticated||r2InFlight.current||r2Blocked)return;
    // Persist before dispatch: navigation or loss of the response must not unlock retry.
    try{
      if(window.localStorage.getItem(R2_PENDING_KEY)!==null){restoreR2Guard();return;}
      window.localStorage.setItem(R2_PENDING_KEY,"pending");
    }catch{setR2Blocked(true);setR2Result({state:"R2_PROBE_LOCAL_GUARD_UNAVAILABLE"});return;}
    r2InFlight.current=true;setR2Busy(true);setR2Blocked(true);setR2Result(null);
    try{
      const response=await fetch(R2_PROBE,{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"x-fenice-diagnostic":"r2-write"}});
      const payload=await response.json() as R2Result;
      const verified=response.ok&&payload.state==="R2_WRITE_PROBE_VERIFIED"&&R2_CHECKS.every(key=>payload.checks?.[key]===true);
      const knownRejection=response.status===401||payload.state==="R2_WRITE_PROBE_CONFIGURATION_FAILED"||payload.state==="PRIVATE_OWNER_ACCESS_NOT_CONFIGURED";
      const uncertain=!verified&&!knownRejection&&(payload.cleanupPending===true||payload.writeOutcomeAmbiguous===true||payload.checks?.cleanup!==true);
      if(uncertain){
        if(typeof payload.diagnosticId==="string"&&/^[a-f0-9-]{36}$/.test(payload.diagnosticId))window.localStorage.setItem(R2_PENDING_KEY,payload.diagnosticId);
      }else{window.localStorage.removeItem(R2_PENDING_KEY);setR2Blocked(false);}
      setR2Result({state:verified?"R2_WRITE_PROBE_VERIFIED":payload.state==="R2_WRITE_PROBE_VERIFIED"?"R2_PROBE_RESULT_INCOMPLETE":typeof payload.state==="string"?payload.state:"R2_PROBE_RESULT_UNKNOWN",checks:payload.checks,failedStep:payload.failedStep,failureCode:typeof payload.failureCode==="string"&&/^[A-Z0-9_]{1,80}$/.test(payload.failureCode)?payload.failureCode:undefined,diagnosticId:payload.diagnosticId,cleanupPending:uncertain,writeOutcomeAmbiguous:payload.writeOutcomeAmbiguous});
    }catch{
      setR2Blocked(true);
      setR2Result({state:"R2_PROBE_OUTCOME_UNKNOWN",cleanupPending:true});
    }finally{r2InFlight.current=false;setR2Busy(false);}
  }
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
      restoreR2Guard();
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
          <FenicePrivateOwnerLogin onAuthenticated={reload}/>:
          <section>
            <R2ProspectiveGenesisPanel/>
            <p><strong>Stato:</strong> {status?.state||"NON_DISPONIBILE"}</p>
            <section style={{marginTop:18,padding:16,border:"1px solid #475569",borderRadius:10}} aria-label="Collaudo reale R2">
              <h2 style={{fontWeight:600}}>Collaudo reale R2</h2>
              <p>Test isolato: scrittura, lettura, SHA-256, concorrenza, CAS ed eliminazione. Non modifica il journal e non autorizza Directa.</p>
              <button type="button" disabled={r2Busy||r2Blocked} onClick={()=>void runR2Probe()} style={{background:"#334155",color:"#fff",padding:"12px 15px",borderRadius:8}}>{r2Busy?"Collaudo in corso...":"Esegui collaudo reale R2"}</button>
              {r2Result?<div role="status">
                <p>{r2Result.state}</p>
                {r2Result.checks?<ul>{R2_CHECKS.map(key=><li key={key}>{key}: {r2Result.checks?.[key]===true?"OK":"NON VERIFICATO"}</li>)}</ul>:null}
                {r2Result.failedStep?<p>Fase: {r2Result.failedStep}</p>:null}
                {r2Result.failureCode?<p>Codice: {r2Result.failureCode}</p>:null}
                {r2Result.diagnosticId?<p>ID diagnostico: {r2Result.diagnosticId}</p>:null}
                {r2Result.cleanupPending?<p>Esito o pulizia non confermati. Non ripetere il test prima della riconciliazione, anche dopo un ricaricamento della pagina.</p>:null}
              </div>:null}
            </section>
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
