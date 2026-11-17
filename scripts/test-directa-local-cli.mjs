import assert from 'node:assert/strict';
import net from 'node:net';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const root=await mkdtemp(path.join(tmpdir(),'fenice-directa-cli-'));
const shim=path.join(root,'test-home.mjs');
await writeFile(shim,`import os from 'node:os';\nimport {syncBuiltinESMExports} from 'node:module';\nos.homedir=()=>${JSON.stringify(root)};\nsyncBuiltinESMExports();\n`);
const expectations=path.join(root,'expectations.json');
const commands=[];
const responses={
  'FLOWPOINT TRUE':'FLOWPOINT;TRUE\n',
  'PRICEEXE TRUE':'PRICEEXE;TRUE\n',
  DARWINSTATUS:'DARWIN_STATUS;CONN_OK;FALSE;Synthetic release\n',
  INFOACCOUNT:'INFOACCOUNT;18:00:00;PRIVATE_ACCOUNT;1000;0;0;1000\n',
  INFOAVAILABILITY:'AVAILABILITY;18:00:00;1000;1000;0;0;1000\n',
  INFOSTOCKS:'ERR;N/A;1018\n',ORDERLIST:'ERR;N/A;1019\n',
};
const server=net.createServer(socket=>{
  socket.setEncoding('utf8');let buffer='';
  socket.on('data',chunk=>{
    buffer+=chunk;const lines=buffer.split('\n');buffer=lines.pop()??'';
    for(const line of lines){
      const command=line.trim();commands.push(command);
      assert(Object.hasOwn(responses,command),'Only fixed read-only commands are allowed');
      socket.write(responses[command]);
    }
  });
});
server.listen(0,'127.0.0.1');await once(server,'listening');
async function run(extra=[]){
  const child=spawn(process.execPath,['--experimental-strip-types','--import',shim,
    'scripts/run-directa-readonly.mjs','--port',String(server.address().port),...extra]);
  let stdout='',stderr='';
  child.stdout.on('data',x=>{stdout+=x;});child.stderr.on('data',x=>{stderr+=x;});
  const timer=setTimeout(()=>child.kill(),10_000);
  try{
    const [code]=await once(child,'exit');
    assert.notEqual(code,null,'CLI timed out');
    for(const secret of ['PRIVATE_ACCOUNT','PRIVATE_EXPECTATION_SECRET'])
      assert(!(stdout+stderr).includes(secret),'Private input leaked through CLI output');
    return {code,stdout,stderr};
  }finally{clearTimeout(timer);}
}
try{
  const none=await run();assert.equal(none.code,0);
  assert.match(none.stdout,/Broker reconciliation verified: false/);
  assert.match(none.stdout,/Reconciliation not checked/);
  await writeFile(expectations,JSON.stringify({positions:[],openOrderClientIds:[],expectedCashEuro:1000}));
  const verified=await run(['--expectations',expectations]);assert.equal(verified.code,0);
  assert.match(verified.stdout,/Broker reconciliation verified: true/);
  assert.match(verified.stdout,/Individual executions reconciled: false; live readiness verified: false/);
  const saved=JSON.parse(await readFile(path.join(root,'.fenice','directa-readonly-snapshot.json'),'utf8'));
  assert.equal(saved.writeCommandsBlocked,true);assert.equal(saved.liveTradingAllowed,false);
  await writeFile(expectations,JSON.stringify({positions:[],openOrderClientIds:[],expectedCashEuro:999}));
  const mismatch=await run(['--expectations',expectations]);assert.equal(mismatch.code,2);
  assert.match(mismatch.stdout,/break codes: CASH/);
  assert.doesNotMatch(mismatch.stdout+ mismatch.stderr,/999/);
  await writeFile(expectations,'PRIVATE_EXPECTATION_SECRET');
  const before=commands.length;
  const malformed=await run(['--expectations',expectations]);assert.equal(malformed.code,1);
  assert.match(malformed.stderr,/DIRECTA_EXPECTATION_FILE_INVALID/);
  assert.equal(commands.length,before,'Invalid private expectations must fail before connecting');
  const missing=await run(['--expectations']);assert.equal(missing.code,1);
  assert.equal(commands.length,before);
  assert.equal(commands.length,24,'Exactly three bounded eight-command read-only snapshots');
  console.log('PASS Directa CLI end-to-end: loopback-only fake Darwin, private snapshot, reconciliation success/mismatch, malformed input before network, redacted output and no orders.');
}finally{
  await new Promise(resolve=>server.close(resolve));
  await rm(root,{recursive:true,force:true});
}
