'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');
const access=require('./department-access');
const gift=fs.existsSync(__dirname+'/gift-service.js')?require('./gift-service'):{};
const paid=fs.existsSync(__dirname+'/paid-state.js')?require('./paid-state'):{};
const catalog=require('./gift-products.json');
const {createDepartmentHandler}=require('./department-service');
const {TestStore}=require('../test/community-fixtures');
const KEY='a'.repeat(32),OTHER='b'.repeat(32),COLLECTION='c'.repeat(32);
const CERT='certificate-minister-of-unopened-tabs',COFFEE='certificate-secretary-of-one-more-coffee';
const publicInput=(productSku=CERT,extra={})=>({productSku,recipientHandle:'riley',name:'Riley',text:'A public gift.',consent:true,requestId:randomUUID(),...extra});
const providerPurchase=(productId,permalink,key,saleId,extra={})=>({product_id:productId,permalink,license_key:key,sale_id:saleId,price:1900,refunded:false,chargebacked:false,disputed:false,is_gift_receiver_purchase:false,...extra});

function setup(options={}){
 assert.equal(typeof gift.createPublicGiftHandler,'function','Public gift handler is missing');
 assert.equal(typeof access.createProductLicenseVerifier,'function','All-product authoritative verifier is missing');
 const purchases=new Map([[KEY,{sku:CERT,saleId:'sale-a'}],[OTHER,{sku:CERT,saleId:'sale-b'}],[COLLECTION,{sku:'department-collection',saleId:'legacy-collection'}]]);
 const descriptors=[...catalog.map(p=>({productId:'fixture-'+p.sku,permalink:p.permalink})),{productId:'fixture-collection',permalink:'department-collection'}];
 let providerCalls=0,time=100000;
 const verifyLicense=access.createProductLicenseVerifier({products:descriptors,request:async(_url,init)=>{
  providerCalls++;const form=new URLSearchParams(init.body),key=form.get('license_key'),purchase=purchases.get(key);
  const product=purchase?.sku==='department-collection'?{productId:'fixture-collection',permalink:'department-collection'}:
   purchase&&catalog.find(p=>p.sku===purchase.sku);
  const productId=product?.productId||(product?'fixture-'+product.sku:null);
  if(!product||form.get('product_id')!==productId)return new Response(JSON.stringify({success:false}),{status:404});
  return new Response(JSON.stringify({success:true,purchase:providerPurchase(productId,product.permalink,key,purchase.saleId,purchase.extra)}));
 }});
 const store=options.store||new TestStore();
 const handler=gift.createPublicGiftHandler({enabled:true,store,verifyLicense,now:()=>time,...options});
 const department=createDepartmentHandler({enabled:true,store,verifyLicense,now:()=>time,...options});
 return {handler,department,store,verifyLicense,advance:ms=>time+=ms,time:()=>time,
  purchase:(key,sku,saleId=key,extra={})=>purchases.set(key,{sku,saleId,extra}),providerCalls:()=>providerCalls};
}
async function call(handler,action,body,key=KEY,query={},headers={},method=body===undefined?'GET':'POST'){
 const context={};await handler(context,{method,params:{action},query,
  headers:{...(body!==undefined?{origin:'https://officiallypointless.com','x-pointless-license':key}:{}),...headers},body});return context.res;
}

test('the generic provider boundary verifies all fifteen fixed products without granting certificate keys department access',async()=>{
 assert.equal(typeof access.createProductLicenseVerifier,'function');
 for(const product of catalog){
  const verify=access.createLicenseVerifier({productId:'fixture-product',permalink:product.permalink,request:async()=>new Response(JSON.stringify({success:true,purchase:providerPurchase('fixture-product',product.permalink,KEY,'fixture-sale')}))});
  const grant=await verify(KEY);
  if(product.kind==='digital-certificate')assert.deepEqual(grant.products,[product.sku]);
  else assert.deepEqual(grant.departments,[product.sku.slice('department-'.length)]);
 }
 const f=setup();const rejected=await call(f.department,'access',{});
 assert.equal(rejected.status,402);assert.equal(f.store.state,null);
});

