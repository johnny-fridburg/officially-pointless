'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const https=require('node:https'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {instanceRequest}=require('./instance-transport');
test('private transport sends authenticated POST, rejects redirects and caps actual response bytes',async t=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'pointless-tls-test-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(tmp,'key.pem'),'-out',path.join(tmp,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{stdio:'ignore'});
 const cert=fs.readFileSync(path.join(tmp,'cert.pem')),oldCa=https.globalAgent.options.ca;https.globalAgent.options.ca=cert;
 const server=https.createServer({key:fs.readFileSync(path.join(tmp,'key.pem')),cert},(req,res)=>{
  if(req.url==='/redirect'){res.writeHead(302,{Location:'/success'});res.end();return;}
  if(req.url==='/oversize'){res.end(Buffer.alloc(4*1024*1024+1));return;}
  if(req.url==='/timeout')return;
  let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({key:req.headers['x-functions-key'],body:JSON.parse(body)}));});
 });
 await new Promise(resolve=>server.listen(0,resolve));
 t.after(()=>{server.closeAllConnections();server.close();https.globalAgent.options.ca=oldCa;fs.rmSync(tmp,{recursive:true,force:true});});
 const root='https://localhost:'+server.address().port;
 const options={method:'POST',headers:{'Content-Type':'application/json','x-functions-key':'fixture-key'},body:JSON.stringify({sku:'fixture-sku'}),signal:AbortSignal.timeout(5000)};
 const r=await instanceRequest(root+'/success',options);assert.equal(r.status,200);assert.deepEqual(await r.json(),{key:'fixture-key',body:{sku:'fixture-sku'}});
 await assert.rejects(()=>instanceRequest(root+'/redirect',options),/backend_redirect/);
 await assert.rejects(()=>instanceRequest(root+'/oversize',options),/backend_response_limit/);
 await assert.rejects(()=>instanceRequest(root+'/timeout',{...options,signal:AbortSignal.timeout(20)}),/backend_timeout/);
});
