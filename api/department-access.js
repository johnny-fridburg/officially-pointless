'use strict';
const {createHash}=require('node:crypto');
const {createBlobStore}=require('./community-store');
const PRODUCT_SLUG='department-collection';
const digest=value=>createHash('sha256').update(value).digest('hex');
const credentialHash=license=>digest('pointless-department-key:'+license);
const validLicense=license=>typeof license==='string'&&/^[A-Za-z0-9-]{16,128}$/.test(license);
class PaymentError extends Error {
  constructor(code){super(code);this.code=code;}
}
async function boundedJson(response){
  const reader=response.body?.getReader();if(!reader)throw new PaymentError('payment_unavailable');
  let bytes=0;const chunks=[];
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>65536)throw new PaymentError('payment_unavailable');chunks.push(Buffer.from(value));}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }finally{await reader.cancel().catch(()=>{});}
}
function createLicenseVerifier({productId,request=fetch}={}){
  return async license=>{
    if(!validLicense(license))throw new PaymentError('payment_required');
    if(typeof productId!=='string'||!productId||productId.length>128)throw new PaymentError('payment_unavailable');
    let data;
    try{
      const response=await request('https://api.gumroad.com/v2/licenses/verify',{
        method:'POST',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},
        body:new URLSearchParams({product_id:productId,license_key:license,increment_uses_count:'false'}).toString(),
        signal:AbortSignal.timeout(5000),
      });
      if(response.status===404||response.status===400)throw new PaymentError('payment_required');
      if(!response.ok)throw new PaymentError('payment_unavailable');
      data=await boundedJson(response);
    }catch(error){if(error instanceof PaymentError)throw error;throw new PaymentError('payment_unavailable');}
    const p=data?.purchase;
    // Gumroad omits optional test/recurring/preorder flags when false. Required
    // refund/dispute booleans and matching identity fields must be explicit.
    if(data.success!==true||!p||p.product_id!==productId||p.permalink!==PRODUCT_SLUG||
      p.license_key!==license||typeof p.sale_id!=='string'||!p.sale_id||p.sale_id.length>128||
      !Number.isSafeInteger(p.price)||p.price<=0||p.refunded!==false||p.chargebacked!==false||p.disputed!==false||
      p.test!==undefined&&p.test!==false||p.is_gift_receiver_purchase!==false||
      p.subscription_id||p.recurrence||p.is_recurring_charge||p.is_preorder_authorization||
      p.subscription_ended_at||p.subscription_cancelled_at||p.subscription_failed_at){
      throw new PaymentError('payment_required');
    }
    return {owner:digest('gumroad-department:'+productId+':'+p.sale_id),credentialHash:credentialHash(license)};
  };
}
function blobIdentity(url){try{const u=new URL(url);return u.origin+u.pathname;}catch{return null;}}
function departmentConfig(env=process.env){
  const store=createBlobStore(env.POINTLESS_DEPARTMENTS_BLOB_URL);
  const productId=env.GUMROAD_DEPARTMENT_PRODUCT_ID;
  const enabled=env.POINTLESS_DEPARTMENTS_ENABLED==='true'&&env.POINTLESS_DEPARTMENTS_ACCEPTED==='true'&&
    env.POINTLESS_SELLER_ACCEPTED==='true'&&typeof productId==='string'&&productId.length>0&&productId.length<=128&&
    Boolean(store)&&new URL(env.POINTLESS_DEPARTMENTS_BLOB_URL).pathname==='/departments/state.json'&&blobIdentity(env.POINTLESS_DEPARTMENTS_BLOB_URL)!==blobIdentity(env.POINTLESS_COMMUNITY_BLOB_URL);
  return {enabled,store,productId,adminToken:env.POINTLESS_DEPARTMENTS_ADMIN_TOKEN||null};
}
module.exports={createLicenseVerifier,departmentConfig,credentialHash,validLicense,PaymentError};
