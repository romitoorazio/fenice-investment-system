/** Fixed GitHub -> FENICE trust boundary. No static secret, vendor data or broker. */
import {createPublicKey,verify} from 'node:crypto';

export const SIGNAL_CYCLE_AUDIENCE='https://fenice-investment-system.vercel.app/api/paper/one-global-private-signal-cycle';
const ISSUER='https://token.actions.githubusercontent.com';
const REPO='romitoorazio/fenice-investment-system';
const WORKFLOW=REPO+'/.github/workflows/one-global-eod-private-paper.yml@refs/heads/main';
const fail=()=>{throw Error('CLOUD_WORKFLOW_AUTH_DENIED');};
const segment=s=>{
  if(typeof s!=='string'||!/^[A-Za-z0-9_-]+$/.test(s))fail();
  const b=Buffer.from(s,'base64url');
  if(b.toString('base64url')!==s)fail();
  return b;
};
function object(s){
  try{const o=JSON.parse(segment(s).toString('utf8'));
    if(!o||typeof o!=='object'||Array.isArray(o))fail();return o;
  }catch{fail();}
}
export async function authorizeOneGlobalCloudWorkflow({token,nowMs=Date.now(),fetcher=fetch}={}){
  try{
    if(typeof token!=='string'||token.length<100||token.length>16000
      ||!Number.isFinite(nowMs))fail();
    const parts=token.split('.');if(parts.length!==3)fail();
    const h=object(parts[0]),c=object(parts[1]);
    const now=Math.floor(nowMs/1000);
    if(h.alg!=='RS256'||h.typ!=='JWT'||typeof h.kid!=='string'
      ||!/^[-A-Za-z0-9_.]{1,128}$/.test(h.kid)
      ||Object.keys(h).some(k=>!['alg','typ','kid','x5t'].includes(k))
      ||c.iss!==ISSUER||c.aud!==SIGNAL_CYCLE_AUDIENCE
      ||c.repository!==REPO||c.repository_id!=='1298430952'
      ||c.repository_owner_id!=='255534957'||c.repository_owner!=='romitoorazio'
      ||c.ref!=='refs/heads/main'||c.ref_type!=='branch'
      ||c.workflow_ref!==WORKFLOW
      ||!['schedule','workflow_dispatch','workflow_run'].includes(c.event_name)
      ||!['repo:'+REPO+':ref:refs/heads/main',
        'repo:romitoorazio@255534957/fenice-investment-system@1298430952:ref:refs/heads/main'].includes(c.sub)
      ||!/^[a-f0-9]{40}$/.test(c.sha||'')
      ||!/^[0-9]{1,20}$/.test(c.run_id||'')
      ||![c.exp,c.iat,c.nbf].every(Number.isSafeInteger)
      ||c.exp<=now||c.iat>now+30||c.nbf>now+30
      ||c.iat<now-600||c.exp-c.iat>900||c.exp<=c.iat)fail();
    // Never honor jku/x5u/iss URLs from the untrusted token. No redirects,
    // bounded timeout/body, and a freshly fetched GitHub signing key set.
    const response=await fetcher(ISSUER+'/.well-known/jwks',{
      redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000),
      headers:{Accept:'application/json'},
    });
    if(!response.ok)fail();
    const text=await response.text();if(text.length>100000)fail();
    const jwks=JSON.parse(text);
    if(!Array.isArray(jwks.keys)||jwks.keys.length>20)fail();
    const matches=jwks.keys.filter(k=>k.kid===h.kid&&k.kty==='RSA'
      &&k.use==='sig'&&k.alg==='RS256');
    if(matches.length!==1)fail();
    const key=createPublicKey({key:matches[0],format:'jwk'});
    if(key.asymmetricKeyType!=='rsa'||key.asymmetricKeyDetails?.modulusLength<2048
      ||!verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),key,segment(parts[2])))fail();
    return {authorized:true};
  }catch{fail();}
}
