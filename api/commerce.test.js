'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
test('status does not advertise active checkout',async()=>{const c={};await require('./status')(c);assert.equal(c.res.status,200);assert.equal(c.res.body.checkoutEnabled,false);});
test('forged client payment data cannot open checkout',async()=>{const c={};await require('./checkout')(c,{body:{paid:true,license_id:'123',amount:9}});assert.equal(c.res.status,503);assert.equal(c.res.body.error,'checkout_not_open');assert.equal(c.res.headers['Cache-Control'],'no-store');});
