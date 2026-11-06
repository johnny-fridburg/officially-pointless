'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const status = require('./status');
const checkout = require('./checkout');

const checkoutUrl = 'https://fridburg.gumroad.com/l/unnecessary-promotions';
const catalog = {
  sku: 'unnecessary-promotions',
  priceUsd: 19,
  currency: 'USD',
  kind: 'digital-download',
};

async function withCommerceEnv(values, action) {
  const names = ['POINTLESS_CHECKOUT_ENABLED', 'GUMROAD_CHECKOUT_URL'];
  const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) {
    if (values[name] === undefined) delete process.env[name];
    else process.env[name] = values[name];
  }
  try {
    return await action();
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
}

async function callStatus() {
  const context = {};
  await status(context, { method: 'GET' });
  return context.res;
}

async function callStatusRequest(options) {
  const context = {};
  await status(context, options);
  return context.res;
}

async function callCheckout(body, options = {}) {
  const context = {};
  await checkout(context, {
    method: options.method || 'POST',
    headers: options.headers || {},
    body,
  });
  return context.res;
}

test('catalog is canonical and checkout is closed by default', async () => {
  await withCommerceEnv({}, async () => {
    const response = await callStatus();
    assert.equal(response.status, 200);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.deepEqual(response.body.catalog, catalog);
    assert.equal(response.body.service, 'officially-pointless');
    assert.equal(response.body.provider, 'gumroad');
    assert.equal(response.body.checkoutEnabled, false);
    assert.equal(typeof response.body.reason, 'string');
    assert.ok(response.body.reason.length > 0);
    assert.equal(response.body.checkoutUrl, undefined);
    const closed = await callCheckout({ sku: catalog.sku });
    assert.equal(closed.status, 503);
    assert.equal(closed.body.error, 'checkout_not_open');
    assert.equal(closed.headers['Cache-Control'], 'no-store');
  });
});

test('legacy gift-kit checkout stays closed even with its former launch settings', async () => {
  const enabled = { POINTLESS_CHECKOUT_ENABLED: 'true', GUMROAD_CHECKOUT_URL: checkoutUrl };
  await withCommerceEnv(enabled, async () => {
    const response = await callStatus();
    assert.equal(response.body.checkoutEnabled, false);
    assert.deepEqual(response.body.catalog, catalog);
    assert.equal(typeof response.body.reason, 'string');
    assert.equal(response.headers['Cache-Control'], 'no-store');
  });
});

test('missing and noncanonical checkout URLs keep the gate closed', async () => {
  for (const url of [undefined, '', 'https://evil.example/l/unnecessary-promotions',
    `${checkoutUrl}?paid=true`, `${checkoutUrl}#access`,
    'https://name:secret@fridburg.gumroad.com/l/unnecessary-promotions',
    'http://fridburg.gumroad.com/l/unnecessary-promotions']) {
    await withCommerceEnv({
      POINTLESS_CHECKOUT_ENABLED: 'true',
      GUMROAD_CHECKOUT_URL: url,
    }, async () => {
      assert.equal((await callStatus()).body.checkoutEnabled, false, String(url));
      assert.equal((await callCheckout({ sku: catalog.sku })).status, 503, String(url));
    });
  }
});

test('malformed enable flags keep the gate closed', async () => {
  for (const flag of [undefined, '', 'TRUE', 'true ', '1', 'false']) {
    await withCommerceEnv({
      POINTLESS_CHECKOUT_ENABLED: flag,
      GUMROAD_CHECKOUT_URL: checkoutUrl,
    }, async () => {
      assert.equal((await callStatus()).body.checkoutEnabled, false, String(flag));
      assert.equal((await callCheckout({ sku: catalog.sku })).status, 503, String(flag));
    });
  }
});

