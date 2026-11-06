'use strict';
const {commerceRequest,commerceBody}=require('./commerce-origins');
const {backendConfig}=require('./instance-proxy');
const products=Object.freeze(require('./effect-products.json').map(p=>Object.freeze(p)));
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
const id=v=>typeof v==='string'&&/^[a-f0-9]{24}$/.test(v);
const text=(v,max,required=false)=>typeof v==='string'&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v)&&(!required||Boolean(v.trim()));
const license=v=>typeof v==='string'&&/^[A-Za-z0-9-]{16,128}$/.test(v);
const errorCodes=new Set(['invalid_id','invalid_title','invalid_rule_title','invalid_text','unsupported_characters','public_consent_required','ceremony_already_started','ceremony_not_started','ceremony_in_progress','effect_completed','request_conflict','invalid_request','invalid_preview','invalid_name','unsupported_name_characters','unknown_product','payment_required','payment_unavailable','effect_unavailable','effect_not_found','effect_removed','purchase_already_assigned','invalid_move','action_complete','timer_not_ready','retry_changed','effect_busy','product_not_open','not_your_effect','consent_required']);
const effectKeys=['id','sku','name','title','text','createdAt','completed','result','actionsRemaining'];
function validEffect(value){
 const product=products.find(p=>p.sku===value?.sku),limit=product?.action==='boss'?3:product?.action==='none'?0:1;
 return exact(value,effectKeys)&&id(value.id)&&Boolean(product)&&text(value.name,60,true)&&text(value.title,70,true)&&(!product.titleChoices||product.titleChoices.includes(value.title))&&text(value.text,240)&&Number.isSafeInteger(value.createdAt)&&value.createdAt>0&&typeof value.completed==='boolean'&&text(value.result,500,true)&&(!product.fixedForecast||value.result===product.fixedForecast)&&Number.isSafeInteger(value.actionsRemaining)&&value.actionsRemaining>=0&&value.actionsRemaining<=limit&&value.completed===(value.actionsRemaining===0);
}

function effectConfig(env=process.env){
 const backend=backendConfig(env);
 const configured=products.map(product=>{
  const suffix=product.envSuffix||product.sku.toUpperCase().replaceAll('-','_'),productId=env['GUMROAD_EFFECT_'+suffix+'_PRODUCT_ID'],checkoutUrl='https://fridburg.gumroad.com/l/'+product.permalink;
  const participationEnabled=Boolean(backend&&env.POINTLESS_EFFECTS_ENABLED==='true'&&env.POINTLESS_SELLER_ACCEPTED==='true'&&env['POINTLESS_EFFECT_'+suffix+'_ACCEPTED']==='true'&&typeof productId==='string'&&productId.length>0&&productId.length<=128&&!/[\s\x00-\x1f\x7f]/.test(productId));
  const purchaseEnabled=Boolean(participationEnabled&&env['POINTLESS_EFFECT_'+suffix+'_CHECKOUT_ENABLED']==='true'&&env['GUMROAD_EFFECT_'+suffix+'_CHECKOUT_URL']===checkoutUrl);
  return {sku:product.sku,participationEnabled,purchaseEnabled,checkoutUrl,productId};
 });
 return {backend,previewEnabled:Boolean(backend&&env.POINTLESS_EFFECT_PREVIEWS_ENABLED==='true'),products:configured};
}
async function boundedJson(response){
 const reader=response.body?.getReader();if(!reader)throw Error('invalid response');let bytes=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>8*1024*1024)throw Error('oversized response');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function validFiles(data){return exact(data,['effect','png','pdf','filename'])&&validEffect(data.effect)&&text(data.png,4*1024*1024)&&/^iVBORw0KGgo[A-Za-z0-9+/=]*$/.test(data.png)&&text(data.pdf,4*1024*1024)&&/^JVBERi0[A-Za-z0-9+/=]*$/.test(data.pdf)&&products.some(p=>p.slug===data.filename&&p.sku===data.effect.sku);}
