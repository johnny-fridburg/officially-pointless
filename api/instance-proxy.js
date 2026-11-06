'use strict';
const {commerceRequest}=require('./commerce-origins');
const products=require('./gift-products.json').filter(p=>p.kind==='digital-certificate');
const skus=new Set(products.map(p=>p.sku));
const errors=new Set(['invalid_request','invalid_preview','invalid_name','unsupported_name_characters','unknown_product',
 'payment_required','payment_unavailable','delivery_unavailable','purchase_already_assigned','product_not_open']);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max;

function backendConfig(env=process.env){
 let url;try{url=new URL(env.POINTLESS_INSTANCE_BACKEND_URL);}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash||
   !/^officially-pointless-instances(?:-[a-z0-9]+)?(?:\.westeurope-01)?\.azurewebsites\.net$/.test(url.hostname)||
   !text(env.POINTLESS_INSTANCE_BACKEND_KEY,256)||env.POINTLESS_INSTANCE_BACKEND_KEY.length<32)return null;
 return {url:url.origin,key:env.POINTLESS_INSTANCE_BACKEND_KEY};
}
async function boundedJson(response){
 if(!response.body?.getReader)throw Error('invalid response');
 const reader=response.body.getReader(),chunks=[];let bytes=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4*1024*1024)throw Error('oversized response');chunks.push(Buffer.from(value));}}
 finally{await reader.cancel().catch(()=>{});}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function createInstanceProxy({env=process.env,request=fetch}={}){
 return async(context,req)=>{
  const policy=commerceRequest(req,'POST');if(policy.status){context.res=policy;return;}
  const respond=(status,body)=>{context.res={status,headers:policy.headers,body};};
  const body=req.body;
  if(!object(body)||Buffer.byteLength(JSON.stringify(body))>4096){respond(400,{error:'invalid_request'});return;}
  const action=body.action;
  const valid=action==='preview'?exact(body,['action','sku','recipient','giver'])&&skus.has(body.sku)&&text(body.recipient,60)&&text(body.giver,60):
    action==='deliver'&&exact(body,['action','instance','license'])&&text(body.instance,1600)&&typeof body.license==='string'&&/^[A-Za-z0-9-]{16,128}$/.test(body.license);
  if(!valid){respond(400,{error:'invalid_request'});return;}
  const config=backendConfig(env);if(!config){respond(503,{error:'delivery_unavailable'});return;}
  try{
   const payload={...body};delete payload.action;
   const response=await request(config.url+'/api/instances/'+action,{method:'POST',redirect:'error',
    headers:{'Content-Type':'application/json',Accept:'application/json','x-functions-key':config.key},
    body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
   const data=await boundedJson(response);
   if(!response.ok){respond([400,402,409,503].includes(response.status)?response.status:503,
      {error:errors.has(data?.error)?data.error:'delivery_unavailable'});return;}
   if(action==='preview'){
    if(!exact(data,['preview','instance'])||!text(data.instance,1600)||!text(data.preview,2*1024*1024)||
       !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]*$/.test(data.preview))throw Error('invalid preview');
   }else if(!exact(data,['png','pdf','filename'])||!text(data.png,2*1024*1024)||!/^iVBORw0KGgo[A-Za-z0-9+/=]*$/.test(data.png)||
     !text(data.pdf,2*1024*1024)||!/^JVBERi0[A-Za-z0-9+/=]*$/.test(data.pdf)||
     !products.some(p=>p.sku==='certificate-'+data.filename))throw Error('invalid delivery');
   respond(200,data);
  }catch{respond(503,{error:'delivery_unavailable'});}
 };
}
function createIssuedCertificateVerifier({env=process.env,request=fetch}={}){
 return async(license,productSku,recipientName)=>{
  const fail=code=>Object.assign(Error(code),{code});
  const config=backendConfig(env);
  if(!config)throw fail('delivery_unavailable');
  if(!skus.has(productSku)||typeof license!=='string'||!/^[A-Za-z0-9-]{16,128}$/.test(license)||!text(recipientName,60))throw fail('issued_recipient_required');
  try{
   const response=await request(config.url+'/api/instances/issued',{method:'POST',redirect:'error',
    headers:{'Content-Type':'application/json',Accept:'application/json','x-functions-key':config.key},
    body:JSON.stringify({sku:productSku,license,recipient:recipientName}),signal:AbortSignal.timeout(15000)});
   const data=await boundedJson(response);
   if(!response.ok)throw fail([402,403].includes(response.status)?'issued_recipient_required':'delivery_unavailable');
   if(!exact(data,['owner','recipient'])||typeof data.owner!=='string'||!/^[a-f0-9]{64}$/.test(data.owner)||data.recipient!==recipientName.trim())throw fail('delivery_unavailable');
   return data;
  }catch(error){throw fail(error.code==='issued_recipient_required'?'issued_recipient_required':'delivery_unavailable');}
 };
}
module.exports={createInstanceProxy,backendConfig,createIssuedCertificateVerifier};