test('a legacy kit checkout request cannot sell the retired bundle', async () => {
  await withCommerceEnv({ POINTLESS_CHECKOUT_ENABLED: 'true', GUMROAD_CHECKOUT_URL: checkoutUrl }, async () => {
    const response = await callCheckout({ sku: catalog.sku });
    assert.equal(response.status, 503);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.deepEqual(response.body, {error: 'checkout_not_open'});
  });
});

test('extra client payment fields and prices are rejected', async () => {
  await withCommerceEnv({ POINTLESS_CHECKOUT_ENABLED: 'true', GUMROAD_CHECKOUT_URL: checkoutUrl }, async () => {
    for (const body of [
      { sku: catalog.sku, priceUsd: 1 },
      { sku: catalog.sku, paid: true },
      { sku: catalog.sku, license_id: 'forged' },
      { sku: catalog.sku, checkoutUrl: 'https://evil.example/' },
    ]) {
      const response = await callCheckout(body);
      assert.equal(response.status, 400);
      assert.equal(response.body.error, 'invalid_request');
      assert.equal(response.headers['Cache-Control'], 'no-store');
    }
  });
});

test('wrong method returns 405 even while checkout is closed', async () => {
  await withCommerceEnv({}, async () => {
    const response = await callCheckout({ sku: catalog.sku }, { method: 'GET' });
    assert.equal(response.status, 405);
    assert.equal(response.headers['Cache-Control'], 'no-store');
  });
});

test('unknown product returns 404', async () => {
  await withCommerceEnv({ POINTLESS_CHECKOUT_ENABLED: 'true', GUMROAD_CHECKOUT_URL: checkoutUrl }, async () => {
    const response = await callCheckout({ sku: 'different-product' });
    assert.equal(response.status, 404);
    assert.equal(response.body.error, 'unknown_product');
  });
});

test('non-object and malformed request bodies return 400', async () => {
  await withCommerceEnv({ POINTLESS_CHECKOUT_ENABLED: 'true', GUMROAD_CHECKOUT_URL: checkoutUrl }, async () => {
    for (const body of [undefined, null, '', '{"sku":', [], ['unnecessary-promotions'], {}, { sku: null }]) {
      const response = await callCheckout(body);
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.equal(response.body.error, 'invalid_request');
    }
  });
});

test('foreign or malformed Origin returns 403', async () => {
  await withCommerceEnv({ POINTLESS_CHECKOUT_ENABLED: 'true', GUMROAD_CHECKOUT_URL: checkoutUrl }, async () => {
    for (const origin of ['https://evil.example', 'null', 'http://officiallypointless.com',
      'https://officiallypointless.com.evil.example', 'https://officiallypointless.com/']) {
      const response = await callCheckout({ sku: catalog.sku }, { headers: { Origin: origin } });
      assert.equal(response.status, 403, origin);
      assert.equal(response.headers['Cache-Control'], 'no-store');
    }
  });
});

test('both approved Origins receive the retired kit purchase state', async () => {
  await withCommerceEnv({ POINTLESS_CHECKOUT_ENABLED: 'true', GUMROAD_CHECKOUT_URL: checkoutUrl }, async () => {
    for (const origin of ['https://officiallypointless.com', 'https://www.officiallypointless.com']) {
      const response = await callCheckout({ sku: catalog.sku }, { headers: { origin } });
      assert.equal(response.status, 503, origin);
      assert.equal(response.body.checkoutUrl, undefined);
    }
  });
});