function createEffectsProxy({env=process.env,request=(url,options)=>require('./instance-transport').instanceRequest(url,options)}={}){
 return async(context,req)=>{
  const method=req.method==='GET'?'GET':'POST',policy=commerceRequest(req,method);
  if(policy.status){context.res=policy;return;}
  const respond=(status,body)=>context.res={status,headers:policy.headers,body};
  const config=effectConfig(env),publicRequest=req.method==='GET';let action,payload;
  if(publicRequest){
   const q=req.query||{};action=q.action;
   if(action==='status'&&exact(q,['action'])){respond(200,{previewEnabled:config.previewEnabled,products:config.products.map(({sku,purchaseEnabled,participationEnabled})=>({sku,purchaseEnabled,participationEnabled}))});return;}
   if(action==='feed'&&exact(q,['action']))payload={};
   else if(action==='view'&&exact(q,['action','id'])&&id(q.id))payload={id:q.id};
   else{respond(400,{error:'invalid_request'});return;}
  }else{
   const b=commerceBody(req);
   if(!object(b)||Buffer.byteLength(JSON.stringify(b))>4096){respond(400,{error:'invalid_request'});return;}
   action=b.action;
   const valid=action==='preview'?exact(b,['action','sku','name','title','text','consent'])&&products.some(p=>p.sku===b.sku&&(!p.titleChoices||typeof b.title==='string'&&p.titleChoices.includes(b.title.trim())))&&text(b.name,60,true)&&text(b.title,70,true)&&text(b.text,240)&&b.consent===true:
    action==='deliver'?exact(b,['action','instance','license'])&&text(b.instance,4096,true)&&license(b.license):
    action==='download'||action==='remove'?exact(b,['action','id','license'])&&id(b.id)&&license(b.license):
    action==='play'&&exact(b,['action','id','license','move','requestId'])&&id(b.id)&&license(b.license)&&['attack','defend','boast','activate','start','complete'].includes(b.move)&&typeof b.requestId==='string'&&/^(?:[a-f0-9]{32}|[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12})$/.test(b.requestId);
   if(!valid){respond(400,{error:'invalid_request'});return;}
   if(action==='preview'&&!config.previewEnabled){respond(503,{error:'product_not_open'});return;}
   if(['deliver','download','play'].includes(action)&&!config.products.some(p=>p.participationEnabled)){respond(503,{error:'product_not_open'});return;}
   payload={...b};delete payload.action;
  }
  if(!config.backend){respond(503,{error:'effect_unavailable'});return;}
  try{
   const needsSku=['deliver','download','play'].includes(action);
   let expectedSku=null;
   if(action==='deliver'){
    const raw=payload.instance.split('.')[0];
    if(!/^[A-Za-z0-9_-]+$/.test(raw))throw Error('invalid preview');
    expectedSku=JSON.parse(Buffer.from(raw,'base64url').toString('utf8')).sku;
   }else if(action==='play'||action==='download'){
    const resolved=await request(config.backend.url+'/api/effects/resolve',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Accept:'application/json','x-functions-key':config.backend.key},body:JSON.stringify({id:payload.id}),signal:AbortSignal.timeout(15000)});
    const resolvedBody=await boundedJson(resolved);
    if(!resolved.ok||!exact(resolvedBody,['sku']))throw Error('invalid effect');
    expectedSku=resolvedBody.sku;
   }
   if(needsSku&&!config.products.some(p=>p.sku===expectedSku&&p.participationEnabled)){respond(503,{error:'product_not_open'});return;}
   const response=await request(config.backend.url+'/api/effects/'+action,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Accept:'application/json','x-functions-key':config.backend.key},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
   const data=await boundedJson(response);
   if(!response.ok){respond([400,402,403,404,409,410,503].includes(response.status)?response.status:503,{error:errorCodes.has(data?.error)?data.error:'effect_unavailable'});return;}
   const valid=action==='preview'?exact(data,['preview','instance'])&&text(data.preview,4*1024*1024,true)&&/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]*$/.test(data.preview)&&text(data.instance,4096,true):
    action==='deliver'||action==='download'?validFiles(data):
    action==='feed'?exact(data,['effects'])&&Array.isArray(data.effects)&&data.effects.length<=50&&data.effects.every(validEffect):
    action==='remove'?exact(data,['removed'])&&data.removed===true:exact(data,['effect'])&&validEffect(data.effect);
   if(!valid||needsSku&&data.effect?.sku!==expectedSku||['play','download'].includes(action)&&data.effect?.id!==payload.id)throw Error('invalid response');
   respond(200,data);
  }catch{respond(503,{error:'effect_unavailable'});}
 };
}
module.exports={createEffectsProxy,effectConfig,products,validEffect};
