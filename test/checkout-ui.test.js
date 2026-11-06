'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, existsSync} = require('node:fs');
const {join} = require('node:path');
const certificateSku='certificate-minister-of-unopened-tabs';

let checkout = {};
try {
  checkout = require(existsSync(join(__dirname, '..', 'checkout.js')) ? '../checkout.js' : '../site/assets/checkout.js');
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error;
}

test('ready status enables one separately purchased $19 certificate', () => {
  assert.deepEqual(checkout.statusPresentation(readyStatus,certificateSku), {
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
  const approved = validCheckout;
  assert.equal(checkout.approvedCheckoutUrl(approved,certificateSku), approved.checkoutUrl);
  for (const response of [
    null,
    {...approved, checkoutUrl: 'https://evil.example/l/unnecessary-promotions'},
    {...approved, checkoutUrl: approved.checkoutUrl + '?paid=true'},
    {...approved, checkoutUrl: 'https://fridburg.gumroad.com@evil.example/l/unnecessary-promotions'},
    {...approved, priceUsd: 9},
    {...approved, fulfillment: 'browser'},
    {...approved, injected: true}
  ]) {
    assert.equal(checkout.approvedCheckoutUrl(response,certificateSku), null);
  }
});

function fakePage() {
  const button = {
    disabled: true,
    textContent: '',
    listeners: {},
    getAttribute(name) { return name==='data-checkout-sku'?certificateSku:null; },
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
  checkoutEnabled: false,
  catalog: {
    sku: 'unnecessary-promotions',
    priceUsd: 19,
    currency: 'USD',
    kind: 'digital-download'
  },
  certificateProducts:[{catalog:{sku:certificateSku,priceUsd:19,currency:'USD',kind:'digital-certificate'},checkoutEnabled:true}],
};
const closedCertificateStatus={...readyStatus,certificateProducts:[{...readyStatus.certificateProducts[0],checkoutEnabled:false}]};
const validCheckout = {
  checkoutUrl: 'https://fridburg.gumroad.com/l/pointless-minister-of-unopened-tabs',
  sku: certificateSku,
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
  await checkout.mountCheckout({document: page.document, fetch, navigate: url => navigations.push(url),sku:certificateSku});
  assert.equal(page.button.disabled, false);
  await page.button.click();
  assert.deepEqual(navigations, [validCheckout.checkoutUrl]);
  assert.deepEqual(requests.map(x => x.url), ['/api/billing/status', '/api/billing/checkout']);
  assert.deepEqual(JSON.parse(requests[1].options.body), {sku: certificateSku});
  assert.equal(requests[1].options.method, 'POST');
  assert.equal(requests[1].options.credentials, 'omit');
});

test('closed status never sends a checkout request', async () => {
  const page = fakePage();
  let calls = 0;
  await checkout.mountCheckout({
    sku:certificateSku,
    document: page.document,
    fetch: async () => {
      calls++;
      return {ok: true, json: async () => closedCertificateStatus};
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
    sku:certificateSku,
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
    sku:certificateSku,
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

test('certificate selection sends only a recognized slug to its individual product page', () => {
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
  assert.equal(preview.href, '/certificates/chief-of-the-snack-drawer/');
  select.value = 'secretary-of-one-more-coffee';
  select.listeners.change();
  assert.equal(preview.href, '/certificates/secretary-of-one-more-coffee/');
});

test('title selection carries only the selected title to its individual certificate page', () => {
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
  assert.equal(kit.href, '/certificates/commissioner-of-replying-tomorrow/');
  select.value = '2';
  select.listeners.change();
  assert.equal(kit.href, '/certificates/director-of-unnecessary-meetings/');
});

test('embedded title checkout opens the validated destination in the top-level context', async () => {
  const page = fakePage();
  const topNavigations = [];
  const frameNavigations = [];
  const frame = {
    document: page.document,
    location: {
      search: '',
      assign: url => frameNavigations.push(url)
    },
    top: {location: {assign: url => topNavigations.push(url)}},
    Event,
    fetch: async url => ({
      ok: true,
      json: async () => url.endsWith('/status') ? readyStatus : validCheckout
    })
  };
  await checkout.mountBrowser(frame);
  await page.button.click();
  assert.deepEqual(topNavigations, [validCheckout.checkoutUrl]);
  assert.deepEqual(frameNavigations, []);
});

test('blocked top-level navigation fails closed without falling back to the frame', async () => {
  const page = fakePage();
  const frame = {
    document: page.document,
    location: {
      search: '',
      assign: () => assert.fail('checkout navigated the frame')
    },
    top: {location: {assign: () => { throw new Error('blocked top navigation'); }}},
    Event,
    fetch: async url => ({
      ok: true,
      json: async () => url.endsWith('/status') ? readyStatus : validCheckout
    })
  };
  await checkout.mountBrowser(frame);
  await page.button.click();
  assert.equal(page.button.disabled, true);
  assert.match(page.status.textContent, /not been charged/);
});

test('sales page reports enabled checkout from the server status', async () => {
  const availability = {textContent: ''};
  const document = {
    getElementById: id => id === 'checkout-availability' ? availability : null
  };
  await checkout.mountCheckout({
    sku:certificateSku,
    document,
    fetch: async () => ({ok: true, json: async () => readyStatus}),
    navigate: () => assert.fail('status-only page navigated')
  });
  assert.match(availability.textContent, /\$19/);
  assert.match(availability.textContent, /available through Gumroad/);
});

test('sales page reports closed and unavailable status without claiming a sale', async () => {
  for (const [fetch, expected] of [
    [async () => ({ok: true, json: async () => closedCertificateStatus}), /Purchases are not open/],
    [async () => { throw new Error('offline'); }, /could not be checked/]
  ]) {
    const availability = {textContent: ''};
    await checkout.mountCheckout({
      sku:certificateSku,
      document: {getElementById: id => id === 'checkout-availability' ? availability : null},
      fetch,
      navigate: () => assert.fail('status-only page navigated')
    });
    assert.match(availability.textContent, expected);
  }
});

test('storefront defaults to closed purchases and gives no payment entitlement', () => {
  for (const page of ['index.html', 'gift-kit/index.html', 'ministry-title-gift/index.html', 'sales-status/index.html']) {
    const html = readFileSync(join(__dirname, '..', 'site', page), 'utf8');
    assert.doesNotMatch(html, /<(?:input|canvas|iframe)\b/i, page);
    assert.doesNotMatch(html, /personalize (?:this title )?for free|free preview/i, page);
  }
  for (const slug of ['minister-of-unopened-tabs','secretary-of-one-more-coffee','director-of-unnecessary-meetings','chief-of-the-snack-drawer','commissioner-of-replying-tomorrow']) {
    const html = readFileSync(join(__dirname, '..', 'site/certificates', slug, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /<(?:input|textarea|canvas|iframe)\b/i, slug);
    assert.match(html, /<button(?=[^>]*id="checkout-button")(?=[^>]*\bdisabled\b)[^>]*>/, slug);
    assert.match(html, new RegExp('data-checkout-sku="certificate-' + slug + '"'), slug);
  }
  const sales = readFileSync(join(__dirname, '..', 'site/sales-status/index.html'), 'utf8');
  assert.match(sales, /href="\/gift-kit\/"/);
  assert.match(sales, /href="\/departments\/"/);
  assert.doesNotMatch(sales, /id="(?:department-)?checkout-(?:button|availability)"/);
});

const departmentSku='department-collection';
const departmentResponse={checkoutUrl:'https://fridburg.gumroad.com/l/department-collection',sku:departmentSku,priceUsd:19,currency:'USD',fulfillment:'gumroad'};
test('retired collection checkout cannot be enabled by a legacy server response',()=>{
 const collection={catalog:{sku:departmentSku,priceUsd:19,currency:'USD',kind:'online-department-collection'},checkoutEnabled:true};
 const status={service:'officially-pointless',provider:'gumroad',checkoutEnabled:false,catalog:{sku:'unnecessary-promotions',priceUsd:19,currency:'USD',kind:'digital-download'},departmentCollection:collection};
 assert.equal(checkout.statusPresentation(status,departmentSku).disabled,true);
 assert.equal(checkout.statusPresentation({...status,departmentCollection:{...collection,checkoutEnabled:false}},departmentSku).disabled,true);
 assert.equal(checkout.statusPresentation({...status,departmentCollection:undefined},departmentSku).disabled,true);
 assert.equal(checkout.approvedCheckoutUrl(departmentResponse,departmentSku),null);
 assert.equal(checkout.approvedCheckoutUrl(departmentResponse,'unnecessary-promotions'),null);
 assert.equal(checkout.approvedCheckoutUrl({...departmentResponse,checkoutUrl:'https://evil.invalid/'},departmentSku),null);
});

test('retired five-title kit cannot be sold through an enabled legacy status or response',()=>{
  const status={...readyStatus,checkoutEnabled:true};
  assert.equal(checkout.statusPresentation(status,'unnecessary-promotions').state,'closed');
  assert.equal(checkout.approvedCheckoutUrl({sku:'unnecessary-promotions',checkoutUrl:'https://fridburg.gumroad.com/l/unnecessary-promotions',priceUsd:19,currency:'USD',fulfillment:'gumroad'},'unnecessary-promotions'),null);
});

test('every certificate validates only its own fixed single-product destination',()=>{
  for(const slug of ['minister-of-unopened-tabs','secretary-of-one-more-coffee','director-of-unnecessary-meetings','chief-of-the-snack-drawer','commissioner-of-replying-tomorrow']) {
    const sku='certificate-'+slug;
    const status={...readyStatus,certificateProducts:[{catalog:{sku,priceUsd:19,currency:'USD',kind:'digital-certificate'},checkoutEnabled:true}]};
    const response={sku,checkoutUrl:'https://fridburg.gumroad.com/l/pointless-'+slug,priceUsd:19,currency:'USD',fulfillment:'gumroad'};
    assert.equal(checkout.statusPresentation(status,sku).disabled,false,slug);
    assert.equal(checkout.approvedCheckoutUrl(response,sku),response.checkoutUrl);
    assert.equal(checkout.approvedCheckoutUrl({...response,checkoutUrl:response.checkoutUrl+'?paid=true'},sku),null);
  }
  assert.equal(checkout.statusPresentation(readyStatus,'certificate-unknown').state,'error');
});

const museumSku='department-museum';
const museumStatus={...readyStatus,checkoutEnabled:false,departmentProducts:[{
  catalog:{sku:museumSku,priceUsd:19,currency:'USD',kind:'online-department'},checkoutEnabled:true,
}]};
const museumCheckout={checkoutUrl:'https://fridburg.gumroad.com/l/pointless-museum',sku:museumSku,priceUsd:19,currency:'USD',fulfillment:'gumroad'};

test('individual checkout uses its own status and exact provider URL',()=>{
  assert.equal(checkout.statusPresentation(museumStatus,museumSku).state,'ready');
  assert.equal(checkout.approvedCheckoutUrl(museumCheckout,museumSku),museumCheckout.checkoutUrl);
  for(const response of [
    {...museumCheckout,checkoutUrl:'https://fridburg.gumroad.com/l/department-collection'},
    {...museumCheckout,checkoutUrl:'https://fridburg.gumroad.com/l/pointless-silence'},
    {...museumCheckout,checkoutUrl: museumCheckout.checkoutUrl+'?paid=true'},
    {...museumCheckout,sku:'department-silence'},
  ])assert.equal(checkout.approvedCheckoutUrl(response,museumSku),null);
  assert.equal(checkout.statusPresentation(museumStatus,'department-silence').state,'error');
  assert.equal(checkout.approvedCheckoutUrl(museumCheckout,'department-unknown'),null);
});

test('missing, malformed and duplicated individual status entries cannot advertise availability',()=>{
  const selected=museumStatus.departmentProducts[0];
  for(const departmentProducts of [undefined,[],[selected,selected],[{...selected,checkoutEnabled:'true'}],[{...selected,catalog:{...selected.catalog,priceUsd:1}}]]) {
    assert.equal(checkout.statusPresentation({...museumStatus,departmentProducts},museumSku).state,'error');
  }
  assert.equal(checkout.statusPresentation({...museumStatus,departmentProducts:[{...selected,checkoutEnabled:false}]},museumSku).state,'closed');
});

test('all exact product hosts use the central commerce API and their authored SKU marker',async()=>{
  const fixtures=[
    ['promotions',certificateSku,readyStatus,validCheckout],
    ['museum',museumSku,museumStatus,museumCheckout],
    ['silence','department-silence',{...museumStatus,departmentProducts:[{catalog:{sku:'department-silence',priceUsd:19,currency:'USD',kind:'online-department'},checkoutEnabled:true}]},{...museumCheckout,sku:'department-silence',checkoutUrl:'https://fridburg.gumroad.com/l/pointless-silence'}],
  ];
  for(const [host,sku,status,response] of fixtures) {
    const page=fakePage(),requests=[],navigations=[];
    page.button.getAttribute=name=>name==='data-checkout-sku'?sku:null;
    await checkout.mountBrowser({document:page.document,location:{search:'',origin:`https://${host}.officiallypointless.com`,hostname:`${host}.officiallypointless.com`},Event,
      top:{location:{assign:url=>navigations.push(url)}},
      fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>url.endsWith('/status')?status:response};},
    });
    assert.equal(page.button.disabled,false,host);
    await page.button.click();
    assert.deepEqual(requests.map(r=>r.url),['https://officiallypointless.com/api/billing/status','https://officiallypointless.com/api/billing/checkout'],host);
    assert.deepEqual(JSON.parse(requests[1].options.body),{sku});
    assert.equal(requests[1].options.credentials,'omit');
    assert.deepEqual(navigations,[response.checkoutUrl]);
  }
});

test('lookalike or arbitrary product hosts never request a checkout destination',async()=>{
  for(const origin of ['https://museum.officiallypointless.com.evil.invalid','https://unknown.officiallypointless.com','http://museum.officiallypointless.com']) {
    const page=fakePage();page.button.getAttribute=()=>museumSku;let count=0;
    await checkout.mountBrowser({document:page.document,location:{search:'',origin,hostname:new URL(origin).hostname},Event,top:{location:{assign:()=>assert.fail('unknown host navigated')}},fetch:async()=>{count++;return {ok:true,json:async()=>museumStatus};}});
    assert.equal(page.button.disabled,true,origin);
    assert.equal(count,0,origin);
    assert.match(page.status.textContent,/could not be checked/);
  }
});

test('a checkout closed after status was read presents a closed purchase state',async()=>{
  const page=fakePage();let count=0;
  await checkout.mountCheckout({document:page.document,sku:museumSku,navigate:()=>assert.fail('closed individual checkout navigated'),
    fetch:async()=>++count===1?{ok:true,json:async()=>museumStatus}:{ok:false,status:503,json:async()=>({error:'checkout_not_open'})},
  });
  assert.equal(page.button.disabled,false);
  await page.button.click();
  assert.equal(page.button.disabled,true);
  assert.match(page.button.textContent,/not open/);
  assert.match(page.status.textContent,/Orders are not open/);
});

async function departmentPage(handler) {
  const elements=new Map();
  class Element {
    constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.checked=false;}
    addEventListener(type,handler){this.listeners[type]=handler;}
    setAttribute(name,value){this[name]=value;}
    append(...children){for(const child of children){this.children.push(child);child.parent=this;if(this.tagName==='select'&&!this.value)this.value=child.value;}}
    replaceChildren(){this.children=[];}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);}
    querySelector(){return this.button||(this.button=new Element('button'));}
    reportValidity(){return true;}
    set innerHTML(markup){
      this.markup=markup;
      for(const match of markup.matchAll(/<([a-z]+)\b[^>]*\bid="([^"]+)"[^>]*>/g))elements.set(match[2],new Element(match[1]));
      if(elements.has('output-mode'))elements.get('output-mode').value='private';
      if(elements.has('theme'))elements.get('theme').value='classic';
    }
    get innerHTML(){return this.markup||'';}
  }
  for(const id of ['access-status','redeem-form','removal-form','removal-status','purchase-key','removal-key','removal-id','department-workspace'])elements.set(id,new Element());
  for(const id of ['redeem-form','removal-form','department-workspace'])elements.get(id).hidden=true;
  const document={getElementById:id=>elements.get(id)||null,createElement:tag=>new Element(tag),body:new Element('body')};
  const requests=[];
  const scriptPath=existsSync(join(__dirname,'..','departments.js'))?join(__dirname,'..','departments.js'):join(__dirname,'..','site/assets/departments.js');
  require('node:vm').runInNewContext(readFileSync(scriptPath,'utf8'),{
    document,window:{addEventListener(){}},location:{origin:'https://officiallypointless.com',search:''},
    AbortController,setTimeout,clearTimeout,URL,URLSearchParams,Blob,crypto:require('node:crypto').webcrypto,
    fetch:async(url,options)=>{
      const action=url.split('/').pop();requests.push(action);
      const context={};await handler(context,{method:options.method||'GET',params:{action},
        headers:{origin:'https://officiallypointless.com','x-pointless-license':options.headers?.['X-Pointless-License']},
        body:options.body?JSON.parse(options.body):undefined});
      return {ok:context.res.status>=200&&context.res.status<300,json:async()=>context.res.body};
    },
  });
  await new Promise(resolve=>setImmediate(resolve));
  const submit=async id=>{
    const form=elements.get(id);
    await form.listeners.submit({preventDefault(){},currentTarget:form});
  };
  return {elements,requests,submit};
}

function paidMuseum() {
  const key='00000000-11111111-22222222-33333333';
  const {createLicenseVerifier}=require('../api/department-access');
  const {createDepartmentHandler}=require('../api/department-service');
  const {TestStore}=require('./community-fixtures');
  const store=new TestStore();
  const verifyLicense=createLicenseVerifier({productId:'fixture-museum-product',permalink:'pointless-museum',request:async()=>new Response(JSON.stringify({success:true,purchase:{
    product_id:'fixture-museum-product',permalink:'pointless-museum',sale_id:'fixture-museum-sale',license_key:key,
    price:1900,refunded:false,chargebacked:false,disputed:false,is_gift_receiver_purchase:false,
  }}))});
  const handler=createDepartmentHandler({enabled:true,store,verifyLicense});
  return {key,handler,store,createDepartmentHandler};
}

test('a verified individual key mounts only the purchased department in the creation workspace',async()=>{
  const fixture=paidMuseum(),page=await departmentPage(fixture.handler);
  page.elements.get('purchase-key').value=fixture.key;
  await page.submit('redeem-form');
  assert.equal(page.elements.get('department-workspace').hidden,false);
  assert.equal(page.elements.get('redeem-form').hidden,true);
  assert.deepEqual(page.elements.get('department').children.map(option=>option.value),['museum']);
  assert.equal(page.elements.get('create-output').textContent,'Download private gift');
  assert.equal(page.elements.get('purchase-key').value,'');
});

test('duplicate department grants never mount creation controls',async()=>{
  const catalog=require('../api/departments.json');
  const duplicated=[catalog[0],catalog[0],...catalog.slice(2)];
  const page=await departmentPage(async(context,req)=>{
    context.res={status:200,body:req.params.action==='status'?{enabled:true}:{departments:duplicated,records:[]}};
  });
  await page.submit('redeem-form');
  assert.equal(page.elements.get('department-workspace').hidden,true);
  assert.equal(page.elements.has('creation-form'),false);
});

test('closed purchase access keeps original-key removal available in the browser',async()=>{
  const fixture=paidMuseum(),context={};
  await fixture.handler(context,{method:'POST',params:{action:'publish'},headers:{origin:'https://officiallypointless.com','x-pointless-license':fixture.key},
    body:{department:'museum',name:'Riley',text:'A removable dedication.',requestId:'11111111-1111-1111-1111-111111111111'}});
  assert.equal(context.res.status,201);
  const id=context.res.body.record.id;
  const closed=fixture.createDepartmentHandler({enabled:false,removalEnabled:true,store:fixture.store,verifyLicense:async()=>{throw Error('provider unavailable');}});
  const page=await departmentPage(closed);
  assert.equal(page.elements.get('redeem-form').hidden,true);
  assert.equal(page.elements.get('removal-form').hidden,false);
  page.elements.get('removal-key').value=fixture.key;page.elements.get('removal-id').value=id;
  await page.submit('removal-form');
  assert.equal(fixture.store.state.records.length,0);
  assert.match(page.elements.get('removal-status').textContent,/removed/);
});
