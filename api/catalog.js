'use strict';

const catalog = Object.freeze({
  sku: 'unnecessary-promotions',
  priceUsd: 19,
  currency: 'USD',
  kind: 'digital-download',
});

const checkoutUrl = 'https://fridburg.gumroad.com/l/unnecessary-promotions';

function getCommerceConfig(env = process.env) {
  return {
    catalog,
    checkoutEnabled: env.POINTLESS_CHECKOUT_ENABLED === 'true' &&
      env.GUMROAD_CHECKOUT_URL === checkoutUrl,
    checkoutUrl,
  };
}

module.exports = { getCommerceConfig };