const departmentUrl='https://fridburg.gumroad.com/l/department-collection';
const departmentCatalog={sku:'department-collection',priceUsd:19,currency:'USD',kind:'online-department-collection'};
const departmentEnv={POINTLESS_DEPARTMENT_CHECKOUT_ENABLED:'true',GUMROAD_DEPARTMENT_CHECKOUT_URL:departmentUrl,POINTLESS_DEPARTMENTS_ENABLED:'true',POINTLESS_DEPARTMENTS_ACCEPTED:'true',POINTLESS_SELLER_ACCEPTED:'true',GUMROAD_DEPARTMENT_PRODUCT_ID:'fixture-department-product',POINTLESS_DEPARTMENTS_BLOB_URL:'https://teststore.blob.core.windows.net/departments/state.json?sig=fixture',POINTLESS_DEPARTMENTS_ADMIN_TOKEN:'fixture-moderation-token-with-at-least-32-characters'};
async function withDepartmentEnv(values,action){const original=Object.fromEntries(Object.keys(departmentEnv).map(k=>[k,process.env[k]]));for(const k of Object.keys(departmentEnv)){if(values[k]===undefined)delete process.env[k];else process.env[k]=values[k];}try{return await action();}finally{for(const k of Object.keys(departmentEnv)){if(original[k]===undefined)delete process.env[k];else process.env[k]=original[k];}}}
test('department checkout is a distinct closed $19 collection, never the gift-kit product',async()=>{
 await withCommerceEnv({},()=>withDepartmentEnv({},async()=>{const status=await callStatus();assert.deepEqual(status.body.departmentCollection,{catalog:departmentCatalog,checkoutEnabled:false});const response=await callCheckout({sku:'department-collection'});assert.equal(response.status,503);assert.equal(response.body.error,'checkout_not_open');}));
});
test('legacy collection checkout stays closed even when all former acceptance settings are present',async()=>{
 await withCommerceEnv({},()=>withDepartmentEnv(departmentEnv,async()=>{const status=await callStatus();assert.equal(status.body.checkoutEnabled,false);assert.equal(status.body.departmentCollection.checkoutEnabled,false);const response=await callCheckout({sku:'department-collection'});assert.equal(response.status,503);assert.deepEqual(response.body,{error:'checkout_not_open'});assert.equal((await callCheckout({sku:'unnecessary-promotions'})).status,503);}));
});
test('missing acceptance, moderation, product or storage cannot sell a collection',async()=>{
 for(const key of Object.keys(departmentEnv))await withDepartmentEnv({...departmentEnv,[key]:undefined},async()=>{assert.equal((await callStatus()).body.departmentCollection.checkoutEnabled,false,key);assert.equal((await callCheckout({sku:'department-collection'})).status,503,key);});
 for(const url of [departmentUrl+'?paid=true','https://evil.invalid/l/department-collection'])await withDepartmentEnv({...departmentEnv,GUMROAD_DEPARTMENT_CHECKOUT_URL:url},async()=>{assert.equal((await callCheckout({sku:'department-collection'})).status,503);});
});
test('former launch settings cannot resell bundles or accept forged prices',async()=>{
 await withCommerceEnv({POINTLESS_CHECKOUT_ENABLED:'true',GUMROAD_CHECKOUT_URL:checkoutUrl},()=>withDepartmentEnv({},async()=>{assert.equal((await callCheckout({sku:'unnecessary-promotions'})).status,503);assert.equal((await callCheckout({sku:'department-collection'})).status,503);for(const extra of [{paid:true},{priceUsd:1},{checkoutUrl:departmentUrl}])assert.equal((await callCheckout({sku:'department-collection',...extra})).status,400);}));
});

