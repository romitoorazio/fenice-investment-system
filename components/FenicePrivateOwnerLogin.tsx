"use client";
import {useState} from "react";
export default function FenicePrivateOwnerLogin({onAuthenticated}:{onAuthenticated:()=>Promise<void>}){
  const [code,setCode]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function login(){
    if(busy||code.length<32)return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/analista-generativa/session",{method:"POST",credentials:"same-origin",cache:"no-store",
        headers:{Authorization:"Bearer "+code}});
      const result=await response.json() as {authenticated?:boolean};setCode("");
      if(response.ok&&result.authenticated===true)await onAuthenticated();
      else setMessage(response.status===401?"Codice proprietario non riconosciuto.":"Accesso proprietario non disponibile. Il registro non è stato modificato.");
    }catch{setMessage("Collegamento non disponibile. Accesso non confermato.");}
    finally{setCode("");setBusy(false);}
  }
  return <section>
    <p>Accedi con il codice proprietario FENICE già configurato per consultare il registro e collegare i documenti originali.</p>
    <form onSubmit={e=>{e.preventDefault();void login();}}>
      <label htmlFor="fenice-private-owner-code">Codice proprietario FENICE</label>
      <input id="fenice-private-owner-code" name="ownerCode" type="password" autoComplete="current-password"
        required minLength={32} maxLength={256} value={code} onChange={e=>setCode(e.target.value)} disabled={busy}
        style={{display:"block",width:"100%",maxWidth:480,border:"1px solid #64748b",borderRadius:6,padding:12,margin:"8px 0 14px"}}/>
      <button type="submit" disabled={busy||code.length<32}
        style={{background:"#334155",color:"white",borderRadius:8,padding:"12px 16px"}}>
        {busy?"Verifica accesso...":"Accedi al registro privato"}
      </button>
    </form>
    {message?<p role="status">{message}</p>:null}
  </section>;
}
