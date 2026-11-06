'use strict';

const {PRODUCT_SITES} = require('./product-sites');
const origins = new Set([
  'https://officiallypointless.com', 'https://www.officiallypointless.com',
  ...PRODUCT_SITES.map(({host}) => 'https://' + host),
]);
const responseHeaders = {
  'Content-Type': 'application/json', 'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff', Vary: 'Origin',
};

function header(headers, name) {
  const entries = Object.entries(headers || {}).filter(([key]) => key.toLowerCase() === name);
  return {present: entries.length > 0, valid: entries.length <= 1,
    value: entries.length === 1 ? entries[0][1] : undefined};
}

function commerceRequest(req, method) {
  const headers = {...responseHeaders};
  const reject = (status, error) => ({status, headers, body: {error}});
  if (req?.method !== method && req?.method !== 'OPTIONS') return reject(405, 'method_not_allowed');
  const origin = header(req.headers, 'origin');
  if (!origin.valid || origin.present && !origins.has(origin.value)) return reject(403, 'forbidden_origin');
  if (origin.present) {
    headers['Access-Control-Allow-Origin'] = origin.value;
    headers['Access-Control-Allow-Methods'] = method + ', OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Accept';
  }
  if (req.method !== 'OPTIONS') return {headers};
  if (!origin.present) return reject(403, 'forbidden_origin');
  const requestedMethod = header(req.headers, 'access-control-request-method');
  const requestedHeaders = header(req.headers, 'access-control-request-headers');
  if (!requestedMethod.valid || requestedMethod.value !== method || !requestedHeaders.valid ||
      requestedHeaders.present && (typeof requestedHeaders.value !== 'string' ||
        requestedHeaders.value.split(',').some(name => !['content-type', 'accept'].includes(name.trim().toLowerCase())))) {
    return reject(403, 'forbidden_preflight');
  }
  return {status: 204, headers};
}

module.exports = {commerceRequest};