const individualProducts = [
  ['make-it-worse', 'MAKE_IT_WORSE'], ['silence', 'SILENCE'],
  ['loading', 'LOADING'], ['last-word', 'LAST_WORD'], ['museum', 'MUSEUM'],
  ['golden-error', 'GOLDEN_ERROR'], ['button', 'BUTTON'], ['empty-wing', 'EMPTY_WING'],
  ['unnecessary-ribbon', 'UNNECESSARY_RIBBON'], ['invisible-monument', 'INVISIBLE_MONUMENT'],
];
const individualNames = individualProducts.flatMap(([, name]) => [
  `GUMROAD_DEPARTMENT_${name}_PRODUCT_ID`, `GUMROAD_DEPARTMENT_${name}_CHECKOUT_URL`,
  `POINTLESS_DEPARTMENT_${name}_ACCEPTED`, `POINTLESS_DEPARTMENT_${name}_CHECKOUT_ENABLED`,
]);
const certificates=[
  ['minister-of-unopened-tabs','MINISTER_OF_UNOPENED_TABS'],
  ['secretary-of-one-more-coffee','SECRETARY_OF_ONE_MORE_COFFEE'],
  ['director-of-unnecessary-meetings','DIRECTOR_OF_UNNECESSARY_MEETINGS'],
  ['chief-of-the-snack-drawer','CHIEF_OF_THE_SNACK_DRAWER'],
  ['commissioner-of-replying-tomorrow','COMMISSIONER_OF_REPLYING_TOMORROW'],
];
const certificateNames=certificates.flatMap(([,name])=>[
  `GUMROAD_CERTIFICATE_${name}_PRODUCT_ID`,`GUMROAD_CERT_${name}_CHECKOUT_URL`,
  `POINTLESS_CERTIFICATE_${name}_ACCEPTED`,`POINTLESS_CERT_${name}_CHECKOUT`,
  `POINTLESS_INSTANCE_${name}_ACCEPTED`,
]);
const instanceEnv={POINTLESS_INSTANCE_BACKEND_URL:'https://officially-pointless-instances.azurewebsites.net',POINTLESS_INSTANCE_BACKEND_KEY:'k'.repeat(64)};
const certificateEnv={POINTLESS_SELLER_ACCEPTED:'true',
  ...instanceEnv,POINTLESS_INSTANCE_MINISTER_OF_UNOPENED_TABS_ACCEPTED:'true',
  GUMROAD_CERTIFICATE_MINISTER_OF_UNOPENED_TABS_PRODUCT_ID:'fixture-certificate-product',
  GUMROAD_CERT_MINISTER_OF_UNOPENED_TABS_CHECKOUT_URL:'https://fridburg.gumroad.com/l/pointless-minister-of-unopened-tabs',
  POINTLESS_CERTIFICATE_MINISTER_OF_UNOPENED_TABS_ACCEPTED:'true',
  POINTLESS_CERT_MINISTER_OF_UNOPENED_TABS_CHECKOUT:'true',
};
const museumEnv = {
  ...departmentEnv,
  POINTLESS_DEPARTMENTS_ACCEPTED: undefined,
  GUMROAD_DEPARTMENT_PRODUCT_ID: undefined,
  POINTLESS_DEPARTMENT_CHECKOUT_ENABLED: undefined,
  GUMROAD_DEPARTMENT_CHECKOUT_URL: undefined,
  GUMROAD_DEPARTMENT_MUSEUM_PRODUCT_ID: 'fixture-museum-product',
  GUMROAD_DEPARTMENT_MUSEUM_CHECKOUT_URL: 'https://fridburg.gumroad.com/l/pointless-museum',
  POINTLESS_DEPARTMENT_MUSEUM_ACCEPTED: 'true',
  POINTLESS_DEPARTMENT_MUSEUM_CHECKOUT_ENABLED: 'true',
};
async function withProductEnv(values, action) {
  const names = [...new Set([...Object.keys(departmentEnv), ...individualNames, ...certificateNames,...Object.keys(instanceEnv)])];
  const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) {
    if (values[name] === undefined) delete process.env[name];
    else process.env[name] = values[name];
  }
  try { return await action(); }
  finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
}

test('status lists ten individually closed products without private verification settings', async () => {
  await withProductEnv({}, async () => {
    const result = await callStatus();
    assert.deepEqual(result.body.departmentProducts, individualProducts.map(([slug]) => ({
      catalog: {sku: `department-${slug}`, priceUsd: 19, currency: 'USD', kind: 'online-department'},
      checkoutEnabled: false,
    })));
    assert.equal(result.body.departmentProducts.some(product => product.checkoutUrl || product.productId), false);
  });
});

