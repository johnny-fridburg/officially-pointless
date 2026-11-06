'use strict';

const catalog = Object.freeze(require('./product.json'));
const {departmentConfig}=require('./department-access');
const {backendConfig}=require('./instance-proxy');
const {effectConfig,products:effectProducts}=require('./effects-proxy');
const departmentCatalog=Object.freeze({sku:'department-collection',priceUsd:19,currency:'USD',kind:'online-department-collection'});
const departmentUrl='https://fridburg.gumroad.com/l/department-collection';

const checkoutUrl = 'https://fridburg.gumroad.com/l/unnecessary-promotions';
const certificateSlugs=Object.freeze([
  'minister-of-unopened-tabs','secretary-of-one-more-coffee','director-of-unnecessary-meetings',
  'chief-of-the-snack-drawer','commissioner-of-replying-tomorrow',
]);
const certificateCatalog=Object.freeze(certificateSlugs.map(slug=>Object.freeze({
  sku:'certificate-'+slug,priceUsd:19,currency:'USD',kind:'digital-certificate',
})));

function getCommerceConfig(env = process.env) {
  const departments=departmentConfig(env),effects=effectConfig(env);
  return {
    catalog,
    // Original bundle buyers retain their downloads/access. New sales use
    // single-product SKUs even when old launch settings remain configured.
    checkoutEnabled: false,
    checkoutUrl,
    departmentCollection:{catalog:departmentCatalog,checkoutEnabled:false,checkoutUrl:departmentUrl},
    departmentProducts:effects.products.filter(p=>p.sku.startsWith('department-')).map(({sku,purchaseEnabled,checkoutUrl})=>({catalog:Object.freeze({sku,priceUsd:19,currency:'USD',kind:'online-department'}),checkoutEnabled:purchaseEnabled,checkoutUrl})),
    gameProducts:effects.products.filter(p=>p.sku.startsWith('game-')).map(({sku,purchaseEnabled,checkoutUrl})=>({catalog:Object.freeze({sku,priceUsd:19,currency:'USD',kind:'paid-game'}),checkoutEnabled:purchaseEnabled,checkoutUrl})),
    certificateProducts:certificateCatalog.map(catalog=>{
      const slug=catalog.sku.slice('certificate-'.length),name=slug.toUpperCase().replaceAll('-','_');
      const productId=env['GUMROAD_CERTIFICATE_'+name+'_PRODUCT_ID'];
      const checkoutUrl='https://fridburg.gumroad.com/l/pointless-'+slug;
      const checkoutEnabled=Boolean(backendConfig(env)&&env['POINTLESS_INSTANCE_'+name+'_ACCEPTED']==='true'&&env.POINTLESS_SELLER_ACCEPTED==='true'&&
        env['POINTLESS_CERTIFICATE_'+name+'_ACCEPTED']==='true'&&env['POINTLESS_CERT_'+name+'_CHECKOUT']==='true'&&
        typeof productId==='string'&&productId.length>0&&productId.length<=128&&!/[\s\x00-\x1f\x7f]/.test(productId)&&
        env['GUMROAD_CERT_'+name+'_CHECKOUT_URL']===checkoutUrl);
      return {catalog,checkoutEnabled,checkoutUrl};
    }),
  };
}

module.exports = { getCommerceConfig };
