// Configuration only. Never switches the authoritative journal or exposes credentials.
export function resolvePrivateR2Config(env=process.env){
  const keys=['R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_ENDPOINT','R2_BUCKET_NAME'];
  if(keys.some(k=>typeof env[k]!=='string'||!env[k].trim()))throw Error('R2_CONFIGURATION_INCOMPLETE');
  let endpoint;
  try{endpoint=new URL(env.R2_ENDPOINT);}catch{throw Error('R2_ENDPOINT_INVALID');}
  if(endpoint.protocol!=='https:'||! /^[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname)||endpoint.username||endpoint.password||endpoint.port||endpoint.pathname!=='/'||endpoint.search||endpoint.hash)throw Error('R2_ENDPOINT_INVALID');
  if(env.R2_BUCKET_NAME!=='fenice-private-storage')throw Error('R2_BUCKET_INVALID');
  return {endpoint:endpoint.origin,bucket:env.R2_BUCKET_NAME,accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY,region:'auto'};
}
