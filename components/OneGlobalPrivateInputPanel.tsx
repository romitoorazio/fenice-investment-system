"use client";
import {useEffect,useState} from "react";
type InputStatus={state:string;contextPresent?:boolean;contextEtag?:string|null;
  originalConsentValid?:boolean;originalDocumentCount?:number;blockers?:string[];};
type ArchiveAudit={state:string;archiveScanComplete?:boolean;examinedArchiveObjects?:number;
  verifiedArchivedContexts?:number;pendingWithoutCurrentMappings?:number;
  historicalMappingCandidates?:{key:string;mic:string;archivedWithCurrentConsent:boolean}[]};
const endpoint="/api/paper/one-global-private-inputs";
const style={border:"1px solid #475569",borderRadius:10,padding:16,marginTop:20};
function blockerText(code:string){
  if(code.includes("ORIGINAL_CONTEXT_NOT_CONNECTED"))return "Carica il consenso originale già approvato.";
  if(code.includes("OWNER_REVIEWED_MARKET_MAPPING")||code.includes("SOURCES_AND_RIGHTS"))return "Mancano i documenti dei provider e i collegamenti alle fonti del segnale.";
  if(code.includes("UPSTREAM"))return "Serve la prova che le due fonti siano indipendenti.";
  if(code.includes("RIGHTS"))return "Mancano diritti d’uso dei provider validi per questa simulazione.";
  if(code.includes("SESSION")||code.includes("WINDOW"))return "La seduta o la finestra temporale richiede ancora una verifica valida.";
  if(code.includes("CONSENT"))return "Il consenso originale non è valido o è scaduto.";
  return "I documenti non superano ancora tutti i controlli richiesti.";
}
export default function OneGlobalPrivateInputPanel(){
  const [status,setStatus]=useState<InputStatus|null>(null);
  const [kind,setKind]=useState("ORIGINAL_OWNER_PAPER_CONSENT");
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [note,setNote]=useState("");
  const [archiveAudit,setArchiveAudit]=useState<ArchiveAudit|null>(null);
  const [auditBusy,setAuditBusy]=useState(false);
  async function auditArchives(){
    if(auditBusy||busy)return;
    setAuditBusy(true);setArchiveAudit(null);
    try{
      const response=await fetch(endpoint+"?archiveAudit=1",{credentials:"same-origin",cache:"no-store"});
      const result=await response.json() as ArchiveAudit;
      if(!response.ok)throw Error(result.state||"AUDIT_UNAVAILABLE");
      setArchiveAudit(result);
    }catch{setNote("Verifica archivio storico non disponibile: nessun dato è stato modificato.");}
    finally{setAuditBusy(false);}
  }
  async function refresh(){
    const response=await fetch(endpoint,{credentials:"same-origin",cache:"no-store"});
    const result=await response.json() as InputStatus;
    if(!response.ok)throw Error("PRIVATE_INPUT_STATUS_UNAVAILABLE");
    setStatus(result);
  }
  useEffect(()=>{let current=true;
    void fetch(endpoint,{credentials:"same-origin",cache:"no-store"})
      .then(async response=>{if(!response.ok)throw Error("PRIVATE_INPUT_STATUS_UNAVAILABLE");return response.json() as Promise<InputStatus>;})
      .then(result=>{if(current)setStatus(result);})
      .catch(()=>{if(current)setNote("Verifica dei documenti privati non disponibile.");});
    return ()=>{current=false;};
  },[]);
  async function upload(){
    if(!file||!status||busy)return;
    if(file.size<20||file.size>500000){setNote("Seleziona un file JSON originale, massimo 500 kB.");return;}
    setBusy(true);setNote("");
    try{
      const bytes=new Uint8Array(await file.arrayBuffer());
      let binary="";for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
      const response=await fetch(endpoint,{method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({kind,documentBase64:btoa(binary),expectedEtag:status.contextEtag??null})});
      const result=await response.json() as InputStatus;
      if(response.ok){
        setStatus(result);setFile(null);
        setNote("Originali collegati e riletti nel deposito privato. L’importazione non crea operazioni PAPER.");
      }else{
        setNote(result.state.includes("RELOAD")?"I documenti sono cambiati. Lo stato è stato riletto: verifica prima di ripetere.":
          "Importazione non confermata. "+blockerText(result.state)+" Codice: "+result.state);
        await refresh();
      }
    }catch{setNote("Importazione non confermata. Ricontrolla lo stato prima di ripetere.");}
    finally{setBusy(false);}
  }
  return <section style={style}>
    <h2 style={{fontWeight:600}}>Documenti originali per il PAPER cloud</h2>
    <p>Carica il consenso già approvato oppure il pacchetto delle prove originali. Il contenuto resta privato e il registro delle operazioni viene conservato.</p>
    {status?<>
      <p>Consenso originale: <strong>{status.originalConsentValid?"collegato e valido":"non ancora validato nel cloud"}</strong>. Documenti verificati: {status.originalDocumentCount??0}.</p>
      {status.blockers?.length?<p>{[...new Set(status.blockers.map(blockerText))].join(" ")}</p>:null}
    </>:<p>Controllo dei documenti privati...</p>}
    <label style={{display:"block",marginTop:10}}>Tipo di originale
      <select value={kind} onChange={e=>{setKind(e.target.value);setFile(null);}} disabled={busy}
        style={{display:"block",padding:10,border:"1px solid #64748b",borderRadius:6,width:"100%"}}>
        <option value="ORIGINAL_OWNER_PAPER_CONSENT">Consenso PAPER originale (.json)</option>
        <option value="SETTLEMENT_CONTEXT">Pacchetto completo di prove originali (.json)</option>
      </select>
    </label>
    <label style={{display:"block",marginTop:12}}>File originale, massimo 500 kB
      <input key={kind} type="file" accept=".json,application/json" disabled={busy}
        onChange={e=>setFile(e.target.files?.[0]??null)} style={{display:"block",padding:"10px 0",maxWidth:"100%"}}/>
    </label>
    <button type="button" disabled={busy||!file||!status} onClick={()=>void upload()}
      style={{padding:"12px 16px",borderRadius:8,background:"#334155",color:"white"}}>
      {busy?"Verifica e collegamento...":"Collega gli originali al cloud"}
    </button>
    <button type="button" disabled={busy} onClick={()=>void refresh().catch(()=>setNote("Verifica privata non disponibile."))}
      style={{padding:"12px 16px",border:"1px solid #64748b",borderRadius:8,marginLeft:8}}>Ricontrolla documenti</button>
    <div style={{borderTop:"1px solid #475569",marginTop:18,paddingTop:12}}>
      <h3 style={{fontWeight:600}}>Ricerca delle prove originali già archiviate</h3>
      <p>Controllo privato in sola lettura. Non recupera automaticamente licenze, non genera FILL e non modifica autorizzazioni.</p>
      <button type="button" disabled={busy||auditBusy} onClick={()=>void auditArchives()}
        style={{padding:"10px 14px",border:"1px solid #64748b",borderRadius:8}}>
        {auditBusy?"Verifica archivio...":"Cerca mapping già documentati"}
      </button>
      {archiveAudit?<div role="status">
        <p>Esito: <strong>{archiveAudit.state}</strong>. Oggetti esaminati: {archiveAudit.examinedArchiveObjects??0};
          contesti originali verificati: {archiveAudit.verifiedArchivedContexts??0}.</p>
        <p>Ricerca {archiveAudit.archiveScanComplete?"completa":"parziale: l’assenza di risultati non prova che manchino gli originali"}.
          Segnali senza mapping attuale: {archiveAudit.pendingWithoutCurrentMappings??0}.</p>
        {archiveAudit.historicalMappingCandidates?.map(m=><p key={m.key}>
          {m.key}: mapping storico trovato; consenso {m.archivedWithCurrentConsent?"coincidente":"diverso o non verificato"}.
          Serve verifica delle condizioni originali prima di riutilizzarlo.</p>)}
      </div>:null}
    </div>
    {note?<p role="status">{note}</p>:null}
    <p style={{fontSize:13}}>Il consenso non sostituisce i diritti dei provider, la prova delle fonti indipendenti e della seduta. Queste autorizzazioni non vengono generate dal software.</p>
  </section>;
}
