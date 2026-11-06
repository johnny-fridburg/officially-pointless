'use strict';
const LEGACY_MAX_BYTES=2*1024*1024;
const MAX_BYTES=3*1024*1024;
const departments=require('./departments.json');
const products=Object.freeze(require('./gift-products.json').map(product=>Object.freeze(product)));
const hex=(value,length)=>typeof value==='string'&&new RegExp('^[a-f0-9]{'+length+'}$').test(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const validHandle=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(value);
const bounded=(value,max,required=false)=>typeof value==='string'&&value.length<=max&&!/[\x00-\x1f\x7f]/.test(value)&&(!required||Boolean(value.trim()));
const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
const unavailable=()=>Object.assign(new Error('paid_state_unavailable'),{code:'paid_state_unavailable',status:503});
const receiptKeys=['owner','requestId','fingerprint','id','at'];
const validReceipt=receipt=>exactKeys(receipt,receiptKeys)&&hex(receipt.owner,64)&&hex(receipt.fingerprint,64)&&hex(receipt.id,24)&&uuid(receipt.requestId)&&Number.isSafeInteger(receipt.at)&&receipt.at>0;
const recordKeys=['department','name','text','title','theme','id','createdAt','owner','credentialHash'];
const validRecord=record=>exactKeys(record,recordKeys)&&hex(record.id,24)&&hex(record.owner,64)&&hex(record.credentialHash,64)&&
  departments.some(department=>department.slug===record.department)&&bounded(record.name,70,true)&&bounded(record.text,240,true)&&bounded(record.title,70)&&
  ['classic','chaos','terminal'].includes(record.theme)&&Number.isSafeInteger(record.createdAt)&&record.createdAt>0;
const claimKeys=['owner','productSku','id'];
const validClaim=claim=>exactKeys(claim,claimKeys)&&hex(claim.owner,64)&&hex(claim.id,24)&&products.some(p=>p.kind==='digital-certificate'&&p.sku===claim.productSku);
const giftKeys=['productSku','recipientHandle','name','text','consent','id','createdAt','owner','credentialHash'];
const validGift=gift=>exactKeys(gift,giftKeys)&&hex(gift.id,24)&&hex(gift.owner,64)&&hex(gift.credentialHash,64)&&
  products.some(product=>product.sku===gift.productSku)&&validHandle(gift.recipientHandle)&&bounded(gift.name,70,true)&&gift.name===gift.name.trim()&&
  bounded(gift.text,240)&&gift.text===gift.text.trim()&&gift.consent===true&&Number.isSafeInteger(gift.createdAt)&&gift.createdAt>0;

function readPaidState(snapshot){
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot)||!Object.hasOwn(snapshot,'state'))throw unavailable();
  const state=snapshot.state;
  if(state===null){if(snapshot.etag!==null)throw unavailable();return {version:4,namespace:'paid-departments',records:[],receipts:[],gifts:[],giftReceipts:[],certificateClaims:[]};}
  if(!state||typeof state!=='object'||Array.isArray(state))throw unavailable();
  const keys=state.version===2?['version','namespace','records','receipts']:['version','namespace','records','receipts','gifts','giftReceipts',...(state.version===4?['certificateClaims']:[])];
  if(![2,3,4].includes(state.version)||!exactKeys(state,keys)||state.namespace!=='paid-departments'||
    Buffer.byteLength(JSON.stringify(state))>(state.version===4?MAX_BYTES:LEGACY_MAX_BYTES)||!Array.isArray(state.records)||!Array.isArray(state.receipts)||
    !state.records.every(validRecord)||!state.receipts.every(validReceipt)||state.version>=3&&
    (!Array.isArray(state.gifts)||!Array.isArray(state.giftReceipts)||state.gifts.length>1500||!state.gifts.every(validGift)||!state.giftReceipts.every(validReceipt))||state.version===4&&(!Array.isArray(state.certificateClaims)||state.certificateClaims.length>10000||!state.certificateClaims.every(validClaim)))throw unavailable();
  const migrated={...structuredClone(state),version:4,...(state.version===2&&{gifts:[],giftReceipts:[]}),certificateClaims:state.version===4?structuredClone(state.certificateClaims):(state.gifts||[]).filter(g=>products.some(p=>p.sku===g.productSku&&p.kind==='digital-certificate')).map(({owner,productSku,id})=>({owner,productSku,id}))};
  const claims=migrated.certificateClaims,claimSlots=claims.map(c=>c.owner+':'+c.productSku);
  if(new Set(claimSlots).size!==claims.length||new Set(claims.map(c=>c.id)).size!==claims.length)throw unavailable();
  for(const gift of migrated.gifts.filter(g=>products.some(p=>p.sku===g.productSku&&p.kind==='digital-certificate')))if(!claims.some(c=>c.owner===gift.owner&&c.productSku===gift.productSku&&c.id===gift.id))throw unavailable();
  const records=[...migrated.records,...migrated.gifts],slots=records.map(record=>record.owner+':'+(record.productSku||'department-'+record.department));
  if(new Set(records.map(record=>record.id)).size!==records.length||new Set(slots).size!==slots.length)throw unavailable();
  for(const [entries,receipts]of [[migrated.records,migrated.receipts],[migrated.gifts,migrated.giftReceipts]]){
    const byId=new Map(entries.map(entry=>[entry.id,entry])),requests=new Set();
    for(const receipt of receipts){
      const request=receipt.owner+':'+receipt.requestId,entry=byId.get(receipt.id);
      if(requests.has(request)||entry&&entry.owner!==receipt.owner)throw unavailable();requests.add(request);
    }
  }
  const names=new Map();
  for(const gift of migrated.gifts){if(names.has(gift.recipientHandle)&&names.get(gift.recipientHandle)!==gift.name)throw unavailable();names.set(gift.recipientHandle,gift.name);}
  return migrated;
}
function productSlotUsed(state,owner,sku){return state.certificateClaims.some(c=>c.owner===owner&&c.productSku===sku)||state.gifts.some(gift=>gift.owner===owner&&gift.productSku===sku)||
  state.records.some(record=>record.owner===owner&&'department-'+record.department===sku);}
function productCount(state,sku){return state.gifts.filter(gift=>gift.productSku===sku).length+state.records.filter(record=>'department-'+record.department===sku).length;}
function pruneReceipts(state,time){state.receipts=state.receipts.filter(receipt=>receipt.at>time-86400000);state.giftReceipts=state.giftReceipts.filter(receipt=>receipt.at>time-86400000);}
function publicationLimited(state,owner,time){
  const receipts=[...state.receipts,...state.giftReceipts],own=receipts.filter(receipt=>receipt.owner===owner);
  return own.some(receipt=>receipt.at>time-10000)||own.filter(receipt=>receipt.at>time-3600000).length>=10||
    receipts.filter(receipt=>receipt.at>time-3600000).length>=50||receipts.length>=250;
}
module.exports={readPaidState,productSlotUsed,productCount,pruneReceipts,publicationLimited,products,validHandle,hex,uuid,MAX_BYTES};