test('public gift configuration uses accepted server product IDs and stays closed by default',()=>{
 assert.equal(typeof access.publicGiftConfig,'function');
 const env={POINTLESS_DEPARTMENTS_BLOB_URL:'https://fixtureonly.blob.core.windows.net/departments/state.json?sig=fixture',
  POINTLESS_SELLER_ACCEPTED:'true',POINTLESS_DEPARTMENTS_ADMIN_TOKEN:'fixture-operator-token-with-at-least-32-characters',
  POINTLESS_CERTIFICATE_MINISTER_OF_UNOPENED_TABS_ACCEPTED:'true',GUMROAD_CERTIFICATE_MINISTER_OF_UNOPENED_TABS_PRODUCT_ID:'fixture-certificate',POINTLESS_PUBLIC_GIFTS_ENABLED:'true'};
 const config=access.publicGiftConfig(env);assert.equal(config.enabled,true);assert(config.store);
 assert.deepEqual(config.products,[{productId:'fixture-certificate',permalink:'pointless-minister-of-unopened-tabs'}]);
 for(const name of Object.keys(env))assert.equal(access.publicGiftConfig({...env,[name]:undefined}).enabled,false,name);
 assert.equal(access.publicGiftConfig({...env,POINTLESS_PUBLIC_GIFTS_ENABLED:'TRUE'}).enabled,false);
 assert.equal(access.publicGiftConfig({...env,POINTLESS_PUBLIC_GIFTS_ENABLED:undefined}).store!==null,true,'Anonymous reads survive closing creation');
 assert.equal(access.publicGiftConfig({...env,POINTLESS_DEPARTMENTS_BLOB_URL:'https://fixtureonly.blob.core.windows.net/community/state.json?sig=fixture'}).store,null);
});

test('anonymous public reads remain available while creation is closed and never invent gifts',async()=>{
 const f=setup({enabled:false});
 const status=await call(f.handler,'status');assert.deepEqual(status.body,{creationEnabled:false,publicReadEnabled:true});
 const result=await call(f.handler,'feed',undefined,'',{}, {origin:'https://unrelated.example'});
 assert.equal(result.status,200);assert.deepEqual(result.body.gifts,[]);assert.deepEqual(result.body.people,[]);
 assert.deepEqual(result.body.stats,{giftCount:0,recipientCount:0});assert.equal(result.body.products.length,15);
 assert(result.body.products.every(product=>product.recipientCount===0));assert.equal(result.body.cursor,null);
 assert.equal(result.headers['Access-Control-Allow-Origin'],'*');assert.equal(f.providerCalls(),0);
 assert.equal((await call(f.handler,'publish',publicInput())).status,503);
 assert.equal((await call(f.handler,'view',undefined,'',{id:'1'.repeat(24)})).status,404);
});

test('verified access returns only the purchased product and publisher own public gifts',async()=>{
 const f=setup();const published=await call(f.handler,'publish',publicInput());assert.equal(published.status,201);
 const owned=await call(f.handler,'access',{});assert.equal(owned.status,200);assert.deepEqual(owned.body.products.map(p=>p.sku),[CERT]);
 assert.equal(owned.body.gifts.length,1);assert.equal(owned.body.gifts[0].id,published.body.gift.id);
 assert.equal((await call(f.handler,'access',{productSku:COFFEE})).status,403);
 const other=await call(f.handler,'access',{},OTHER);assert.deepEqual(other.body.gifts,[]);
 const closed=setup({enabled:false,store:f.store,verifyLicense:f.verifyLicense});
 assert.equal((await call(closed.handler,'access',{})).status,200);
});

