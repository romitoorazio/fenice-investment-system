"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {inspectBrowserStatus,type LocalStatus} from "@/lib/ui/directa-browser-status";
type FileHandle = {name:string;getFile:()=>Promise<File>};
type Picker = Window & {showOpenFilePicker?:(options?:object)=>Promise<FileHandle[]>};
export default function DirectaBrowserStatus() {
  const handle=useRef<FileHandle|null>(null);
  const [value,setValue]=useState<LocalStatus|null>(null);
  const [fresh,setFresh]=useState(false);
  const [message,setMessage]=useState("Nessun file selezionato.");
  const [supported,setSupported]=useState(true);
  const refresh=useCallback(async()=>{
    if(!handle.current)return;
    try{
      const file=await handle.current.getFile();
      if(file.name!=="directa-local-monitor-status.json" || file.size>10240)throw Error("UNSAFE_FILE");
      // This is client-side File API reading; no network request or persistence.
      const result=inspectBrowserStatus(JSON.parse(await file.text()));
      setValue(result.status);setFresh(result.fresh);
      setMessage(result.reason==="OK"?"Stato locale letto. Nessun dato inviato al cloud."
        :result.reason==="STALE"?"Dati scaduti: controlla Darwin e il monitor."
        :"File diagnostico non valido.");
    }catch{setValue(null);setFresh(false);setMessage("File non accessibile o non valido. Non selezionare lo snapshot del conto.");}
  },[]);
  useEffect(()=>{
    setSupported(typeof(window as Picker).showOpenFilePicker==="function");
    const timer=window.setInterval(()=>{void refresh()},10000);
    const onVisible=()=>{if(!document.hidden)void refresh()};
    document.addEventListener("visibilitychange",onVisible);
    return ()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",onVisible)};
  },[refresh]);
  const choose=async()=>{
    const picker=(window as Picker).showOpenFilePicker;
    if(!picker){setMessage("Apri questa pagina con Chrome o Edge sul PC con Directa.");return;}
    try {
      const items=await picker({multiple:false,types:[{description:"Riepilogo JSON",accept:{"application/json":[".json"]}}]});
      if(!items?.[0])return;
      if(items[0].name!=="directa-local-monitor-status.json"){
        setMessage("Scegli esclusivamente directa-local-monitor-status.json dalla cartella .fenice.");return;
      }
      handle.current=items[0];await refresh();
    }catch(e){if(e && typeof e==="object" && "name" in e && e.name==="AbortError")return;setMessage("Impossibile aprire il file locale.");}
  };
  const ok=fresh && value?.state==="CURRENT_COMPLETE" && value.snapshotState==="CURRENT_COMPLETE" && value.connectionHealthy===true;
  const match=ok && value?.comparison==="MATCHED_UNCERTIFIED";
  return <section className="rounded-2xl border border-cyan-300/20 bg-slate-900 p-6" aria-label="Diagnostica locale Directa">
    <h2 className="text-xl font-bold">Directa · Stato locale dal tuo PC</h2>
    <p className="mt-3 text-sm leading-6 text-slate-300">Con Darwin e il monitor aperti sullo stesso PC, seleziona il file
      <code> directa-local-monitor-status.json </code>dalla cartella privata .fenice. Il browser lo rilegge ogni 10 secondi,
      senza caricare il file su Vercel. Non selezionare mai il file dello snapshot del conto.</p>
    <button type="button" onClick={()=>void choose()} disabled={!supported}
      className="mt-4 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">
      Seleziona riepilogo locale
    </button>
    <p className="mt-3 text-sm text-slate-300" role="status" aria-live="polite">{message}</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-slate-400">API locale</p>
        <p className={ok?"font-bold text-emerald-300":"font-bold text-amber-200"}>{ok?"Lettura corrente":"Non verificata / scaduta"}</p></div>
      <div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-slate-400">Confronto locale</p>
        <p className={match?"font-bold text-emerald-300":"font-bold text-amber-200"}>{match?"Coerente, non certificato":ok?value?.comparison:"Non verificato"}</p></div>
      <div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-slate-400">Trading reale</p>
        <p className="font-bold text-amber-200">Bloccato</p></div>
    </div>
    <p className="mt-3 text-xs text-slate-400">Il cloud non è collegato a Directa. Questo pannello è informativo e non autorizza ordini o certifica PAPER.</p>
  </section>;
}
