'use strict';
const {randomBytes,createHash,timingSafeEqual}=require('node:crypto');
const departments=require('./departments.json');
const {credentialHash,validLicense}=require('./department-access');
const {renderGift}=require('./department-gift');
const {MAX_BYTES}=require('./community-store');
const ORIGINS=new Set(['https://officiallypointless.com','https://www.officiallypointless.com']);
const RESPONSE_HEADERS={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const hash=value=>createHash('sha256').update(value).digest('hex');
const project=({id,department,name,text,title,theme,createdAt})=>({id,department,name,text,title,theme,createdAt});
const error=(code,status)=>Object.assign(new Error(code),{code,status});
function text(value,max,required=false){
  if(value===undefined&&!required)return '';
  if(typeof value!=='string'||value.length>max||/[\x00-\x1f\x7f]/.test(value)||required&&!value.trim())throw error('invalid_submission',400);
  return value.trim();
}
function submission(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['department','name','giver','text','title','theme','requestId'].includes(k)))throw error('invalid_submission',400);
  const department=departments.find(d=>d.slug===body.department);if(!department)throw error('invalid_submission',400);
  const input={department:department.slug,name:text(body.name,70,true),giver:text(body.giver,70),text:text(body.text,240,true),title:text(body.title,70),theme:body.theme??'classic'};
  if(!['classic','chaos','terminal'].includes(input.theme))throw error('invalid_submission',400);
  if(body.requestId!==undefined&&(typeof body.requestId!=='string'||!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(body.requestId)))throw error('invalid_submission',400);
  return {department,input};
}
function stateFrom(snapshot){
  const state=snapshot.state||{version:2,namespace:'paid-departments',records:[],receipts:[]};
  const hex=(v,n)=>typeof v==='string'&&new RegExp('^[a-f0-9]{'+n+'}$').test(v);
  const bounded=(v,max,required=false)=>typeof v==='string'&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v)&&(!required||Boolean(v.trim()));
  const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
  const keys=['department','name','text','title','theme','id','createdAt','owner','credentialHash'];
  const validRecord=r=>r&&typeof r==='object'&&!Array.isArray(r)&&Object.keys(r).length===keys.length&&Object.keys(r).every(k=>keys.includes(k))&&
    hex(r.id,24)&&hex(r.owner,64)&&hex(r.credentialHash,64)&&departments.some(d=>d.slug===r.department)&&
    bounded(r.name,70,true)&&bounded(r.text,240,true)&&bounded(r.title,70)&&['classic','chaos','terminal'].includes(r.theme)&&Number.isSafeInteger(r.createdAt)&&r.createdAt>0;
  const receiptKeys=['owner','requestId','fingerprint','id','at'];
  const validReceipt=r=>r&&typeof r==='object'&&!Array.isArray(r)&&Object.keys(r).length===receiptKeys.length&&Object.keys(r).every(k=>receiptKeys.includes(k))&&
    hex(r.owner,64)&&hex(r.fingerprint,64)&&hex(r.id,24)&&uuid(r.requestId)&&Number.isSafeInteger(r.at)&&r.at>0;
  if(state.version!==2||state.namespace!=='paid-departments'||Object.keys(state).length!==4||!Array.isArray(state.records)||!Array.isArray(state.receipts)||
    !state.records.every(validRecord)||!state.receipts.every(validReceipt)||new Set(state.records.map(r=>r.id)).size!==state.records.length||
    Buffer.byteLength(JSON.stringify(state))>MAX_BYTES)throw error('department_unavailable',503);
  return state;
}
function same(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==64||b.length!==64)return false;return timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function grantedDepartments(grant){
  // Older collection verifiers return only the stable owner/key digests.
  if(grant.departments===undefined)return departments;
  if(!Array.isArray(grant.departments)||!grant.departments.length||
    new Set(grant.departments).size!==grant.departments.length||
    grant.departments.some(slug=>!departments.some(department=>department.slug===slug)))throw error('payment_required',402);
  return departments.filter(department=>grant.departments.includes(department.slug));
}
function createDepartmentHandler({enabled=false,removalEnabled=enabled,store,verifyLicense,adminToken=null,now=Date.now}={}){
  const open=Boolean(enabled&&store&&verifyLicense);
  const removalOpen=Boolean(removalEnabled&&store);
  return async(context,req)=>{
    const respond=(status,body,headers={})=>context.res={status,headers:{...RESPONSE_HEADERS,...headers},body};
    const action=req?.params?.action;
    if(action==='status'&&req.method==='GET'){respond(200,{enabled:open,removalEnabled:removalOpen});return;}
    if(!open&&!(action==='remove'&&removalOpen)){respond(503,{error:'paid_access_not_open'});return;}
    if(!['access','gift','publish','presence','remove'].includes(action)){respond(404,{error:'unknown_action'});return;}
    if(req.method!==(action==='presence'?'GET':'POST')){respond(405,{error:'method_not_allowed'});return;}
    const headers=Object.fromEntries(Object.entries(req.headers||{}).map(([key,value])=>[key.toLowerCase(),value]));
    if(req.method==='POST'&&!ORIGINS.has(headers.origin)){respond(403,{error:'forbidden_origin'});return;}
    const license=headers['x-pointless-license'];
    try{
      if(action==='presence'){
        if(typeof req.query?.id!=='string'||!/^[a-f0-9]{24}$/.test(req.query.id))throw error('invalid_link',400);
        const state=stateFrom(await store.read());const record=state.records.find(r=>r.id===req.query.id);
        if(!record)throw error('record_not_found',404);respond(200,{record:project(record)});return;
      }
      if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Buffer.byteLength(JSON.stringify(req.body))>4096)throw error('invalid_submission',400);
      if(action==='remove'){
        const operator=typeof adminToken==='string'&&adminToken.length>=32&&typeof headers['x-pointless-operator']==='string'&&same(hash(adminToken),hash(headers['x-pointless-operator']));
        if((!operator&&!validLicense(license))||Object.keys(req.body).some(k=>k!=='id')||!/^[a-f0-9]{24}$/.test(req.body.id||''))throw error('invalid_submission',400);
        // Only a key previously verified on publication can remove the record.
        // This remains available after refund/revocation or a provider outage.
        for(let attempt=0;attempt<5;attempt++){
          const snapshot=await store.read(),state=stateFrom(snapshot),record=state.records.find(r=>r.id===req.body.id);
          if(!record)throw error('record_not_found',404);
          if(!operator&&!same(record.credentialHash,credentialHash(license))){
            // A provider-rotated key can prove the same purchase. Stored original
            // key hashes still work without contacting an unavailable provider.
            let verified;try{verified=await verifyLicense(license,record.department);}catch{throw error('not_your_entry',403);}
            if(!same(record.owner,verified.owner)||!grantedDepartments(verified).some(department=>department.slug===record.department))throw error('not_your_entry',403);
          }
          state.records=state.records.filter(r=>r.id!==record.id);
          if(await store.write(state,snapshot.etag)){respond(200,{removed:true});return;}
        }
        throw error('department_busy',503);
      }
      if(action==='access'&&Object.keys(req.body).length)throw error('invalid_submission',400);
      const parsed=action==='access'?null:submission(req.body);
      const grant=await verifyLicense(license);
      const entitled=grantedDepartments(grant);
      if(action==='access'){const state=stateFrom(await store.read());respond(200,{departments:entitled,records:state.records.filter(r=>r.owner===grant.owner&&entitled.some(d=>d.slug===r.department)).map(project)});return;}
      const {department,input}=parsed;
      if(!entitled.some(d=>d.slug===department.slug))throw error('department_not_purchased',403);
      if(action==='gift'){respond(200,{filename:department.slug+'-gift.html',html:renderGift(department,input)});return;}
      if(!req.body.requestId)throw error('invalid_submission',400);
      // Giver belongs only to private gifts; do not persist it or include it in
      // the public fingerprint/receipt. Public alias is deliberately explicit.
      const {giver,...publicInput}=input;
      const fingerprint=hash(JSON.stringify(publicInput));
      for(let attempt=0;attempt<5;attempt++){
        const snapshot=await store.read(),state=stateFrom(snapshot),time=now();
        state.receipts=state.receipts.filter(r=>r.at>time-86400000);
        const previous=state.receipts.find(r=>r.owner===grant.owner&&r.requestId===req.body.requestId);
        if(previous){if(previous.fingerprint!==fingerprint)throw error('retry_changed',409);const record=state.records.find(r=>r.id===previous.id);if(!record)throw error('record_removed',410);respond(200,{record:project(record)});return;}
        if(state.records.some(r=>r.owner===grant.owner&&r.department===input.department))throw error('department_already_used',409);
        if(state.records.filter(r=>r.department===input.department).length>=100)throw error('department_full',409);
        const own=state.receipts.filter(r=>r.owner===grant.owner);
        if(own.some(r=>r.at>time-10000)||own.filter(r=>r.at>time-3600000).length>=10||state.receipts.filter(r=>r.at>time-3600000).length>=50||state.receipts.length>=250){respond(429,{error:'publication_limit'},{'Retry-After':'60'});return;}
        const record={...publicInput,id:randomBytes(12).toString('hex'),createdAt:time,owner:grant.owner,credentialHash:grant.credentialHash};
        state.records.push(record);state.receipts.push({owner:grant.owner,requestId:req.body.requestId,fingerprint,id:record.id,at:time});
        if(Buffer.byteLength(JSON.stringify(state))>MAX_BYTES)throw error('department_full',409);
        if(await store.write(state,snapshot.etag)){respond(201,{record:project(record)});return;}
      }
      throw error('department_busy',503);
    }catch(e){
      const known=new Set(['invalid_link','record_not_found','invalid_submission','not_your_entry','department_not_purchased','department_busy','department_unavailable','retry_changed','record_removed','department_already_used','department_full']);
      if(e.code==='payment_required'){respond(402,{error:'payment_required'});return;}
      if(e.code==='payment_unavailable'){respond(503,{error:'payment_unavailable'});return;}
      respond(known.has(e.code)?e.status:503,{error:known.has(e.code)?e.code:'department_unavailable'});
    }
  };
}
module.exports={createDepartmentHandler};