test('creation requires reverified paid scope and exact positive public consent',async()=>{
 const f=setup();
 for(const extra of [{productSku:COFFEE},{productSku:'department-museum'}]){
  const result=await call(f.handler,'publish',publicInput(CERT,extra));assert.equal(result.status,403);assert.equal(result.body.error,'product_not_purchased');
 }
 for(const extra of [{consent:false},{consent:undefined},{consent:'true'},{paid:true},{giver:'Private giver'},{name:' '},{recipientHandle:'a'},{recipientHandle:'-riley'},{recipientHandle:'riley/other'},{text:'bad\u0000text'},{text:'x'.repeat(241)},{productSku:'unknown'},{requestId:'not-a-uuid'}]){
  const result=await call(f.handler,'publish',publicInput(CERT,extra));assert.equal(result.status,400,JSON.stringify(extra));
 }
 assert.equal(f.store.state,null);
 for(const extra of [{refunded:true},{test:true},{price:0},{disputed:true},{is_gift_receiver_purchase:true},{subscription_id:'fixture'}]){
  f.purchase(KEY,CERT,'sale-a',extra);assert.equal((await call(f.handler,'publish',publicInput())).status,402);
 }
 f.purchase(KEY,CERT,'sale-a');assert.equal((await call(f.handler,'publish',publicInput())).status,201);
 f.purchase(KEY,CERT,'sale-a',{refunded:true});assert.equal((await call(f.handler,'access',{})).status,402);
});

test('handles are explicit and display names must match an existing active profile',async()=>{
 const f=setup();const result=await call(f.handler,'publish',publicInput(CERT,{recipientHandle:'  RILEY  ',name:' Riley ',text:''}));
 assert.equal(result.status,201);assert.equal(result.body.gift.recipientHandle,'riley');assert.equal(result.body.gift.name,'Riley');
 const conflict=await call(f.handler,'publish',publicInput(CERT,{name:'Another Riley'}),OTHER);
 assert.equal(conflict.status,409);assert.equal(conflict.body.error,'handle_conflict');
 const namesake=await call(f.handler,'publish',publicInput(CERT,{recipientHandle:'riley-two',name:'Riley'}),OTHER);
 assert.equal(namesake.status,201);const feed=await call(f.handler,'feed');assert.equal(feed.body.stats.recipientCount,2);
});

test('public projections expose only explicit public gift fields with canonical links',async()=>{
 const f=setup();const result=await call(f.handler,'publish',publicInput(CERT,{name:'Riley <script>',text:'<img src=x onerror=bad>'}));
 assert.equal(result.status,201);const g=result.body.gift;
 assert.deepEqual(Object.keys(g).sort(),['createdAt','id','image','kind','name','productName','productSku','profileUrl','recipientHandle','text','url'].sort());
 assert.match(g.url,/^https:\/\/officiallypointless\.com\/gifts\/view\/\?id=[a-f0-9]{24}$/);
 assert.equal(g.profileUrl,'https://officiallypointless.com/people/?handle=riley');assert.equal(g.productName,'Minister of Unopened Tabs');
 const view=await call(f.handler,'view',undefined,'',{id:g.id});assert.deepEqual(view.body.gift,g);
 const profile=await call(f.handler,'profile',undefined,'',{handle:'riley'});assert.deepEqual(profile.body.gifts,[g]);
 for(const response of [result,view,profile,await call(f.handler,'feed')]){
  assert(!JSON.stringify(response.body).includes(KEY));assert(!JSON.stringify(response.body).match(/credentialHash|"owner"|fixture-|giftReceipts|"permalink"/));
 }
});

