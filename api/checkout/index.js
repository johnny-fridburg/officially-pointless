'use strict';

const { getCommerceConfig } = require('../catalog');
const allowedOrigins = new Set([
  'https://officiallypointless.com',
  'https://www.officiallypointless.com',
]);
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

function respond(context, status, body) {
  context.res = { status, headers, body };
}

module.exports = async function (context, req) {
  if (req?.method !== 'POST') {
    respond(context, 405, { error: 'method_not_allowed' });
    return;
  }

  const origins = Object.entries(req.headers || {})
    .filter(([name]) => name.toLowerCase() === 'origin')
    .map(([, value]) => value);
  if (origins.length > 0 && (origins.length !== 1 || !allowedOrigins.has(origins[0]))) {
    respond(context, 403, { error: 'forbidden_origin' });
    return;
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || typeof body.sku !== 'string') {
    respond(context, 400, { error: 'invalid_request' });
    return;
  }

  const config=getCommerceConfig();
  const selected=body.sku===config.catalog.sku?config:body.sku===config.departmentCollection.catalog.sku?config.departmentCollection:null;
  if (!selected) {
    respond(context, 404, { error: 'unknown_product' });
    return;
  }
  const {catalog,checkoutEnabled,checkoutUrl}=selected;
  if (!checkoutEnabled) {
    respond(context, 503, { error: 'checkout_not_open' });
    return;
  }

  respond(context, 200, {
    checkoutUrl,
    sku: catalog.sku,
    priceUsd: catalog.priceUsd,
    currency: catalog.currency,
    fulfillment: 'gumroad',
  });
};
