'use strict';

const { getCommerceConfig } = require('../catalog');
const {commerceRequest} = require('../commerce-origins');

module.exports = async function (context, req = {method: 'GET'}) {
  const policy = commerceRequest(req, 'GET');
  if (policy.status) { context.res = policy; return; }
  const { catalog, checkoutEnabled, departmentCollection, departmentProducts, certificateProducts, gameProducts, honorProducts } = getCommerceConfig();
  context.res = {
    status: 200,
    headers: policy.headers,
    body: {
      service: 'officially-pointless',
      provider: 'gumroad',
      checkoutEnabled,
      catalog,
      departmentCollection:{catalog:departmentCollection.catalog,checkoutEnabled:departmentCollection.checkoutEnabled},
      departmentProducts:departmentProducts.map(({catalog,checkoutEnabled})=>({catalog,checkoutEnabled})),
      gameProducts:gameProducts.map(({catalog,checkoutEnabled})=>({catalog,checkoutEnabled})),
      honorProducts:honorProducts.map(({catalog,checkoutEnabled})=>({catalog,checkoutEnabled})),
      certificateProducts:certificateProducts.map(({catalog,checkoutEnabled})=>({catalog,checkoutEnabled})),
      ...(!checkoutEnabled && { reason: 'Legacy bundle purchases are closed.' }),
    },
  };
};