test('obsolete department acceptance never opens sales before a finished product exists', async () => {
  await withCommerceEnv({}, () => withProductEnv(museumEnv, async () => {
    const result = await callStatus();
    assert.equal(result.body.checkoutEnabled, false);
    assert.equal(result.body.departmentCollection.checkoutEnabled, false);
    assert.equal(result.body.departmentProducts?.filter(product => product.checkoutEnabled).length, 0);
    const opened = await callCheckout({sku: 'department-museum'});
    assert.equal(opened.status, 503);
    assert.deepEqual(opened.body, {error:'checkout_not_open'});
    assert.equal((await callCheckout({sku: 'department-silence'})).status, 503);
    assert.equal((await callCheckout({sku: 'department-collection'})).status, 503);
    for (const sku of ['department-unknown', 'department-museum?paid=true', 'department-collection/museum', '__proto__', 'constructor']) {
      assert.equal((await callCheckout({sku})).status, 404, sku);
    }
    for (const extra of [{paid: true}, {priceUsd: 1}, {checkoutUrl: departmentUrl}]) {
      assert.equal((await callCheckout({sku: 'department-museum', ...extra})).status, 400);
    }
    for (const privateValue of ['fixture-museum-product', 'fixture-moderation-token', 'sig=fixture']) {
      assert.equal(JSON.stringify(result.body).includes(privateValue), false);
    }
  }));
});

test('all departments remain closed even with individually accepted legacy provider settings', async () => {
  for (const [slug, name] of individualProducts) {
    const destination = `https://fridburg.gumroad.com/l/pointless-${slug}`;
    const env = {...museumEnv,
      POINTLESS_DEPARTMENT_MUSEUM_ACCEPTED: undefined,
      [`GUMROAD_DEPARTMENT_${name}_PRODUCT_ID`]: `fixture-${slug}-product`,
      [`GUMROAD_DEPARTMENT_${name}_CHECKOUT_URL`]: destination,
      [`POINTLESS_DEPARTMENT_${name}_ACCEPTED`]: 'true',
      [`POINTLESS_DEPARTMENT_${name}_CHECKOUT_ENABLED`]: 'true',
    };
    await withProductEnv(env, async () => {
      const opened = await callCheckout({sku: `department-${slug}`});
      assert.equal(opened.status, 503, slug);
      assert.equal(opened.body.error, 'checkout_not_open');
    });
  }
});

test('individual sales require their own acceptance, provider, destination and operator readiness', async () => {
  const required = [
    'POINTLESS_DEPARTMENTS_ENABLED', 'POINTLESS_SELLER_ACCEPTED',
    'POINTLESS_DEPARTMENTS_BLOB_URL', 'POINTLESS_DEPARTMENTS_ADMIN_TOKEN',
    'GUMROAD_DEPARTMENT_MUSEUM_PRODUCT_ID', 'GUMROAD_DEPARTMENT_MUSEUM_CHECKOUT_URL',
    'POINTLESS_DEPARTMENT_MUSEUM_ACCEPTED', 'POINTLESS_DEPARTMENT_MUSEUM_CHECKOUT_ENABLED',
  ];
  for (const name of required) {
    await withProductEnv({...museumEnv, [name]: undefined}, async () => {
      const response = await callCheckout({sku: 'department-museum'});
      assert.equal(response.status, 503, name);
      assert.equal(response.body.error, 'checkout_not_open');
    });
  }
  for (const url of [
    departmentUrl, 'https://fridburg.gumroad.com/l/pointless-museum?paid=true',
    'https://fridburg.gumroad.com/l/pointless-museum#access',
    'https://fridburg.gumroad.com.evil.invalid/l/pointless-museum',
    'https://fridburg.gumroad.com@evil.invalid/l/pointless-museum',
    'https://fridburg.gumroad.com:443/l/pointless-museum',
  ]) {
    await withProductEnv({...museumEnv, GUMROAD_DEPARTMENT_MUSEUM_CHECKOUT_URL: url}, async () => {
      assert.equal((await callCheckout({sku: 'department-museum'})).status, 503, url);
    });
  }
});

