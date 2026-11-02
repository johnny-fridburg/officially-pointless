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

test('only the exact flag and canonical URL enable checkout', async () => {
  const enabled = { POINTLESS_CHECKOUT_ENABLED: 'true', GUMROAD_CHECKOUT_URL: checkoutUrl };
  await withCommerceEnv(enabled, async () => {
    const response = await callStatus();
    assert.equal(response.body.checkoutEnabled, true);
    assert.deepEqual(response.body.catalog, catalog);
    assert.equal(response.body.reason, undefined);
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

test('POST returns only the approved checkout destination and product metadata', async () => {
  await withCommerceEnv({ POINTLESS_CHECKOUT_ENABLED: 'true', GUMROAD_CHECKOUT_URL: checkoutUrl }, async () => {
    const response = await callCheckout({ sku: catalog.sku });
    assert.equal(response.status, 200);
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.deepEqual(response.body, {
      checkoutUrl,
      sku: 'unnecessary-promotions',
      priceUsd: 19,
      currency: 'USD',
      fulfillment: 'gumroad',
    });
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

test('both approved Origins may request the destination', async () => {
  await withCommerceEnv({ POINTLESS_CHECKOUT_ENABLED: 'true', GUMROAD_CHECKOUT_URL: checkoutUrl }, async () => {
    for (const origin of ['https://officiallypointless.com', 'https://www.officiallypointless.com']) {
      const response = await callCheckout({ sku: catalog.sku }, { headers: { origin } });
      assert.equal(response.status, 200, origin);
      assert.equal(response.body.checkoutUrl, checkoutUrl);
    }
  });
});
