'use strict';

// The current storefront grants no activity entitlements. Close the HTTP boundary
// before constructing storage or identity clients, including under legacy flags.
module.exports = async context => {
  context.res = {
    status: 503,
    headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
    body: {error: 'paid_access_not_open'}
  };
};