test('the exact eleven product origins can read status and preflight central checkout', async () => {
  const origins = ['https://promotions.officiallypointless.com', ...individualProducts.map(([slug]) => `https://${slug}.officiallypointless.com`)];
  await withCommerceEnv({}, () => withProductEnv({}, async () => {
    for (const origin of origins) {
      const result = await callStatusRequest({method: 'GET', headers: {Origin: origin}});
      assert.equal(result.status, 200, origin);
      assert.equal(result.headers['Access-Control-Allow-Origin'], origin);
      assert.equal(result.headers.Vary, 'Origin');
      const preflight = await callCheckout(undefined, {method: 'OPTIONS', headers: {
        origin, 'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type, accept',
      }});
      assert.equal(preflight.status, 204, origin);
      assert.equal(preflight.headers['Access-Control-Allow-Origin'], origin);
      assert.match(preflight.headers['Access-Control-Allow-Methods'], /POST/);
      assert.match(preflight.headers['Access-Control-Allow-Headers'], /Content-Type/i);
      assert.equal(preflight.headers['Access-Control-Allow-Credentials'], undefined);
      const closed = await callCheckout({sku: 'unnecessary-promotions'}, {headers: {origin}});
      assert.equal(closed.status, 503);
      assert.equal(closed.headers['Access-Control-Allow-Origin'], origin);
    }
  }));
});

test('lookalike, arbitrary and malformed product origins receive no commerce CORS', async () => {
  for (const origin of [
    'https://museum.officiallypointless.com.evil.invalid', 'https://unknown.officiallypointless.com',
    'https://www.museum.officiallypointless.com', 'https://museum.officiallypointless.com:443',
    'https://museum.officiallypointless.com/', 'http://museum.officiallypointless.com', 'null',
  ]) {
    const result = await callStatusRequest({method: 'GET', headers: {origin}});
    assert.equal(result.status, 403, origin);
    assert.equal(result.headers['Access-Control-Allow-Origin'], undefined);
    const preflight = await callCheckout(undefined, {method: 'OPTIONS', headers: {origin, 'access-control-request-method': 'POST'}});
    assert.equal(preflight.status, 403, origin);
    assert.equal(preflight.headers['Access-Control-Allow-Origin'], undefined);
  }
  const duplicated = await callCheckout({sku: 'unnecessary-promotions'}, {headers: {
    Origin: 'https://museum.officiallypointless.com', origin: 'https://museum.officiallypointless.com',
  }});
  assert.equal(duplicated.status, 403);
  assert.equal(duplicated.headers['Access-Control-Allow-Origin'], undefined);
});

test('commerce preflight rejects missing origins and non-commerce methods or headers', async () => {
  for (const headers of [
    {'access-control-request-method': 'POST'},
    {origin: 'https://museum.officiallypointless.com', 'access-control-request-method': 'DELETE'},
    {origin: 'https://museum.officiallypointless.com', 'access-control-request-method': 'POST', 'access-control-request-headers': 'X-Pointless-License'},
  ]) {
    assert.equal((await callCheckout(undefined, {method: 'OPTIONS', headers})).status, 403);
  }
  const result = await callStatusRequest({method: 'OPTIONS', headers: {
    origin: 'https://museum.officiallypointless.com', 'access-control-request-method': 'GET',
  }});
  assert.equal(result.status, 204);
  assert.equal(result.headers['Access-Control-Allow-Origin'], 'https://museum.officiallypointless.com');
});

test('status exposes five separately priced certificates with purchases closed by default',async()=>{
  await withProductEnv({},async()=>{
    const result=await callStatus();
    assert.deepEqual(result.body.certificateProducts,certificates.map(([slug])=>({
      catalog:{sku:'certificate-'+slug,priceUsd:19,currency:'USD',kind:'digital-certificate'},checkoutEnabled:false,
    })));
  });
});