test('people collect distinct products and products count distinct handles; removal updates both boards',async()=>{
 const f=setup();const keys=['d','e','f'].map(letter=>letter.repeat(32));
 f.purchase(keys[0],CERT);f.purchase(keys[1],COFFEE);f.purchase(keys[2],COFFEE);
 await call(f.handler,'publish',publicInput());f.advance(11000);
 await call(f.handler,'publish',publicInput(),OTHER);f.advance(11000);
 await call(f.handler,'publish',publicInput(CERT,{recipientHandle:'alex',name:'Alex'}),keys[0]);f.advance(11000);
 const rileyCoffee=await call(f.handler,'publish',publicInput(COFFEE),keys[1]);f.advance(11000);
 await call(f.handler,'publish',publicInput(COFFEE,{recipientHandle:'alex',name:'Alex'}),keys[2]);
 let feed=await call(f.handler,'feed');assert.equal(feed.body.people[0].handle,'riley');assert.equal(feed.body.people[0].distinctProducts,2);
 assert.equal(feed.body.people[0].totalGifts,3);assert(feed.body.people[0].reachedAt<feed.body.people[1].reachedAt);
 assert.equal(feed.body.products.find(p=>p.sku===CERT).recipientCount,2);assert.equal(feed.body.products.find(p=>p.sku===COFFEE).recipientCount,2);
 assert.equal((await call(f.handler,'remove',{id:rileyCoffee.body.gift.id},keys[1])).status,200);
 feed=await call(f.handler,'feed');assert.equal(feed.body.people[0].handle,'alex');assert.equal(feed.body.people.find(p=>p.handle==='riley').distinctProducts,1);
 assert.equal(feed.body.products.find(p=>p.sku===COFFEE).recipientCount,1);assert.deepEqual(feed.body.stats,{giftCount:4,recipientCount:2});
});

test('current collection milestone ties resolve by handle, never repeated-gift counts',async()=>{
 const f=setup();await call(f.handler,'publish',publicInput(CERT,{recipientHandle:'zebra',name:'Zebra'}));
 await call(f.handler,'publish',publicInput(CERT,{recipientHandle:'alpha',name:'Alpha'}),OTHER);
 const feed=await call(f.handler,'feed');assert.deepEqual(feed.body.people.map(p=>p.handle),['alpha','zebra']);
});

test('idempotent retry keeps its gift, changed retry fails and removal does not resurrect an old request',async()=>{
 const f=setup(),body=publicInput();const first=await call(f.handler,'publish',body),retry=await call(f.handler,'publish',body);
 assert.equal(retry.status,200);assert.equal(retry.body.gift.id,first.body.gift.id);
 assert.equal((await call(f.handler,'publish',{...body,text:'Changed'})).status,409);
 assert.equal((await call(f.handler,'publish',publicInput())).status,409);
 await call(f.handler,'remove',{id:first.body.gift.id});assert.equal((await call(f.handler,'publish',body)).status,410);
 f.advance(11000);assert.equal((await call(f.handler,'publish',publicInput())).status,201);
});

test('original key removal survives closing creation/refund/provider outage without trusting another key',async()=>{
 const f=setup(),first=await call(f.handler,'publish',publicInput());
 const closed=setup({enabled:false,store:f.store,verifyLicense:async()=>{throw Error('private provider outage');}});
 assert.equal((await call(closed.handler,'remove',{id:first.body.gift.id},OTHER)).status,403);
 assert.equal((await call(closed.handler,'remove',{id:first.body.gift.id})).status,200);
 assert.deepEqual((await call(closed.handler,'feed')).body.stats,{giftCount:0,recipientCount:0});
});

test('rotated verified keys and operators remove only the corresponding publisher gift',async()=>{
 const f=setup({adminToken:'fixture-operator-token-with-at-least-32-characters'}),first=await call(f.handler,'publish',publicInput());
 const next='f'.repeat(32);f.purchase(next,CERT,'sale-a');assert.equal((await call(f.handler,'remove',{id:first.body.gift.id},next)).status,200);
 f.advance(11000);const again=await call(f.handler,'publish',publicInput());
 assert.equal((await call(f.handler,'remove',{id:again.body.gift.id},'',{}, {'x-pointless-operator':'fixture-operator-token-with-at-least-32-characters'})).status,200);
});

