'use strict';

const { getCommerceConfig } = require('../catalog');

module.exports = async function (context) {
  const { catalog, checkoutEnabled } = getCommerceConfig();
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: {
      service: 'officially-pointless',
      provider: 'gumroad',
      checkoutEnabled,
      catalog,
      ...(!checkoutEnabled && { reason: 'Checkout is not open.' }),
    },
  };
};
