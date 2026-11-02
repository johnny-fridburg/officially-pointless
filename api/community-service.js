'use strict';
const {createHash,randomBytes,timingSafeEqual}=require('node:crypto');
const {inflateSync}=require('node:zlib');
const {IdentityUnavailable}=require('./google-identity');
const {MAX_BYTES}=require('./community-store');
const FEATURES=['make-it-worse','silence','loading','last-word','museum','golden-error','button'];
const ORIGINS=new Set(['https://officiallypointless.com','https://www.officiallypointless.com']);
const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
const hash=value=>createHash('sha256').update(value).digest('hex');
const fresh=()=>({version:1,records:[],receipts:[]});
const publicRecord=(record,photo=false,viewer=null)=>{
 const {owner,...rest}=record;if(!photo&&rest.photo){rest.hasPhoto=true;delete rest.photo;}rest.canRemove=Boolean(viewer&&record.owner===viewer);return rest;
};
function publicState(state,viewer=null){
 const departments=Object.fromEntries(FEATURES.map(feature=>[feature,state.records.filter(r=>r.feature===feature).slice(-20).reverse().map(r=>publicRecord(r,false,viewer))]));
 return {departments,theme:departments['make-it-worse'][0]?.theme||'classic',themeBy:departments['make-it-worse'][0]?.name||null,delaySeconds:Math.min(300,5+state.records.filter(r=>r.feature==='loading').length*5),lastWord:departments['last-word'][0]||null,counts:Object.fromEntries(FEATURES.map(f=>[f,state.records.filter(r=>r.feature===f).length]))};
}
function text(value,max,required=false){if(value===undefined&&!required)return '';if(typeof value!=='string'||value.length>max||/[\x00-\x1f\x7f]/.test(value))throw Error('invalid');const trimmed=value.trim();if(required&&!trimmed)throw Error('invalid');return trimmed;}
function crc32(data){let crc=0xffffffff;for(const byte of data){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function validatePhoto(value){
 if(value===undefined||value==='')return '';
 if(typeof value!=='string'||value.length>44000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw Error('invalid');
 const data=Buffer.from(value.slice(22),'base64');if(data.length>32768||data.length<57||data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('invalid');
 let offset=8,width,height,color,ended=false;const compressed=[];
 while(offset<data.length){
  if(offset+12>data.length)throw Error('invalid');const size=data.readUInt32BE(offset);if(size>data.length-offset-12)throw Error('invalid');const kind=data.toString('ascii',offset+4,offset+8),chunk=data.subarray(offset+8,offset+8+size);
  if(crc32(data.subarray(offset+4,offset+8+size))!==data.readUInt32BE(offset+8+size))throw Error('invalid');
  if(kind==='IHDR'){if(offset!==8||size!==13)throw Error('invalid');width=chunk.readUInt32BE(0);height=chunk.readUInt32BE(4);color=chunk[9];if(!width||!height||width>240||height>240||chunk[8]!==8||![2,6].includes(color)||chunk[10]||chunk[11]||chunk[12])throw Error('invalid');}
  else if(kind==='IDAT'){if(!width||ended)throw Error('invalid');compressed.push(chunk);}
  else if(kind==='IEND'){if(size||offset+12!==data.length)throw Error('invalid');ended=true;}
  else throw Error('invalid');
  offset+=12+size;
 }
 if(!ended||!compressed.length)throw Error('invalid');const rowBytes=width*(color===6?4:3)+1;const decoded=inflateSync(Buffer.concat(compressed),{maxOutputLength:rowBytes*height+1});if(decoded.length!==rowBytes*height)throw Error('invalid');for(let y=0;y<height;y++)if(decoded[y*rowBytes]>4)throw Error('invalid');
 return value;
}
function validateSubmission(body){
 const allowed=new Set(['feature','name','text','title','theme','photo','requestId']);
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!allowed.has(k))||!FEATURES.includes(body.feature)||typeof body.requestId!=='string'||!/^[a-f0-9-]{36}$/.test(body.requestId))throw Error('invalid');
 const entry={feature:body.feature,name:text(body.name,70,true),text:text(body.text,240),title:text(body.title,70),theme:body.theme===undefined?'classic':body.theme};
 if(!['classic','chaos','terminal'].includes(entry.theme))throw Error('invalid');
 if(body.feature==='last-word'&&!entry.text)throw Error('invalid');
 if(body.feature==='museum'){entry.title=entry.title||'An ordinary thing';entry.photo=validatePhoto(body.photo);}else if(body.photo)throw Error('invalid');
 return entry;
}
function equalSecret(a,b){const aa=Buffer.from(a||''),bb=Buffer.from(b||'');return aa.length>=32&&aa.length===bb.length&&timingSafeEqual(aa,bb);}
function createCommunityHandler({store,verifyIdentity,clientId=null,adminToken=null,now=Date.now}={}){
 return async(context,req)=>{
  const respond=(status,body,extra={})=>{context.res={status,headers:{...headers,...extra},body};};
  if(!['GET','POST','DELETE'].includes(req?.method)){respond(405,{error:'method_not_allowed'});return;}
  const reqHeaders=Object.fromEntries(Object.entries(req.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
  if(req.method!=='GET'&&!ORIGINS.has(reqHeaders.origin)){respond(403,{error:'forbidden_origin'});return;}
  if(!store){respond(503,{error:'community_unavailable'});return;}
  // Azure's managed API gateway replaces Authorization; use the app-owned transport.
  const appAuthorization=reqHeaders['x-pointless-authorization'];
  let owner=null,operator=false;
  if(req.method==='GET'&&appAuthorization&&verifyIdentity){try{const identity=await verifyIdentity(appAuthorization.match(/^Bearer (\S+)$/)?.[1]);owner=hash('google:'+identity.sub);}catch{ /* Browsing stays available after a sign-in expires. */ }}
  if(req.method!=='GET'){
   const credential=appAuthorization?.match(/^Bearer (\S+)$/)?.[1];operator=req.method==='DELETE'&&adminToken&&equalSecret(credential,adminToken);
   if(!operator){try{if(!verifyIdentity)throw new IdentityUnavailable();const identity=await verifyIdentity(credential);owner=hash('google:'+identity.sub);}catch(error){respond(error instanceof IdentityUnavailable?503:401,{error:error instanceof IdentityUnavailable?'sign_in_unavailable':'sign_in_required'});return;}}
  }
  let entry;if(req.method==='POST'){try{entry=validateSubmission(req.body);}catch{respond(400,{error:'invalid_submission'});return;}}
  if(req.method==='DELETE'&&(!req.body||Object.keys(req.body).some(k=>k!=='id')||!/^[a-f0-9]{24}$/.test(req.body.id||''))){respond(400,{error:'invalid_submission'});return;}
  try{
   for(let attempt=0;attempt<5;attempt++){
    const snapshot=await store.read();const state=snapshot.state||fresh();if(state.version!==1||!Array.isArray(state.records)||!Array.isArray(state.receipts))throw Error('storage invalid');
    if(req.method==='GET'){
     const result={...publicState(state,owner),googleClientId:clientId,publishingEnabled:Boolean(verifyIdentity&&clientId),serverTime:now()};
     if(req.query?.id){const record=state.records.find(r=>r.id===req.query.id);if(!record){respond(404,{error:'record_not_found',...result});return;}result.record=publicRecord(record,true,owner);}
     respond(200,result);return;
    }
    if(req.method==='DELETE'){
     const record=state.records.find(r=>r.id===req.body.id);if(!record){respond(404,{error:'record_not_found'});return;}if(!operator&&record.owner!==owner){respond(403,{error:'not_your_entry'});return;}
     state.records=state.records.filter(r=>r.id!==record.id);if(await store.write(state,snapshot.etag)){respond(200,{removed:true,...publicState(state,owner)});return;}continue;
    }
    const time=now();state.receipts=state.receipts.filter(r=>r.at>time-86400000);
    const fingerprint=hash(JSON.stringify(entry));const previous=state.receipts.find(r=>r.owner===owner&&r.requestId===req.body.requestId);
    if(previous){if(previous.fingerprint!==fingerprint){respond(409,{error:'retry_changed'});return;}const record=state.records.find(r=>r.id===previous.id);if(!record){respond(410,{error:'record_removed'});return;}respond(200,{record:publicRecord(record,true,owner),...publicState(state,owner)});return;}
    const own=state.receipts.filter(r=>r.owner===owner);if(own.some(r=>r.at>time-10000)||own.filter(r=>r.at>time-3600000).length>=10||state.receipts.filter(r=>r.at>time-3600000).length>=50||state.receipts.length>=250){respond(429,{error:'participation_limit'},{'Retry-After':'60'});return;}
    if(state.records.filter(r=>r.feature===entry.feature).length>=100){respond(409,{error:'department_full'});return;}
    const record={id:randomBytes(12).toString('hex'),owner,feature:entry.feature,name:entry.name,createdAt:time};
    if(entry.text)record.text=entry.text;if(entry.feature==='museum'){record.title=entry.title;if(entry.photo)record.photo=entry.photo;}
    if(entry.feature==='make-it-worse')record.theme=entry.theme;
    if(entry.feature==='silence'){record.startsAt=time;record.durationSeconds=60;}
    if(entry.feature==='loading')record.seconds=5;
    state.records.push(record);state.receipts.push({owner,requestId:req.body.requestId,fingerprint,id:record.id,at:time});
    if(Buffer.byteLength(JSON.stringify(state))>MAX_BYTES){respond(409,{error:'department_full'});return;}
    if(await store.write(state,snapshot.etag)){respond(201,{record:publicRecord(record,true,owner),...publicState(state,owner)});return;}
   }
   respond(503,{error:'community_busy'});
  }catch{respond(503,{error:'community_unavailable'});}
 };
}
module.exports={createCommunityHandler,validatePhoto};