test('concurrent conditional writes preserve independent gifts and one active product slot',async()=>{
 const f=setup();const different=await Promise.all([call(f.handler,'publish',publicInput()),call(f.handler,'publish',publicInput(),OTHER)]);
 assert.deepEqual(different.map(r=>r.status),[201,201]);assert.equal(f.store.state.gifts.length,2);
 const same=setup();const duplicate=await Promise.all([call(same.handler,'publish',publicInput()),call(same.handler,'publish',publicInput())]);
 assert.deepEqual(duplicate.map(r=>r.status).sort(),[201,409]);assert.equal(same.store.state.gifts.length,1);
});

test('shared v2 migration preserves every legacy field and does not count dedications as received gifts',async()=>{
 const f=setup();const old=await call(f.department,'publish',{department:'museum',name:'Legacy alias',text:'Private legacy meaning.',requestId:randomUUID()},COLLECTION);
 assert.equal(old.status,201);const before=structuredClone(f.store.state);before.version=2;delete before.gifts;delete before.giftReceipts;f.store.state=before;
 f.advance(11000);const created=await call(f.handler,'publish',publicInput('department-silence'),COLLECTION);assert.equal(created.status,201);
 assert.equal(f.store.state.version,3);assert.deepEqual(f.store.state.records,before.records);assert.deepEqual(f.store.state.receipts,before.receipts);
 const feed=await call(f.handler,'feed');assert.equal(feed.body.stats.giftCount,1);assert(!JSON.stringify(feed.body).includes('Legacy alias'));
 const access=await call(f.department,'access',{},COLLECTION);assert.equal(access.status,200);assert.equal(access.body.records[0].id,old.body.record.id);
 const giftsBefore=structuredClone(f.store.state.gifts);f.advance(11000);
 assert.equal((await call(f.department,'publish',{department:'button',name:'Legacy second alias',text:'Keep gifts.',requestId:randomUUID()},COLLECTION)).status,201);
 assert.deepEqual(f.store.state.gifts,giftsBefore);assert.equal((await call(f.department,'remove',{id:old.body.record.id},COLLECTION)).status,200);
 assert.deepEqual(f.store.state.gifts,giftsBefore);
});

test('legacy dedication and new gift consume one shared purchase/product slot across races',async()=>{
 const f=setup();const results=await Promise.all([
  call(f.department,'publish',{department:'museum',name:'Legacy alias',text:'One entitlement.',requestId:randomUUID()},COLLECTION),
  call(f.handler,'publish',publicInput('department-museum'),COLLECTION),
 ]);
 assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal(f.store.state.version,3);assert.equal(f.store.state.records.length+f.store.state.gifts.length,1);
});

test('strict shared state rejects private/malformed gift fields and legacy community content before public reading',async()=>{
 assert.equal(typeof paid.readPaidState,'function');
 const f=setup();await call(f.handler,'publish',publicInput());const valid=structuredClone(f.store.state);
 for(const state of [
  {version:1,records:[{name:'PRIVATE LEGACY COMMUNITY'}],receipts:[]},
  {...valid,extra:'private'}, {...valid,version:4}, {...valid,giftReceipts:undefined},
  {...valid,gifts:[{...valid.gifts[0],giver:'PRIVATE GIVER'}]},
  {...valid,gifts:[{...valid.gifts[0],consent:false}]},
  {...valid,gifts:[{...valid.gifts[0],productSku:'unknown'}]},
  {...valid,gifts:[{...valid.gifts[0],recipientHandle:'UPPER'}]},
  {...valid,gifts:[{...valid.gifts[0],credentialHash:'broken'}]},
  {...valid,gifts:[valid.gifts[0],valid.gifts[0]]},
 ]){
  f.store.state=state;const result=await call(f.handler,'feed');assert.equal(result.status,503);assert.equal(result.body.error,'gift_unavailable');
  assert(!JSON.stringify(result.body).includes('PRIVATE'));
 }
});

test('unknown storage snapshots cannot be presented as an empty public gift state',async()=>{
 for(const snapshot of [{},{state:undefined,etag:null},{state:null,etag:'existing-blob'},{state:false,etag:'existing-blob'}]){
  const f=setup({store:{read:async()=>snapshot}});const result=await call(f.handler,'feed');
  assert.equal(result.status,503);assert.equal(result.body.error,'gift_unavailable');
 }
});

