'use strict';

const catalog = Object.freeze(require('./product.json'));
const {departmentConfig}=require('./department-access');
const departmentCatalog=Object.freeze({sku:'department-collection',priceUsd:19,currency:'USD',kind:'online-department-collection'});
const departmentUrl='https://fridburg.gumroad.com/l/department-collection';

const checkoutUrl = 'https://fridburg.gumroad.com/l/unnecessary-promotions';

function getCommerceConfig(env = process.env) {
  const departments=departmentConfig(env);
  const departmentCheckoutEnabled=Boolean(departments.enabled&&departments.adminToken?.length>=32&&env.POINTLESS_DEPARTMENT_CHECKOUT_ENABLED==='true'&&env.GUMROAD_DEPARTMENT_CHECKOUT_URL===departmentUrl);
  return {
    catalog,
    checkoutEnabled: env.POINTLESS_CHECKOUT_ENABLED === 'true' &&
      env.GUMROAD_CHECKOUT_URL === checkoutUrl,
    checkoutUrl,
    departmentCollection:{catalog:departmentCatalog,checkoutEnabled:departmentCheckoutEnabled,checkoutUrl:departmentUrl},
  };
}

module.exports = { getCommerceConfig };
