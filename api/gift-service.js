'use strict';
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const {credentialHash,validLicense}=require('./department-access');
const {readPaidState,productSlotUsed,productCount,pruneReceipts,publicationLimited,products,validHandle,hex,uuid,MAX_BYTES}=require('./paid-state');
const ORIGINS=new Set(['https://officiallypointless.com','https://www.officiallypointless.com']);
const PUBLIC_ACTIONS=new Set(['status','feed','view','profile']);
const HEADERS={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const canonical='https://officiallypointless.com';
const error=(code,status)=>Object.assign(new Error(code),{code,status});
const digest=value=>createHash('sha256').update(value).digest('hex');
const same=(a,b)=>hex(a,64)&&hex(b,64)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const profileUrl=handle=>canonical+'/people/?handle='+encodeURIComponent(handle);
const ordered=gifts=>[...gifts].sort((a,b)=>b.createdAt-a.createdAt||b.id.localeCompare(a.id));
function project(record){
  const product=products.find(product=>product.sku===record.productSku);
  return {id:record.id,productSku:record.productSku,productName:product.name,kind:product.kind,image:product.image,
    recipientHandle:record.recipientHandle,name:record.name,text:record.text,createdAt:record.createdAt,
    url:canonical+'/gifts/view/?id='+record.id,profileUrl:profileUrl(record.recipientHandle)};
}
function grantProducts(grant){
  if(!grant||!hex(grant.owner,64)||!hex(grant.credentialHash,64))throw error('payment_required',402);
  let skus;
  if(grant.products!==undefined)skus=grant.products;
  else if(grant.departments!==undefined)skus=Array.isArray(grant.departments)?grant.departments.map(slug=>'department-'+slug):null;
  else skus=products.filter(product=>product.kind==='online-department').map(product=>product.sku);
  if(!Array.isArray(skus)||!skus.length||new Set(skus).size!==skus.length||skus.some(sku=>!products.some(product=>product.sku===sku)))throw error('payment_required',402);
  return products.filter(product=>skus.includes(product.sku));
}
function text(value,max,required=false){if(typeof value!=='string'||value.length>max||/[\x00-\x1f\x7f]/.test(value)||required&&!value.trim())throw error('invalid_submission',400);return value.trim();}
function handle(value){const normalized=text(value,32,true).toLowerCase();if(!validHandle(normalized))throw error('invalid_submission',400);return normalized;}
function submission(body){
  const keys=['productSku','recipientHandle','name','text','consent','requestId'];
  if(Object.keys(body).length!==keys.length||Object.keys(body).some(key=>!keys.includes(key))||!products.some(product=>product.sku===body.productSku)||body.consent!==true||!uuid(body.requestId))throw error('invalid_submission',400);
  return {productSku:body.productSku,recipientHandle:handle(body.recipientHandle),name:text(body.name,70,true),text:text(body.text,240),consent:true};
}
function query(input,keys){if(!input)return {};if(typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!keys.includes(key))||Object.values(input).some(value=>typeof value!=='string'))throw error('invalid_submission',400);return input;}
function boards(gifts){
  const recipients=new Map(),byProduct=new Map(products.map(product=>[product.sku,new Set()]));
  for(const gift of gifts){
    let recipient=recipients.get(gift.recipientHandle);
    if(!recipient){recipient={handle:gift.recipientHandle,name:gift.name,totalGifts:0,firstProducts:new Map()};recipients.set(gift.recipientHandle,recipient);}
    recipient.totalGifts++;const first=recipient.firstProducts.get(gift.productSku);
    if(first===undefined||gift.createdAt<first)recipient.firstProducts.set(gift.productSku,gift.createdAt);
    byProduct.get(gift.productSku).add(gift.recipientHandle);
  }
  const people=[...recipients.values()].map(recipient=>({handle:recipient.handle,name:recipient.name,
    distinctProducts:recipient.firstProducts.size,totalGifts:recipient.totalGifts,reachedAt:Math.max(...recipient.firstProducts.values()),url:profileUrl(recipient.handle)}))
    .sort((a,b)=>b.distinctProducts-a.distinctProducts||a.reachedAt-b.reachedAt||a.handle.localeCompare(b.handle));
  const productBoard=products.map(product=>({sku:product.sku,name:product.name,recipientCount:byProduct.get(product.sku).size}))
    .sort((a,b)=>b.recipientCount-a.recipientCount||a.sku.localeCompare(b.sku));
  return {people,products:productBoard,stats:{giftCount:gifts.length,recipientCount:recipients.size}};
}
function createPublicGiftHandler({enabled=false,store,verifyLicense,adminToken=null,now=Date.now}={}){
  const creationEnabled=Boolean(enabled&&store&&typeof verifyLicense==='function'),publicReadEnabled=Boolean(store);
  return async(context,req)=>{
    const action=req?.params?.action,isPublic=PUBLIC_ACTIONS.has(action);
    const respond=(status,body,extra={})=>context.res={status,headers:{...HEADERS,...(isPublic&&{'Access-Control-Allow-Origin':'*'}),...extra},body};
    if(!isPublic&&!['access','publish','remove'].includes(action)){respond(404,{error:'unknown_action'});return;}
    const entries=Object.entries(req.headers||{}),origins=entries.filter(([name])=>name.toLowerCase()==='origin');
    const headers=Object.fromEntries(entries.map(([key,value])=>[key.toLowerCase(),value]));
    if(req.method==='OPTIONS'){
      const requested=headers['access-control-request-headers'];
      if(!isPublic||headers['access-control-request-method']!=='GET'||requested!==undefined&&(typeof requested!=='string'||requested.split(',').some(name=>!['accept','content-type'].includes(name.trim().toLowerCase())))){respond(403,{error:'forbidden_origin'});return;}
      respond(204,undefined,{'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Accept, Content-Type'});return;
    }
    if(req.method!==(isPublic?'GET':'POST')){respond(405,{error:'method_not_allowed'});return;}
    if(!isPublic&&(origins.length!==1||!ORIGINS.has(origins[0][1]))){respond(403,{error:'forbidden_origin'});return;}
    if(action==='status'){respond(200,{creationEnabled,publicReadEnabled});return;}
    if(!store){respond(503,{error:'gift_unavailable'});return;}
    if(action==='publish'&&!creationEnabled){respond(503,{error:'public_gifting_not_open'});return;}
    const license=headers['x-pointless-license'];
    try{
      if(isPublic){
        if(action==='feed'){
          const input=query(req.query,['limit','cursor']);let limit=50;
          if(input.limit!==undefined){if(!/^[1-9][0-9]{0,2}$/.test(input.limit)||Number(input.limit)>100)throw error('invalid_submission',400);limit=Number(input.limit);}
          let cursor=null;if(input.cursor!==undefined){const match=/^([1-9][0-9]{0,15}):([a-f0-9]{24})$/.exec(input.cursor);if(!match||!Number.isSafeInteger(Number(match[1])))throw error('invalid_submission',400);cursor={createdAt:Number(match[1]),id:match[2]};}
          const state=readPaidState(await store.read()),all=ordered(state.gifts),eligible=cursor?all.filter(gift=>gift.createdAt<cursor.createdAt||gift.createdAt===cursor.createdAt&&gift.id<cursor.id):all;
          const page=eligible.slice(0,limit),last=page.at(-1);
          respond(200,{gifts:page.map(project),...boards(state.gifts),cursor:eligible.length>page.length?last.createdAt+':'+last.id:null});return;
        }
        if(action==='view'){
          const input=query(req.query,['id']);if(!hex(input.id,24))throw error('invalid_submission',400);
          const state=readPaidState(await store.read()),record=state.gifts.find(gift=>gift.id===input.id);if(!record)throw error('gift_not_found',404);
          respond(200,{gift:project(record)});return;
        }
        const input=query(req.query,['handle']),recipientHandle=handle(input.handle),state=readPaidState(await store.read());
        const gifts=ordered(state.gifts.filter(gift=>gift.recipientHandle===recipientHandle));if(!gifts.length)throw error('gift_not_found',404);
        respond(200,{profile:boards(gifts).people[0],gifts:gifts.map(project)});return;
      }
      if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Buffer.byteLength(JSON.stringify(req.body))>4096)throw error('invalid_submission',400);
      if(action==='remove'){
        if(Object.keys(req.body).length!==1||!hex(req.body.id,24))throw error('invalid_submission',400);
        const operator=typeof adminToken==='string'&&adminToken.length>=32&&typeof headers['x-pointless-operator']==='string'&&same(digest(adminToken),digest(headers['x-pointless-operator']));
        if(!operator&&!validLicense(license))throw error('invalid_submission',400);
        for(let attempt=0;attempt<5;attempt++){
          const snapshot=await store.read(),state=readPaidState(snapshot),record=state.gifts.find(gift=>gift.id===req.body.id);if(!record)throw error('gift_not_found',404);
          if(!operator&&!same(record.credentialHash,credentialHash(license))){
            let grant;try{grant=await verifyLicense(license,record.productSku);}catch{throw error('not_your_gift',403);}
            if(!same(record.owner,grant.owner)||!grantProducts(grant).some(product=>product.sku===record.productSku))throw error('not_your_gift',403);
          }
          state.gifts=state.gifts.filter(gift=>gift.id!==record.id);if(await store.write(state,snapshot.etag)){respond(200,{removed:true});return;}
        }
        throw error('gift_busy',503);
      }
      if(action==='access'){
        if(Object.keys(req.body).some(key=>key!=='productSku')||req.body.productSku!==undefined&&!products.some(product=>product.sku===req.body.productSku))throw error('invalid_submission',400);
        const grant=await verifyLicense(license),entitled=grantProducts(grant);
        if(req.body.productSku!==undefined&&!entitled.some(product=>product.sku===req.body.productSku))throw error('product_not_purchased',403);
        const selected=req.body.productSku?entitled.filter(product=>product.sku===req.body.productSku):entitled;
        const state=readPaidState(await store.read());respond(200,{products:selected,gifts:ordered(state.gifts.filter(gift=>gift.owner===grant.owner&&selected.some(product=>product.sku===gift.productSku))).map(project)});return;
      }
      const input=submission(req.body),grant=await verifyLicense(license),entitled=grantProducts(grant);
      if(!entitled.some(product=>product.sku===input.productSku))throw error('product_not_purchased',403);
      const fingerprint=digest(JSON.stringify(input));
      for(let attempt=0;attempt<5;attempt++){
        const snapshot=await store.read(),state=readPaidState(snapshot),time=now();pruneReceipts(state,time);
        const previous=state.giftReceipts.find(receipt=>receipt.owner===grant.owner&&receipt.requestId===req.body.requestId);
        if(previous){if(previous.fingerprint!==fingerprint)throw error('retry_changed',409);const record=state.gifts.find(gift=>gift.id===previous.id);if(!record)throw error('gift_removed',410);respond(200,{gift:project(record)});return;}
        if(state.gifts.some(gift=>gift.recipientHandle===input.recipientHandle&&gift.name!==input.name))throw error('handle_conflict',409);
        if(productSlotUsed(state,grant.owner,input.productSku))throw error('gift_already_used',409);
        if(productCount(state,input.productSku)>=100||state.gifts.length>=1500)throw error('gift_full',409);
        if(publicationLimited(state,grant.owner,time)){respond(429,{error:'publication_limit'},{'Retry-After':'60'});return;}
        const record={...input,id:randomBytes(12).toString('hex'),createdAt:time,owner:grant.owner,credentialHash:grant.credentialHash};
        state.gifts.push(record);state.giftReceipts.push({owner:grant.owner,requestId:req.body.requestId,fingerprint,id:record.id,at:time});
        if(Buffer.byteLength(JSON.stringify(state))>MAX_BYTES)throw error('gift_full',409);
        if(await store.write(state,snapshot.etag)){respond(201,{gift:project(record)});return;}
      }
      throw error('gift_busy',503);
    }catch(failure){
      const known=new Set(['invalid_submission','product_not_purchased','gift_not_found','not_your_gift','handle_conflict','gift_already_used','retry_changed','gift_removed','gift_full','gift_busy']);
      if(failure.code==='payment_required'){respond(402,{error:'payment_required'});return;}
      if(failure.code==='payment_unavailable'){respond(503,{error:'payment_unavailable'});return;}
      respond(known.has(failure.code)?failure.status:503,{error:known.has(failure.code)?failure.code:'gift_unavailable'});
    }
  };
}
module.exports={createPublicGiftHandler};
