'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const access=fs.existsSync(__dirname+'/department-access.js')?require('./department-access'):{};
const service=fs.existsSync(__dirname+'/department-service.js')?require('./department-service'):{};
const {TestStore}=require('../test/community-fixtures');
const departments=require('./departments.json');
const {randomUUID}=require('node:crypto');
const KEY='00000000-11111111-22222222-33333333',PRODUCT='department-product-fixture';
const purchase=extra=>({product_id:PRODUCT,short_product_id:'fixtureabc',permalink:'department-collection',sale_id:'fixture-sale-1',license_key:KEY,price:1900,currency:'usd',refunded:false,chargebacked:false,disputed:false,dispute_won:false,is_gift_receiver_purchase:false,...extra});
function verifier(extra={},request){assert.equal(typeof access.createLicenseVerifier,'function','Authoritative license verifier is missing');return access.createLicenseVerifier({productId:PRODUCT,request:request||(async()=>new Response(JSON.stringify({success:true,purchase:purchase(extra)}),{headers:{'content-type':'application/json'}}))});}
function setup(extra={},providerExtra={}){assert.equal(typeof service.createDepartmentHandler,'function','Paid department service is missing');let time=Date.now();const store=new TestStore();const handler=service.createDepartmentHandler({enabled:true,store,verifyLicense:verifier(providerExtra),now:()=>time,...extra});return {store,handler,advance:ms=>time+=ms};}
async function call(handler,action,body={},key=KEY,method='POST',origin='https://officiallypointless.com',query={}){const context={};await handler(context,{method,params:{action},headers:{origin,'x-pointless-license':key},query,body});return context.res;}
const input=(slug='last-word',extra={})=>({department:slug,name:'Alex',giver:'Sam',text:'The snacks were the point.',title:'An ordinary mug',theme:'classic',requestId:randomUUID(),...extra});