test('ambiguous retries and receipts referring to another active publisher fail the shared state reader',async()=>{
 const f=setup();await call(f.handler,'publish',publicInput());const valid=structuredClone(f.store.state);
 for(const state of [
  {...valid,giftReceipts:[valid.giftReceipts[0],valid.giftReceipts[0]]},
  {...valid,giftReceipts:[{...valid.giftReceipts[0],owner:'0'.repeat(64)}]},
 ]){
  f.store.state=state;const result=await call(f.handler,'feed');assert.equal(result.status,503);assert.equal(result.body.error,'gift_unavailable');
 }
});

test('feed cursors page stable public gifts while boards and stats cover all active gifts',async()=>{
 const f=setup();for(const [index,letter]of ['a','b','d','e'].entries()){
  const key=letter.repeat(32);f.purchase(key,CERT);f.advance(1000);assert.equal((await call(f.handler,'publish',publicInput(CERT,{recipientHandle:'person-'+index,name:'Person '+index}),key)).status,201);
 }
 const first=await call(f.handler,'feed',undefined,'',{limit:'2'});assert.equal(first.body.gifts.length,2);assert.equal(first.body.stats.giftCount,4);
 assert.match(first.body.cursor,/^[0-9]+:[a-f0-9]{24}$/);
 const next=await call(f.handler,'feed',undefined,'',{limit:'2',cursor:first.body.cursor});assert.equal(next.body.gifts.length,2);
 assert.equal(next.body.cursor,null);assert.equal(new Set([...first.body.gifts,...next.body.gifts].map(g=>g.id)).size,4);
 for(const query of [{limit:'0'},{limit:'101'},{limit:'2.5'},{cursor:'malformed'},{handle:[]},{unknown:'yes'}])assert.equal((await call(f.handler,'feed',undefined,'',query)).status,400);
});

test('public GET preflight exposes no license submission and foreign POSTs fail before verification/storage',async()=>{
 const f=setup();const preflight=await call(f.handler,'feed',undefined,'',{}, {origin:'https://museum.officiallypointless.com','access-control-request-method':'GET'},'OPTIONS');
 assert.equal(preflight.status,204);assert.equal(preflight.headers['Access-Control-Allow-Origin'],'*');
 for(const headers of [{origin:'https://museum.officiallypointless.com'}, {origin:''}, {origin:'https://evil.invalid'}, {origin:'https://officiallypointless.com',Origin:'https://officiallypointless.com'}]){
  assert.equal((await call(f.handler,'publish',publicInput(),KEY,{},headers)).status,403);
 }
 assert.equal((await call(f.handler,'feed',undefined,'',{}, {'access-control-request-method':'POST'},'OPTIONS')).status,403);
 assert.equal(f.providerCalls(),0);assert.equal(f.store.state,null);
});

test('shared publication cooldown, size/capacity failures and CAS exhaustion do not invent a gift',async()=>{
 const f=setup();assert.equal((await call(f.handler,'publish',publicInput('department-museum'),COLLECTION)).status,201);
 assert.equal((await call(f.handler,'publish',publicInput('department-silence'),COLLECTION)).status,429);
 assert.equal((await call(f.department,'publish',{department:'button',name:'Legacy',text:'Same budget.',requestId:randomUUID()},COLLECTION)).status,429);
 const full=setup();await call(full.handler,'publish',publicInput());const base=full.store.state.gifts[0];
 for(let i=1;i<100;i++)full.store.state.gifts.push({...base,id:i.toString(16).padStart(24,'0'),owner:i.toString(16).padStart(64,'0')});
 assert.equal((await call(full.handler,'publish',publicInput(),OTHER)).status,409);
 const busy=setup({store:{read:async()=>({state:null,etag:null}),write:async()=>false}});
 const result=await call(busy.handler,'publish',publicInput());assert.equal(result.status,503);assert.equal(result.body.error,'gift_busy');
});
