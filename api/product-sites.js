'use strict';

const departments = require('./departments.json');

const PRODUCT_SITES = Object.freeze([
  Object.freeze({sku: 'unnecessary-promotions', host: 'promotions.officiallypointless.com', path: '/gift-kit/'}),
  ...departments.map(({slug}) => Object.freeze({
    sku: 'department-' + slug,
    host: slug + '.officiallypointless.com',
    path: '/departments/' + slug + '/',
  })),
]);

module.exports = {PRODUCT_SITES};
