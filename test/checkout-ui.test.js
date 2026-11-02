'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

let checkout = {};
try {
  checkout = require('../site/assets/checkout.js');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

test('ready status enables the single $19 digital kit', () => {
  assert.deepEqual(checkout.statusPresentation({
    service: 'officially-pointless',
    provider: 'gumroad',
    checkoutEnabled: true,
    catalog: {
      sku: 'unnecessary-promotions',
      priceUsd: 19,
      currency: 'USD',
      kind: 'digital-download'
    }
  }), {
    state: 'ready',
    disabled: false,
    buttonLabel: 'Continue to $19 checkout',
    message: 'Gumroad handles payment and digital delivery.'
  });
});

test('closed checkout remains disabled and says no charge was made', () => {
  assert.deepEqual(checkout.statusPresentation({
    service: 'officially-pointless',
    provider: 'gumroad',
    checkoutEnabled: false,
    reason: 'Seller setup is incomplete.',
    catalog: {
      sku: 'unnecessary-promotions',
      priceUsd: 19,
      currency: 'USD',
      kind: 'digital-download'
    }
  }), {
    state: 'closed',
    disabled: true,
    buttonLabel: 'Checkout is not open yet',
    message: 'Orders are not open. You have not been charged.'
  });
});

test('malformed or unavailable status presents an error and disables checkout', () => {
  for (const status of [null, {}, {checkoutEnabled: true}, {
    checkoutEnabled: true,
    catalog: {sku: 'unnecessary-promotions', priceUsd: 9, currency: 'USD', kind: 'digital-download'}
  }]) {
    const presentation = checkout.statusPresentation(status);
    assert.equal(presentation.state, 'error');
    assert.equal(presentation.disabled, true);
    assert.match(presentation.message, /not been charged/);
  }
});

test('checkout destination requires the exact canonical response', () => {
  const approved = {
    checkoutUrl: 'https://fridburg.gumroad.com/l/unnecessary-promotions',
    sku: 'unnecessary-promotions',
    priceUsd: 19,
    currency: 'USD',
    fulfillment: 'gumroad'
  };
  assert.equal(checkout.approvedCheckoutUrl(approved), approved.checkoutUrl);
  for (const response of [
    null,
    {...approved, checkoutUrl: 'https://evil.example/l/unnecessary-promotions'},
    {...approved, checkoutUrl: approved.checkoutUrl + '?paid=true'},
    {...approved, checkoutUrl: 'https://fridburg.gumroad.com@evil.example/l/unnecessary-promotions'},
    {...approved, priceUsd: 9},
    {...approved, fulfillment: 'browser'},
    {...approved, injected: true}
  ]) {
    assert.equal(checkout.approvedCheckoutUrl(response), null);
  }
});

function fakePage() {
  const button = {
    disabled: true,
    textContent: '',
    listeners: {},
    addEventListener(type, handler) { this.listeners[type] = handler; },
    click() { return this.disabled ? undefined : this.listeners.click(); }
  };
  const status = {textContent: ''};
  return {
    button,
    status,
    document: {
      getElementById(id) {
        return {'checkout-button': button, 'checkout-status': status}[id] || null;
      }
    }
  };
}

const readyStatus = {
  service: 'officially-pointless',
  provider: 'gumroad',
  checkoutEnabled: true,
  catalog: {
    sku: 'unnecessary-promotions',
    priceUsd: 19,
    currency: 'USD',
    kind: 'digital-download'
  }
};
const validCheckout = {
  checkoutUrl: 'https://fridburg.gumroad.com/l/unnecessary-promotions',
  sku: 'unnecessary-promotions',
  priceUsd: 19,
  currency: 'USD',
  fulfillment: 'gumroad'
};

test('ready checkout sends only the fixed SKU and navigates to the canonical URL', async () => {
  const page = fakePage();
  const requests = [];
  const navigations = [];
  async function fetch(url, options) {
    requests.push({url, options});
    return {ok: true, json: async () => requests.length === 1 ? readyStatus : validCheckout};
  }
  await checkout.mountCheckout({document: page.document, fetch, navigate: url => navigations.push(url)});
  assert.equal(page.button.disabled, false);
  await page.button.click();
  assert.deepEqual(navigations, [validCheckout.checkoutUrl]);
  assert.deepEqual(requests.map(x => x.url), ['/api/billing/status', '/api/billing/checkout']);
  assert.deepEqual(JSON.parse(requests[1].options.body), {sku: 'unnecessary-promotions'});
  assert.equal(requests[1].options.method, 'POST');
  assert.equal(requests[1].options.credentials, 'omit');
});

test('closed status never sends a checkout request', async () => {
  const page = fakePage();
  let calls = 0;
  await checkout.mountCheckout({
    document: page.document,
    fetch: async () => {
      calls++;
      return {ok: true, json: async () => ({...readyStatus, checkoutEnabled: false})};
    },
    navigate: () => assert.fail('closed checkout navigated')
  });
  assert.equal(page.button.disabled, true);
  assert.match(page.status.textContent, /not been charged/);
  await page.button.click();
  assert.equal(calls, 1);
});

test('malformed redirect response disables the button without navigation', async () => {
  const page = fakePage();
  let calls = 0;
  await checkout.mountCheckout({
    document: page.document,
    fetch: async () => ({
      ok: true,
      json: async () => ++calls === 1 ? readyStatus : {
        ...validCheckout,
        checkoutUrl: 'https://evil.example/checkout'
      }
    }),
    navigate: () => assert.fail('unapproved checkout navigated')
  });
  await page.button.click();
  assert.equal(page.button.disabled, true);
  assert.match(page.status.textContent, /not been charged/);
});

test('status request failure leaves checkout unavailable', async () => {
  const page = fakePage();
  await checkout.mountCheckout({
    document: page.document,
    fetch: async () => { throw new Error('offline'); },
    navigate: () => assert.fail('offline checkout navigated')
  });
  assert.equal(page.button.disabled, true);
  assert.match(page.status.textContent, /not been charged/);
});

test('recognized title slugs map to the five local preview choices only', () => {
  const slugs = [
    'minister-of-unopened-tabs',
    'secretary-of-one-more-coffee',
    'director-of-unnecessary-meetings',
    'chief-of-the-snack-drawer',
    'commissioner-of-replying-tomorrow'
  ];
  for (const [index, slug] of slugs.entries()) {
    assert.equal(checkout.titleIndexForSlug(slug), index);
    assert.equal(checkout.titleSlugForIndex(String(index)), slug);
  }
  assert.equal(checkout.titleIndexForSlug('https://evil.example'), null);
  assert.equal(checkout.titleIndexForSlug('minister-of-unopened-tabs?name=Alex'), null);
  assert.equal(checkout.titleSlugForIndex('5'), null);
});

test('gift-kit selection sends only a recognized slug to the free preview', () => {
  const select = {
    value: 'minister-of-unopened-tabs',
    listeners: {},
    addEventListener(type, handler) { this.listeners[type] = handler; }
  };
  const preview = {href: ''};
  const document = {
    getElementById(id) {
      return {'gift-title': select, 'gift-title-preview': preview}[id] || null;
    }
  };
  checkout.mountTitleSelection({document, search: '?title=chief-of-the-snack-drawer&name=Alex'});
  assert.equal(select.value, 'chief-of-the-snack-drawer');
  assert.equal(preview.href, '/ministry-title-gift/?title=chief-of-the-snack-drawer');
  select.value = 'secretary-of-one-more-coffee';
  select.listeners.change();
  assert.equal(preview.href, '/ministry-title-gift/?title=secretary-of-one-more-coffee');
});

test('title preview preselects its title and carries only that title to the kit page', () => {
  const select = {
    value: '0',
    listeners: {},
    events: [],
    addEventListener(type, handler) { this.listeners[type] = handler; },
    dispatchEvent(event) { this.events.push(event.type); }
  };
  const kit = {href: ''};
  const document = {
    getElementById(id) {
      return {title: select, 'gift-kit-title-link': kit}[id] || null;
    }
  };
  checkout.mountTitleSelection({
    document,
    search: '?title=commissioner-of-replying-tomorrow&from=private',
    Event: class Event { constructor(type) { this.type = type; } }
  });
  assert.equal(select.value, '4');
  assert.deepEqual(select.events, ['change']);
  assert.equal(kit.href, '/gift-kit/?title=commissioner-of-replying-tomorrow');
  select.value = '2';
  select.listeners.change();
  assert.equal(kit.href, '/gift-kit/?title=director-of-unnecessary-meetings');
});
