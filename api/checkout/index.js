'use strict';

const { getCommerceConfig } = require('../catalog');
const {commerceRequest,commerceBody} = require('../commerce-origins');

module.exports = async function (context, req) {
  const policy = commerceRequest(req, 'POST');
  if (policy.status) { context.res = policy; return; }
  const respond = (status, body) => { context.res = {status, headers: policy.headers, body}; };

  const body = commerceBody(req);
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || typeof body.sku !== 'string') {
    respond(400, { error: 'invalid_request' });
    return;
  }

  const config=getCommerceConfig();
  const selected=[config,config.departmentCollection,...config.departmentProducts,...config.certificateProducts,...config.gameProducts].find(product=>product.catalog.sku===body.sku);
  if (!selected) {
    respond(404, { error: 'unknown_product' });
    return;
  }
  const {catalog,checkoutEnabled,checkoutUrl}=selected;
  if (!checkoutEnabled) {
    respond(503, { error: 'checkout_not_open' });
    return;
  }

  respond(200, {
    checkoutUrl,
    sku: catalog.sku,
    priceUsd: catalog.priceUsd,
    currency: catalog.currency,
    fulfillment: 'gumroad',
  });
};
