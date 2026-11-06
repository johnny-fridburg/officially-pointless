'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createInstanceProxy,createIssuedCertificateVerifier}=require('./instance-proxy');
const sku='certificate-minister-of-unopened-tabs';
const env={POINTLESS_INSTANCE_BACKEND_URL:'https://officially-pointless-instances.azurewebsites.net',POINTLESS_INSTANCE_BACKEND_KEY:'k'.repeat(64)};
const req=body=>({method:'POST',headers:{origin:'https://promotions.officiallypointless.com'},body});
const png='iVBORw0KGgo=';

test('proxy forwards only strict preview fields and returns marked pixels/token without backend credentials',async()=>{
 let actual;
 const handler=createInstanceProxy({env,request:async(url,options)=>{
  actual={url,options};return new Response(JSON.stringify({preview:'data:image/png;base64,'+png,instance:'signed-preview-token'}),{status:200});
 }});
 const context={};await handler(context,req({action:'preview',sku,recipient:'Alex',giver:'Sam'}));
 assert.equal(context.res.status,200);
 assert.deepEqual(context.res.body,{preview:'data:image/png;base64,'+png,instance:'signed-preview-token'});
 assert.equal(actual.url,env.POINTLESS_INSTANCE_BACKEND_URL+'/api/instances/preview');
 assert.equal(actual.options.headers['x-functions-key'],env.POINTLESS_INSTANCE_BACKEND_KEY);
 assert.equal(JSON.stringify(context.res).includes(env.POINTLESS_INSTANCE_BACKEND_KEY),false);
 assert.equal(context.res.headers['Cache-Control'],'no-store');
});

test('forged flags, untrusted origins and unconfigured backend never call the renderer',async()=>{
 let calls=0;const request=async()=>{calls++;throw Error('must not call');};
 const handler=createInstanceProxy({env,request});
 for(const body of [{action:'preview',sku,recipient:'Alex',giver:'Sam',paid:true},
   {action:'deliver',instance:'token',license:'ABCD-1234-EFGH-5678',format:'svg'},
   {action:'preview',sku:'../private',recipient:'Alex',giver:'Sam'}]){
  const c={};await handler(c,req(body));assert.equal(c.res.status,400);
 }
 const c={};await handler(c,{...req({}),headers:{origin:'https://evil.example'}});assert.equal(c.res.status,403);
 const closed=createInstanceProxy({env:{},request});const d={};
 await closed(d,req({action:'preview',sku,recipient:'Alex',giver:'Sam'}));assert.equal(d.res.status,503);
 assert.equal(calls,0);
});

test('payment denial and malformed or redirected provider responses cannot expose finished files',async()=>{
 for(const response of [new Response(JSON.stringify({error:'payment_required',private:'secret'}),{status:402}),
   new Response(JSON.stringify({png,pdf:'JVBERi0=',filename:'minister-of-unopened-tabs',source:'editable'})),
   new Response('',{status:302,headers:{location:'https://evil.example'}})]){
  const handler=createInstanceProxy({env,request:async()=>response});const c={};
  await handler(c,req({action:'deliver',instance:'token',license:'ABCD-1234-EFGH-5678'}));
  assert.ok([402,503].includes(c.res.status));assert.deepEqual(Object.keys(c.res.body),['error']);
 }
});

test('internal public-honor proof matches the authoritative issued recipient without exposing an issuance route',async()=>{
 const verifier=createIssuedCertificateVerifier({env,request:async(url,options)=>{
  assert.equal(url,env.POINTLESS_INSTANCE_BACKEND_URL+'/api/instances/issued');
  assert.deepEqual(JSON.parse(options.body),{sku,license:'ABCD-1234-EFGH-5678',recipient:'Issued Recipient'});
  return new Response(JSON.stringify({owner:'a'.repeat(64),recipient:'Issued Recipient'}));
 }});
 assert.deepEqual(await verifier('ABCD-1234-EFGH-5678',sku,'Issued Recipient'),{owner:'a'.repeat(64),recipient:'Issued Recipient'});
 const denied=createIssuedCertificateVerifier({env,request:async()=>new Response(JSON.stringify({error:'issued_recipient_required'}),{status:403})});
 await assert.rejects(()=>denied('ABCD-1234-EFGH-5678',sku,'Other'),error=>error.code==='issued_recipient_required');
 const context={};await createInstanceProxy({env})(context,req({action:'issued',sku,license:'ABCD-1234-EFGH-5678',recipient:'Issued Recipient'}));
 assert.equal(context.res.status,400);
});

test('browser-safe text JSON is parsed strictly after origin validation',async()=>{
 const handler=createInstanceProxy({env,request:async(url,options)=>{
  assert.deepEqual(JSON.parse(options.body),{sku,recipient:'Alex',giver:'Sam'});
  return new Response(JSON.stringify({preview:'data:image/png;base64,'+png,instance:'signed-preview-token'}));
 }});
 const raw=JSON.stringify({action:'preview',sku,recipient:'Alex',giver:'Sam'});
 const c={};await handler(c,{...req(raw),headers:{origin:'https://promotions.officiallypointless.com','content-type':'text/plain;charset=UTF-8'}});
 assert.equal(c.res.status,200);
 for(const body of [raw.slice(1),JSON.stringify({action:'preview',sku,recipient:'Alex',giver:'Sam',paid:true})]){
  const bad={};await handler(bad,{...req(body),headers:{origin:'https://promotions.officiallypointless.com','content-type':'text/plain;charset=UTF-8'}});assert.equal(bad.res.status,400);
 }
 const foreign={};await handler(foreign,{...req(raw),headers:{origin:'https://evil.example','content-type':'text/plain'}});assert.equal(foreign.res.status,403);
});