test('fixed provider verifies product and key without incrementing uses or exposing private payment data',async()=>{
 const verify=verifier({},async(url,options)=>{assert.equal(url,'https://api.gumroad.com/v2/licenses/verify');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');const form=new URLSearchParams(options.body);assert.equal(form.get('product_id'),PRODUCT);assert.equal(form.get('license_key'),KEY);assert.equal(form.get('increment_uses_count'),'false');return new Response(JSON.stringify({success:true,purchase:purchase({email:'private-fixture@example.invalid',card:{visual:'private-card'}})}));});
 const grant=await verify(KEY);assert.match(grant.owner,/^[a-f0-9]{64}$/);assert.match(grant.credentialHash,/^[a-f0-9]{64}$/);assert.equal(Object.keys(grant).length,2);assert(!JSON.stringify(grant).includes(KEY));
});
test('wrong-product, mismatched, missing, free, refunded, disputed, chargebacked, test and subscription purchases fail closed',async()=>{
 for(const extra of [{product_id:'gift-kit-product'}, {permalink:'unnecessary-promotions'}, {license_key:'different-key'},{sale_id:''},{price:0},{price:'1900'},{refunded:true},{chargebacked:true},{disputed:true},{test:true},{subscription_id:'subscription'},{subscription_ended_at:'2026-01-01'},{is_recurring_charge:true},{is_preorder_authorization:true},{refunded:undefined},{disputed:undefined}]){
  await assert.rejects(()=>verifier(extra)(KEY),error=>error.code==='payment_required',JSON.stringify(extra));
 }
 await assert.rejects(()=>verifier()(KEY+' '));
});
test('documented omitted test flag is valid; native provider gifting is closed in the first edition',async()=>{
 const own=await verifier()(KEY);assert(own.owner);
 await assert.rejects(()=>verifier({is_gift_receiver_purchase:true,price:0,gift_price:1900})(KEY));
 await assert.rejects(()=>verifier({is_gift_receiver_purchase:true,price:0,gift_price:0})(KEY));
});
test('provider failure, redirect, invalid JSON and oversized response grant nothing',async()=>{
 for(const request of [async()=>{throw Error('private provider detail');},async()=>new Response('',{status:500}),async()=>new Response('bad JSON'),async()=>new Response('A'.repeat(65537))])await assert.rejects(()=>verifier({},request)(KEY),error=>error.code==='payment_unavailable');
 await assert.rejects(()=>verifier({},async()=>new Response(JSON.stringify({success:false}),{status:404}))(KEY),error=>error.code==='payment_required');
});
test('closed handler rejects all activity calls even with forged payment queries and accepted-looking headers',async()=>{
 const {handler}=setup({enabled:false});
 for(const action of ['access','gift','publish','remove','presence']){const response=await call(handler,action,{paid:true},KEY,action==='presence'?'GET':'POST',undefined,{paid:'true',checkout_return:'success'});assert.equal(response.status,503);assert.equal(response.body.error,'paid_access_not_open');}
 const status=await call(handler,'status',{},'', 'GET');assert.equal(status.body.enabled,false);
});
test('payment is verified again on each access, gift and publication request',async()=>{
 let count=0;const verify=verifier({},async()=>{count++;return new Response(JSON.stringify({success:count===1,purchase:purchase()}));});const {handler,store}=setup({verifyLicense:verify});
 assert.equal((await call(handler,'access')).status,200);assert.equal((await call(handler,'gift',input())).status,402);assert.equal((await call(handler,'publish',input())).status,402);assert.equal(store.state,null);assert.equal(count,3);
});
test('all ten private gifts contain literal personalization and distinct offline activities without credentials or network dependencies',async()=>{
 const {handler,store}=setup();for(const d of departments){const response=await call(handler,'gift',input(d.slug,{name:'Alex <script>alert(1)</script>',text:'<img src=x onerror=alert(1)>'}));assert.equal(response.status,200,d.slug);assert.match(response.body.filename,/^[a-z-]+-gift\.html$/);const html=response.body.html;assert(html.includes(d.name));assert(html.includes('Alex &lt;script&gt;alert(1)&lt;/script&gt;'));assert(html.includes('&lt;img src=x onerror=alert(1)&gt;'));assert(!html.includes(KEY));assert(!html.includes('<img src=x'));assert(!/fetch\(|https?:\/\/|<(?:script|img|iframe)\b[^>]*\bsrc=/.test(html));assert(html.includes('@media print'));assert(html.includes(d.private));}
 assert.equal(store.state,null,'Private gifts must never publish');
});
test('every department publishes an independently readable record with no ownership, receipt or gift-giver leak',async()=>{
 const {handler,store,advance}=setup();for(const d of departments){advance(11000);const result=await call(handler,'publish',input(d.slug));assert.equal(result.status,201,d.slug);const reader=setup({store}).handler;const response=await call(reader,'presence',{},'', 'GET',undefined,{id:result.body.record.id});assert.equal(response.status,200);assert.equal(response.body.record.name,'Alex');assert.equal(response.body.record.department,d.slug);assert.equal(response.body.record.giver,undefined);assert(!JSON.stringify(response.body).match(/credentialHash|owner|receipts|fixture-sale|00000000/));}
});
test('one active slot per purchase and department survives concurrent publication',async()=>{
 const {handler,store}=setup();const results=await Promise.all([call(handler,'publish',input('museum')),call(handler,'publish',input('museum',{requestId:'11111111-1111-1111-1111-111111111111'}))]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal(store.state.records.length,1);
});
test('idempotent publication retry reuses its link and a changed retry fails',async()=>{
 const {handler}=setup();const body=input();const a=await call(handler,'publish',body),b=await call(handler,'publish',body);assert.equal(b.status,200);assert.equal(a.body.record.id,b.body.record.id);assert.equal((await call(handler,'publish',{...body,text:'Changed'})).status,409);
});
test('another key cannot remove a record; verified original key removes after provider revocation and permits replacement',async()=>{
 const {handler,store,advance}=setup();const first=await call(handler,'publish',input());assert.equal((await call(handler,'remove',{id:first.body.record.id},'44444444-55555555-66666666-77777777')).status,403);
 const unavailable=setup({store,verifyLicense:async()=>{throw Error('provider offline');}}).handler;
 assert.equal((await call(unavailable,'remove',{id:first.body.record.id})).status,200);
 assert.equal((await call(handler,'presence',{},'', 'GET',undefined,{id:first.body.record.id})).status,404);
 advance(11000);assert.equal((await call(handler,'publish',input('last-word',{requestId:'11111111-1111-1111-1111-111111111111'}))).status,201);
});
test('unknown fields, empty names, control text, bad theme and oversized payloads never publish or create gifts',async()=>{
 const {handler,store}=setup();for(const extra of [{name:' '},{name:'A'.repeat(71)},{text:'bad\u0000text'},{text:'A'.repeat(241)},{theme:'javascript:evil'},{photo:'not supported'},{department:'unknown'}])for(const action of ['gift','publish'])assert.equal((await call(handler,action,input('museum',extra))).status,400);assert.equal(store.state,null);
});
test('cross-origin, originless, wrong methods and unknown actions fail before provider or storage',async()=>{
 let calls=0;const {handler}=setup({verifyLicense:async()=>{calls++;throw Error('should not call');}});
 for(const origin of ['https://evil.invalid',''])assert.equal((await call(handler,'gift',input(),KEY,'POST',origin)).status,403);
 assert.equal((await call(handler,'gift',input(),KEY,'GET')).status,405);assert.equal((await call(handler,'unknown',input())).status,404);assert.equal(calls,0);
});
test('public capacity failure preserves existing links and storage errors reveal no secrets',async()=>{
 const {handler,store}=setup();const first=await call(handler,'publish',input('museum'));
 for(let n=1;n<100;n++)store.state.records.push({...store.state.records[0],id:n.toString(16).padStart(24,'0'),owner:n.toString(16).padStart(64,'0')});
 const other=setup({store}, {sale_id:'other-sale'}).handler;assert.equal((await call(other,'publish',input('museum'))).status,409);assert.equal((await call(handler,'presence',{},'', 'GET',undefined,{id:first.body.record.id})).status,200);
 const broken=setup({store:{read:async()=>{throw Error('private SAS');}}}).handler;const failed=await call(broken,'presence',{},'', 'GET',undefined,{id:first.body.record.id});assert.equal(failed.status,503);assert(!JSON.stringify(failed).includes('private SAS'));
});
test('publication cooldown does not block gift creation and creates no fictitious records',async()=>{
 const {handler,store}=setup();assert.equal((await call(handler,'publish',input('museum'))).status,201);assert.equal((await call(handler,'publish',input('button'))).status,429);assert.equal((await call(handler,'gift',input('button'))).status,200);assert.equal(store.state.records.length,1);
});
test('deployed boundary requires every acceptance setting and a separate durable store',async()=>{
 assert.equal(typeof access.departmentConfig,'function','Closed department configuration is missing');
 const base={POINTLESS_DEPARTMENTS_ENABLED:'true',POINTLESS_DEPARTMENTS_ACCEPTED:'true',POINTLESS_SELLER_ACCEPTED:'true',GUMROAD_DEPARTMENT_PRODUCT_ID:PRODUCT,POINTLESS_DEPARTMENTS_BLOB_URL:'https://teststore.blob.core.windows.net/departments/state.json?sig=fixture',POINTLESS_COMMUNITY_BLOB_URL:'https://teststore.blob.core.windows.net/legacy/state?sig=fixture'};
 assert.equal(access.departmentConfig(base).enabled,true);
 for(const field of Object.keys(base).filter(k=>k!=='POINTLESS_COMMUNITY_BLOB_URL'))assert.equal(access.departmentConfig({...base,[field]:''}).enabled,false,field);
 assert.equal(access.departmentConfig({...base,POINTLESS_DEPARTMENTS_BLOB_URL:base.POINTLESS_COMMUNITY_BLOB_URL}).enabled,false);
 const entryPath=__dirname+'/departments/index.js';assert(fs.existsSync(entryPath),'Deployed paid endpoint is missing');const handler=require(entryPath);const context={};await handler(context,{method:'POST',params:{action:'gift'},headers:{origin:'https://officiallypointless.com','x-pointless-license':KEY},body:input(),query:{paid:'true'}});assert.equal(context.res.status,503);
});

test('verified access lists only the purchase own active pages, allowing recovery after reload',async()=>{
 const {handler,store}=setup();const created=await call(handler,'publish',input());
 store.state.records.push({...store.state.records[0],id:'aaaaaaaaaaaaaaaaaaaaaaaa',owner:'b'.repeat(64),name:'Private other owner'});
 const result=await call(handler,'access');assert.equal(result.status,200);assert.equal(result.body.records.length,1);assert.equal(result.body.records[0].id,created.body.record.id);assert(!JSON.stringify(result.body).includes('credentialHash'));assert(!JSON.stringify(result.body).includes('Private other owner'));
});
test('rotated verified key for the same sale can remove; another sale key cannot',async()=>{
 const {handler,store}=setup();const created=await call(handler,'publish',input());const nextKey='aaaaaaaa-bbbbbbbb-cccccccc-dddddddd';
 const rotated=setup({store,verifyLicense:verifier({license_key:nextKey})}).handler;
 assert.equal((await call(rotated,'remove',{id:created.body.record.id},nextKey)).status,200);
});
test('configured moderation token removes reported/refunded pages without trusting a public license',async()=>{
 const admin='department-moderation-fixture-'.repeat(3);const {handler,store}=setup({adminToken:admin});const created=await call(handler,'publish',input());
 const ctx={};await handler(ctx,{method:'POST',params:{action:'remove'},headers:{origin:'https://officiallypointless.com','x-pointless-operator':admin},body:{id:created.body.record.id}});
 assert.equal(ctx.res.status,200);assert.equal(store.state.records.length,0);
});

test('paid presence rejects legacy community state and malformed paid ownership before revealing text',async()=>{
 const {handler,store}=setup();store.state={version:1,records:[{id:'aaaaaaaaaaaaaaaaaaaaaaaa',feature:'last-word',name:'Retained private alias',text:'Retained private message',owner:'legacy-owner',createdAt:Date.now()}],receipts:[]};
 const legacy=await call(handler,'presence',{},'','GET',undefined,{id:'aaaaaaaaaaaaaaaaaaaaaaaa'});assert.equal(legacy.status,503);assert(!JSON.stringify(legacy).includes('Retained private'));
 assert.equal((await call(handler,'publish',input())).status,503);
 const valid=setup();const created=await call(valid.handler,'publish',input());valid.store.state.records[0].credentialHash='malformed';const malformed=await call(valid.handler,'presence',{},'','GET',undefined,{id:created.body.record.id});assert.equal(malformed.status,503);
});
test('encoded aliases and non-dedicated storage targets cannot enable the paid boundary',()=>{
 const base={POINTLESS_DEPARTMENTS_ENABLED:'true',POINTLESS_DEPARTMENTS_ACCEPTED:'true',POINTLESS_SELLER_ACCEPTED:'true',GUMROAD_DEPARTMENT_PRODUCT_ID:PRODUCT,POINTLESS_DEPARTMENTS_BLOB_URL:'https://teststore.blob.core.windows.net/departments/state.json?sig=fixture',POINTLESS_COMMUNITY_BLOB_URL:'https://teststore.blob.core.windows.net/community/state.json?sig=fixture'};
 assert.equal(access.departmentConfig({...base,POINTLESS_DEPARTMENTS_BLOB_URL:'https://teststore.blob.core.windows.net/community/%73tate.json?sig=fixture'}).enabled,false);
 assert.equal(access.departmentConfig({...base,POINTLESS_DEPARTMENTS_BLOB_URL:'https://teststore.blob.core.windows.net/departments/%73tate.json?sig=fixture'}).enabled,false);
});