test('browser-safe text checkout payload still uses only the fixed SKU and closed server gates',async()=>{
 await withProductEnv({},async()=>{
  const response=await callCheckout(JSON.stringify({sku:'certificate-minister-of-unopened-tabs'}),{headers:{origin:'https://promotions.officiallypointless.com','content-type':'text/plain;charset=UTF-8'}});
  assert.equal(response.status,503);assert.equal(response.body.error,'checkout_not_open');
  assert.equal((await callCheckout(JSON.stringify({sku:'certificate-minister-of-unopened-tabs',paid:true}),{headers:{origin:'https://promotions.officiallypointless.com','content-type':'text/plain'}})).status,400);
 });
});

test('accepted certificate checkout returns only the selected single-title product',async()=>{
  await withProductEnv(certificateEnv,async()=>{
    const response=await callCheckout({sku:'certificate-minister-of-unopened-tabs'},{headers:{origin:'https://promotions.officiallypointless.com'}});
    assert.equal(response.status,200);
    assert.deepEqual(response.body,{
      checkoutUrl:'https://fridburg.gumroad.com/l/pointless-minister-of-unopened-tabs',
      sku:'certificate-minister-of-unopened-tabs',priceUsd:19,currency:'USD',fulfillment:'gumroad',
    });
    assert.equal(response.headers['Access-Control-Allow-Origin'],'https://promotions.officiallypointless.com');
    assert.equal((await callCheckout({sku:'certificate-secretary-of-one-more-coffee'})).status,503);
    assert.equal((await callCheckout({sku:'certificate-arbitrary-title'})).status,404);
    const result=await callStatus();
    assert.equal(result.body.certificateProducts?.filter(product=>product.checkoutEnabled).length,1);
    assert.equal(result.body.checkoutEnabled,false);
    assert.equal(result.body.departmentCollection.checkoutEnabled,false);
    assert(!JSON.stringify(result.body).includes('fixture-certificate-product'));
  });
});

test('each certificate checkout requires its exact accepted product, seller and provider destination',async()=>{
  for(const [slug,name]of certificates){
    const env={POINTLESS_SELLER_ACCEPTED:'true',...instanceEnv,
      [`POINTLESS_INSTANCE_${name}_ACCEPTED`]:'true',
      [`GUMROAD_CERTIFICATE_${name}_PRODUCT_ID`]:'fixture-'+slug,
      [`GUMROAD_CERT_${name}_CHECKOUT_URL`]:'https://fridburg.gumroad.com/l/pointless-'+slug,
      [`POINTLESS_CERTIFICATE_${name}_ACCEPTED`]:'true',
      [`POINTLESS_CERT_${name}_CHECKOUT`]:'true',
    };
    for(const setting of Object.keys(env))assert.ok(setting.length<=64,'Azure app setting exceeds its 64-character limit: '+setting);
    await withProductEnv(env,async()=>{
      const response=await callCheckout({sku:'certificate-'+slug});
      assert.equal(response.status,200,slug);
      assert.equal(response.body.checkoutUrl,'https://fridburg.gumroad.com/l/pointless-'+slug);
    });
    for(const setting of Object.keys(env))await withProductEnv({...env,[setting]:undefined},async()=>{
      const result=await callCheckout({sku:'certificate-'+slug});
      assert.equal(result.status,503,setting);
      assert.equal(result.body.error,'checkout_not_open');
    });
    for(const destination of [checkoutUrl,departmentUrl,env[`GUMROAD_CERT_${name}_CHECKOUT_URL`]+'?paid=true','https://fridburg.gumroad.com.evil.invalid/l/pointless-'+slug]) {
      await withProductEnv({...env,[`GUMROAD_CERT_${name}_CHECKOUT_URL`]:destination},async()=>{
        assert.equal((await callCheckout({sku:'certificate-'+slug})).status,503);
      });
    }
  }
});
