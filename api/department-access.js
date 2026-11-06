'use strict';
const {createHash}=require('node:crypto');
const {createBlobStore}=require('./community-store');
const {PRODUCT_SITES}=require('./product-sites');
const giftProducts=Object.freeze(require('./gift-products.json').map(product=>Object.freeze(product)));
const permalinkProducts=new Map(giftProducts.map(product=>[product.permalink,product]));
const PRODUCT_SLUG='department-collection';
const departmentSites=PRODUCT_SITES.filter(site=>site.sku.startsWith('department-'));
const permalinkDepartments=new Map(departmentSites.map(site=>['pointless-'+site.sku.slice('department-'.length),site.sku.slice('department-'.length)]));
const validProductId=value=>typeof value==='string'&&value.length>0&&value.length<=128&&!/[\s\x00-\x1f\x7f]/.test(value);
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
function createLicenseVerifier({productId,permalink=PRODUCT_SLUG,request=fetch}={}){
  const department=permalinkDepartments.get(permalink);
  const product=permalinkProducts.get(permalink);
  return async license=>{
    if(!validLicense(license))throw new PaymentError('payment_required');
    if(!validProductId(productId)||permalink!==PRODUCT_SLUG&&!product)throw new PaymentError('payment_unavailable');
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
    if(data?.success!==true||!p||p.product_id!==productId||p.permalink!==permalink||
      p.license_key!==license||typeof p.sale_id!=='string'||!p.sale_id||p.sale_id.length>128||
      !Number.isSafeInteger(p.price)||p.price<=0||p.refunded!==false||p.chargebacked!==false||p.disputed!==false||
      p.test!==undefined&&p.test!==false||p.is_gift_receiver_purchase!==false||
      p.subscription_id||p.recurrence||p.is_recurring_charge||p.is_preorder_authorization||
      p.subscription_ended_at||p.subscription_cancelled_at||p.subscription_failed_at){
      throw new PaymentError('payment_required');
    }
    return {owner:digest('gumroad-department:'+productId+':'+p.sale_id),credentialHash:credentialHash(license),
      ...(department&&{departments:[department]}),...(product?.kind==='digital-certificate'&&{products:[product.sku]})};
  };
}
function createProductLicenseVerifier({products=[],request=fetch}={}){
  const valid=Array.isArray(products)&&products.length<=16&&products.every(product=>product&&validProductId(product.productId)&&
    (product.permalink===PRODUCT_SLUG||permalinkProducts.has(product.permalink)));
  const verifiers=valid?products.map(product=>({permalink:product.permalink,verify:createLicenseVerifier({...product,request})})):[];
  return async(license,productSku)=>{
    if(!validLicense(license))throw new PaymentError('payment_required');
    if(!valid||!verifiers.length)throw new PaymentError('payment_unavailable');
    const requested=productSku===undefined?null:giftProducts.find(product=>product.sku===productSku);
    if(productSku!==undefined&&!requested)throw new PaymentError('payment_required');
    const candidates=verifiers.filter(product=>!requested||product.permalink===requested.permalink||
      product.permalink===PRODUCT_SLUG&&requested.kind==='online-department');
    if(!candidates.length)throw new PaymentError('payment_required');
    const results=await Promise.allSettled(candidates.map(product=>product.verify(license)));
    const verified=results.find(result=>result.status==='fulfilled');if(verified)return verified.value;
    if(results.some(result=>result.reason?.code!=='payment_required'))throw new PaymentError('payment_unavailable');
    throw new PaymentError('payment_required');
  };
}
function createDepartmentLicenseVerifier({products=[],request=fetch}={}){
  const verifiers=products.map(product=>({
    permalink:product.permalink,
    verify:createLicenseVerifier({...product,request}),
  }));
  return async(license,department)=>{
    if(!validLicense(license))throw new PaymentError('payment_required');
    if(department!==undefined&&!departmentSites.some(site=>site.sku==='department-'+department))throw new PaymentError('payment_required');
    const candidates=verifiers.filter(product=>department===undefined||product.permalink===PRODUCT_SLUG||permalinkDepartments.get(product.permalink)===department);
    if(!candidates.length)throw new PaymentError(verifiers.length?'payment_required':'payment_unavailable');
    // A generic key may belong to any accepted product. Verification runs in
    // parallel so the provider timeout also bounds a collection/individual lookup.
    const results=await Promise.allSettled(candidates.map(product=>product.verify(license)));
    const verified=results.find(result=>result.status==='fulfilled');
    if(verified)return verified.value;
    if(results.some(result=>result.reason?.code!=='payment_required'))throw new PaymentError('payment_unavailable');
    throw new PaymentError('payment_required');
  };
}
function blobIdentity(url){try{const u=new URL(url);return u.origin+u.pathname;}catch{return null;}}
function departmentConfig(env=process.env){
  const store=createBlobStore(env.POINTLESS_DEPARTMENTS_BLOB_URL,{request:(url,options)=>fetch(url,{...options,redirect:'error'})});
  const productId=env.GUMROAD_DEPARTMENT_PRODUCT_ID;
  const storageReady=Boolean(store)&&new URL(env.POINTLESS_DEPARTMENTS_BLOB_URL).pathname==='/departments/state.json'&&
    !new URL(env.POINTLESS_DEPARTMENTS_BLOB_URL).port&&Boolean(new URL(env.POINTLESS_DEPARTMENTS_BLOB_URL).searchParams.get('sig'))&&
    blobIdentity(env.POINTLESS_DEPARTMENTS_BLOB_URL)!==blobIdentity(env.POINTLESS_COMMUNITY_BLOB_URL);
  const infrastructureReady=env.POINTLESS_DEPARTMENTS_ENABLED==='true'&&env.POINTLESS_SELLER_ACCEPTED==='true'&&storageReady;
  const adminToken=env.POINTLESS_DEPARTMENTS_ADMIN_TOKEN||null;
  const collectionEnabled=Boolean(infrastructureReady&&env.POINTLESS_DEPARTMENTS_ACCEPTED==='true'&&validProductId(productId));
  const departmentProducts=departmentSites.map(site=>{
    const slug=site.sku.slice('department-'.length),name=slug.toUpperCase().replaceAll('-','_');
    const productId=env['GUMROAD_DEPARTMENT_'+name+'_PRODUCT_ID'];
    const enabled=Boolean(infrastructureReady&&typeof adminToken==='string'&&adminToken.length>=32&&
      env['POINTLESS_DEPARTMENT_'+name+'_ACCEPTED']==='true'&&validProductId(productId));
    const permalink='pointless-'+slug,checkoutUrl='https://fridburg.gumroad.com/l/'+permalink;
    return {sku:site.sku,productId,permalink,enabled,checkoutUrl,checkoutEnabled:Boolean(enabled&&
      env['POINTLESS_DEPARTMENT_'+name+'_CHECKOUT_ENABLED']==='true'&&env['GUMROAD_DEPARTMENT_'+name+'_CHECKOUT_URL']===checkoutUrl)};
  });
  const products=[...(collectionEnabled?[{productId,permalink:PRODUCT_SLUG}]:[]),
    ...departmentProducts.filter(product=>product.enabled).map(({productId,permalink})=>({productId,permalink}))];
  return {enabled:collectionEnabled||departmentProducts.some(product=>product.enabled),collectionEnabled,
    removalEnabled:storageReady,store,productId,adminToken,products,departmentProducts};
}
function publicGiftConfig(env=process.env){
  const departments=departmentConfig(env),store=departments.removalEnabled?departments.store:null;
  const adminToken=departments.adminToken,ready=Boolean(env.POINTLESS_SELLER_ACCEPTED==='true'&&typeof adminToken==='string'&&adminToken.length>=32);
  const certificates=giftProducts.filter(product=>product.kind==='digital-certificate').flatMap(product=>{
    const suffix=product.sku.slice('certificate-'.length).toUpperCase().replaceAll('-','_');
    const productId=env['GUMROAD_CERTIFICATE_'+suffix+'_PRODUCT_ID'];
    return ready&&env['POINTLESS_CERTIFICATE_'+suffix+'_ACCEPTED']==='true'&&validProductId(productId)?[{productId,permalink:product.permalink}]:[];
  });
  const products=[...departments.products,...certificates];
  return {enabled:Boolean(store&&ready&&products.length&&env.POINTLESS_PUBLIC_GIFTS_ENABLED==='true'),store,adminToken,products};
}
module.exports={createLicenseVerifier,createDepartmentLicenseVerifier,createProductLicenseVerifier,departmentConfig,publicGiftConfig,credentialHash,validLicense,PaymentError};
