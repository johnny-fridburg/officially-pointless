'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createCommunityHandler}=require('./community-service');
const {createGoogleVerifier}=require('./google-identity');
const {TestStore,call,submission,auth,credential,clientId,jwk}=require('../test/community-fixtures');
const verifier=()=>createGoogleVerifier({clientId,fetchKeys:async()=>({keys:[jwk],maxAge:3600})});
function setup(){const store=new TestStore();let time=Date.now();return {store,handler:createCommunityHandler({store,verifyIdentity:verifier(),clientId,now:()=>time}),advance:ms=>{time+=ms;}};}

test('all seven departments publish real records readable by a second handler',async()=>{
 const {store,handler}=setup();
 for(const feature of ['make-it-worse','silence','loading','last-word','museum','golden-error','button']){
  const published=await call(handler,'POST',submission(feature,{theme:'chaos'}),{},auth());assert.equal(published.status,201,feature);assert.match(published.body.record.id,/^[a-f0-9]{24}$/);
  const other=createCommunityHandler({store,clientId});const view=await call(other,'GET',undefined,{id:published.body.record.id});assert.equal(view.body.record.name,'Alex');assert.equal(view.body.record.feature,feature);
  assert(!JSON.stringify(view.body).includes('owner'));assert(!JSON.stringify(view.body).includes('receipts'));assert(!JSON.stringify(view.body).includes('test-user'));
 }
 const state=(await call(handler)).body;assert.equal(state.theme,'chaos');assert.equal(state.delaySeconds,10);assert.equal(state.lastWord.text,'I was right about the snacks.');
});
test('Google signature, audience, issuer and expiration are verified before publishing',async()=>{
 const {handler}=setup();const body=submission();
 for(const token of ['not-a-token',credential('user',{aud:'wrong'}),credential('user',{iss:'https://evil.invalid'}),credential('user',{exp:1}),credential('user',{iat:Math.floor(Date.now()/1000)+3600}),credential('user').slice(0,-8)+'invalid']){
  assert.equal((await call(handler,'POST',body,{}, {origin:'https://officiallypointless.com',authorization:'Bearer '+token})).status,401);
 }
 assert.equal((await call(handler,'POST',body)).status,401);assert.equal((await call(handler)).body.departments['last-word'].length,0);
});
test('idempotent retries reuse record while changed content fails',async()=>{
 const {handler}=setup();const body=submission(),headers=auth();const first=await call(handler,'POST',body,{},headers);const retry=await call(handler,'POST',body,{},headers);assert.equal(retry.body.record.id,first.body.record.id);assert.equal(retry.status,200);
 assert.equal((await call(handler,'POST',{...body,text:'changed'}, {},headers)).status,409);assert.equal((await call(handler)).body.departments['last-word'].length,1);
});
test('simultaneous conditional writes retain both contributions',async()=>{
 const {handler,store}=setup();const second=createCommunityHandler({store,verifyIdentity:verifier(),clientId});const results=await Promise.all([call(handler,'POST',submission(),{},auth()),call(second,'POST',submission(),{},auth())]);assert.deepEqual(results.map(r=>r.status),[201,201]);assert.equal((await call(handler)).body.departments['last-word'].length,2);
});
test('only the Google owner can remove a record and prior word returns',async()=>{
 const {handler}=setup();const ownerA=auth(),ownerB=auth();const a=await call(handler,'POST',submission(),{},ownerA);const b=await call(handler,'POST',submission('last-word',{text:'second'}),{},ownerB);
 assert.equal((await call(handler,'DELETE',{id:b.body.record.id},{},ownerA)).status,403);assert.equal((await call(handler,'DELETE',{id:b.body.record.id},{},ownerB)).status,200);assert.equal((await call(handler)).body.lastWord.id,a.body.record.id);assert.equal((await call(handler,'GET',undefined,{id:b.body.record.id})).status,404);
});
test('cross-origin and originless mutations fail; browsing remains public',async()=>{
 const {handler}=setup();const body=submission();assert.equal((await call(handler,'POST',body,{}, {...auth(),origin:'https://evil.invalid'})).status,403);assert.equal((await call(handler,'POST',body,{}, {authorization:auth().authorization})).status,403);assert.equal((await call(handler,'GET',undefined,{},{})).status,200);
});
test('blank names, unknown fields, controls and invalid images fail without mutation',async()=>{
 const {handler}=setup();for(const extra of [{name:' '},{extra:'surprise'},{text:'bad\u0000text'},{photo:'data:image/png;base64,'+'A'.repeat(50000)},{photo:'data:image/svg+xml,<svg/>'},{theme:'javascript:evil'}])assert.equal((await call(handler,'POST',submission(extra.photo?'museum':'make-it-worse',extra),{},auth())).status,400);
 const body=submission('last-word',{text:'<img src=x onerror=alert(1)>'});assert.equal((await call(handler,'POST',body,{},auth())).status,201);assert.equal((await call(handler)).body.lastWord.text,body.text);
});
test('rate limits apply to a Google identity and do not invent a result',async()=>{
 const {handler}=setup(),headers=auth();assert.equal((await call(handler,'POST',submission('button'),{},headers)).status,201);assert.equal((await call(handler,'POST',submission('button'),{},headers)).status,429);assert.equal((await call(handler)).body.departments.button.length,1);
});
test('missing or failed durable storage returns closed generic errors',async()=>{
 const missing=createCommunityHandler({store:null});const response=await call(missing);assert.equal(response.status,503);assert.equal(response.body.error,'community_unavailable');const broken=createCommunityHandler({store:{read:async()=>{throw Error('secret SAS URL');}}});const failed=await call(broken);assert.equal(failed.status,503);assert(!JSON.stringify(failed).includes('secret SAS'));
});
test('operator can remove reported entries using a server-only token',async()=>{
 const {store,handler}=setup();const result=await call(handler,'POST',submission(),{},auth());const admin='operator-secret-'.repeat(3);const operator=createCommunityHandler({store,adminToken:admin});assert.equal((await call(operator,'DELETE',{id:result.body.record.id},{},{origin:'https://officiallypointless.com',authorization:'Bearer '+admin})).status,200);
});
test('only the verified owner sees a removal control on public reads',async()=>{
 const {handler}=setup(),owner=auth();const result=await call(handler,'POST',submission(),{},owner);
 assert.equal((await call(handler,'GET',undefined,{id:result.body.record.id},owner)).body.record.canRemove,true);
 assert.equal((await call(handler,'GET',undefined,{id:result.body.record.id},auth())).body.record.canRemove,false);
});
test('blob persistence uses ETag compare-and-swap and never accepts a non-Azure endpoint',async()=>{
 const {createBlobStore}=require('./community-store');assert.equal(createBlobStore('https://evil.invalid/container/state?sig=private'),null);assert.equal(createBlobStore('http://teststore.blob.core.windows.net/container/state?sig=private'),null);
 let state=null,etag=null;const store=createBlobStore('https://teststore.blob.core.windows.net/community/state?sig=private',{request:async(url,options)=>{
  assert(!url.includes('evil'));if(options.method==='PUT'){assert.equal(options.headers['x-ms-blob-type'],'BlockBlob');if((options.headers['If-Match']||null)!==etag)return new Response('',{status:412});if(!etag)assert.equal(options.headers['If-None-Match'],'*');state=JSON.parse(options.body);etag='"v'+(Number(etag?.match(/\d+/)?.[0]||0)+1)+'"';return new Response('',{status:201});}return state?new Response(JSON.stringify(state),{headers:{etag}}):new Response('',{status:404});
 }});
 assert.deepEqual(await store.read(),{state:null,etag:null});assert.equal(await store.write({version:1},null),true);const old=await store.read();assert.equal(await store.write({version:2},old.etag),true);assert.equal(await store.write({version:3},old.etag),false);assert.equal((await store.read()).state.version,2);
});
test('normalized PNG photo is public only in its individual exhibit response',async()=>{
 const {deflateSync}=require('node:zlib');function crc(data){let c=0xffffffff;for(const b of data){c^=b;for(let n=0;n<8;n++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}function chunk(type,data){const name=Buffer.from(type),header=Buffer.alloc(4),checksum=Buffer.alloc(4);header.writeUInt32BE(data.length);checksum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([header,name,data,checksum]);}
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(1,0);ihdr.writeUInt32BE(1,4);ihdr[8]=8;ihdr[9]=6;const png=Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255]))),chunk('IEND',Buffer.alloc(0))]);const photo='data:image/png;base64,'+png.toString('base64');const {handler}=setup();const res=await call(handler,'POST',submission('museum',{photo}),{},auth());assert.equal(res.status,201);const summary=(await call(handler)).body.departments.museum[0];assert.equal(summary.hasPhoto,true);assert.equal(summary.photo,undefined);assert.equal((await call(handler,'GET',undefined,{id:res.body.record.id})).body.record.photo,photo);
 const tampered=Buffer.from(png);tampered[50]^=1;assert.equal((await call(handler,'POST',submission('museum',{photo:'data:image/png;base64,'+tampered.toString('base64')}),{},auth())).status,400);
});
test('capacity limit preserves existing permanent links rather than evicting them',async()=>{
 const {handler,store}=setup();const first=await call(handler,'POST',submission('museum'),{},auth());for(let n=1;n<100;n++)store.state.records.push({...store.state.records[0],id:n.toString(16).padStart(24,'0')});assert.equal((await call(handler,'POST',submission('museum'),{},auth())).status,409);assert.equal((await call(handler,'GET',undefined,{id:first.body.record.id})).status,200);
});
test('Google signing-key rotation refreshes a still-cached key set once',async()=>{
 let fetched=0;const verify=createGoogleVerifier({clientId,fetchKeys:async()=>({keys:++fetched===1?[jwk]:[{...jwk,kid:'rotated-key'}],maxAge:3600})});
 assert.equal((await verify(credential('owner'))).sub,'owner');assert.equal((await verify(credential('owner',{},'rotated-key'))).sub,'owner');assert.equal(fetched,2);
});
