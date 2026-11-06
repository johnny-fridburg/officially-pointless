'use strict';

(() => {
  const SKU = 'unnecessary-promotions';
  const TITLE_SLUGS = [
    'minister-of-unopened-tabs',
    'secretary-of-one-more-coffee',
    'director-of-unnecessary-meetings',
    'chief-of-the-snack-drawer',
    'commissioner-of-replying-tomorrow'
  ];

  function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  const DEPARTMENT_SKU='department-collection';
  const DEPARTMENT_SLUGS=Object.freeze(['make-it-worse','silence','loading','last-word','museum','golden-error','button','empty-wing','unnecessary-ribbon','invisible-monument']);
  const COMMERCE_ORIGIN='https://officiallypointless.com';
  const PRODUCT_ORIGINS=new Set(['https://promotions.officiallypointless.com',...DEPARTMENT_SLUGS.map(slug=>'https://'+slug+'.officiallypointless.com')]);
  const closedPresentation={state:'closed',disabled:true,buttonLabel:'Checkout is not open yet',message:'Orders are not open. You have not been charged.'};
  function checkoutProduct(sku){
    if(sku===SKU||sku===DEPARTMENT_SKU)return {retired:true};
    const title=typeof sku==='string'&&sku.startsWith('certificate-')?sku.slice('certificate-'.length):null;
    if(TITLE_SLUGS.includes(title))return {url:'https://fridburg.gumroad.com/l/pointless-'+title,kind:'digital-certificate'};
    const slug=typeof sku==='string'&&sku.startsWith('department-')?sku.slice('department-'.length):null;
    return DEPARTMENT_SLUGS.includes(slug)?{url:'https://fridburg.gumroad.com/l/pointless-'+slug,kind:'online-department'}:null;
  }
  function statusPresentation(status, sku=SKU) {
    const error = {
      state: 'error',
      disabled: true,
      buttonLabel: 'Checkout unavailable',
      message: 'Checkout could not be checked. You have not been charged.'
    };
    if (!isObject(status) || status.service !== 'officially-pointless' ||
        status.provider !== 'gumroad' || typeof status.checkoutEnabled !== 'boolean') {
      return error;
    }
    const product=checkoutProduct(sku);
    if(!product)return error;
    if(product.retired)return {...closedPresentation};
    const products=product.kind==='digital-certificate'?status.certificateProducts:status.departmentProducts;
    if(!Array.isArray(products))return error;
    const matches=products.filter(entry=>isObject(entry)&&isObject(entry.catalog)&&entry.catalog.sku===sku);
    if(matches.length!==1)return error;
    const selected=matches[0];
    if(!isObject(selected)||typeof selected.checkoutEnabled!=='boolean')return error;
    if (selected.checkoutEnabled === false) {
      return {...closedPresentation};
    }
    const catalog = selected.catalog;
    if (!isObject(catalog) || catalog.sku !== sku ||
        catalog.priceUsd !== 19 || catalog.currency !== 'USD' ||
        catalog.kind !== product.kind) {
      return error;
    }
    return {
      state: 'ready',
      disabled: false,
      buttonLabel: 'Continue to $19 checkout',
      message: 'Gumroad handles payment and digital delivery.'
    };
  }

  function approvedCheckoutUrl(response,sku=SKU) {
    const url=checkoutProduct(sku)?.url;
    if(!url)return null;
    if (!isObject(response) ||
        Object.keys(response).sort().join(',') !==
          'checkoutUrl,currency,fulfillment,priceUsd,sku' ||
        response.checkoutUrl !== url ||
        response.sku !== sku || response.priceUsd !== 19 ||
        response.currency !== 'USD' || response.fulfillment !== 'gumroad') {
      return null;
    }
    return url;
  }

  async function mountCheckout({document, fetch, navigate, sku=SKU, apiBase='', buttonId='checkout-button',statusId='checkout-status',availabilityId='checkout-availability'}) {
    const button = document.getElementById(buttonId);
    const status = document.getElementById(statusId);
    const availability = document.getElementById(availabilityId);
    const hasCheckoutControls = Boolean(button && status);
    if (!hasCheckoutControls && !availability) return;

    function render(presentation) {
      if (hasCheckoutControls) {
        button.disabled = presentation.disabled;
        button.textContent = presentation.buttonLabel;
        status.textContent = presentation.message;
      }
      if (availability) {
        availability.textContent = {
          ready: checkoutProduct(sku)?.kind==='digital-certificate'?'The $19 personalized certificate is available through Gumroad.':'The $19 individual department purchase is available through Gumroad.',
          closed: 'Purchases are not open. You have not been charged.',
          error: 'Checkout availability could not be checked. You have not been charged.'
        }[presentation.state];
      }
    }

    let state = 'checking';
    if (hasCheckoutControls) {
      button.disabled = true;
      button.textContent = 'Checking checkout…';
      status.textContent = 'Checking whether orders are open.';
    }
    if (availability) availability.textContent = 'Checking current product checkout availability…';
    if(!checkoutProduct(sku)||!['',COMMERCE_ORIGIN].includes(apiBase)){
      state='error';render(statusPresentation(null,sku));return;
    }
    if (hasCheckoutControls) button.addEventListener('click', async () => {
      if (state !== 'ready') return;
      state = 'opening';
      button.disabled = true;
      button.textContent = 'Opening checkout…';
      status.textContent = 'Requesting the approved Gumroad checkout. No charge has been made.';
      try {
        const response = await fetch(apiBase+'/api/billing/checkout', {
          method: 'POST',
          headers: {'Content-Type': 'application/json', Accept: 'application/json'},
          credentials: 'omit',
          cache: 'no-store',
          body: JSON.stringify({sku})
        });
        const data=await response.json();
        if (!response.ok) {
          if(response.status===503&&isObject(data)&&data.error==='checkout_not_open'){
            state='closed';render(closedPresentation);return;
          }
          throw new Error('Checkout unavailable');
        }
        const destination = approvedCheckoutUrl(data,sku);
        if (!destination) throw new Error('Invalid checkout destination');
        navigate(destination);
      } catch (_) {
        state = 'error';
        render(statusPresentation(null,sku));
      }
    });

    try {
      const response = await fetch(apiBase+'/api/billing/status', {
        headers: {Accept: 'application/json'},
        credentials: 'omit',
        cache: 'no-store'
      });
      if (!response.ok) throw new Error('Status unavailable');
      const presentation = statusPresentation(await response.json(),sku);
      state = presentation.state;
      render(presentation);
    } catch (_) {
      state = 'error';
      render(statusPresentation(null,sku));
    }
  }

  function titleIndexForSlug(slug) {
    const index = TITLE_SLUGS.indexOf(slug);
    return index < 0 ? null : index;
  }

  function titleSlugForIndex(index) {
    return /^[0-4]$/.test(index) ? TITLE_SLUGS[Number(index)] : null;
  }

  function mountTitleSelection({document, search, Event: EventClass}) {
    const requestedSlug = new URLSearchParams(search).get('title');
    const requestedIndex = titleIndexForSlug(requestedSlug);
    const giftSelect = document.getElementById('gift-title');
    const giftPreview = document.getElementById('gift-title-preview');
    if (giftSelect && requestedIndex !== null) giftSelect.value = requestedSlug;
    if (giftSelect && giftPreview) {
      if (requestedIndex !== null) giftSelect.value = requestedSlug;
      const updateGiftLink = () => {
        const slug = titleIndexForSlug(giftSelect.value) === null ?
          TITLE_SLUGS[0] : giftSelect.value;
        const productOrigin=giftPreview.href?.startsWith('https://promotions.officiallypointless.com/')?'https://promotions.officiallypointless.com':'';
        giftPreview.href = productOrigin + '/certificates/' + slug + '/';
      };
      giftSelect.addEventListener('change', updateGiftLink);
      updateGiftLink();
    }

    const titleSelect = document.getElementById('title');
    const kitLink = document.getElementById('gift-kit-title-link');
    if (titleSelect && kitLink) {
      if (requestedIndex !== null) {
        titleSelect.value = String(requestedIndex);
        titleSelect.dispatchEvent(new EventClass('change'));
      }
      const updateKitLink = () => {
        const slug = titleSlugForIndex(titleSelect.value) || TITLE_SLUGS[0];
        kitLink.href = '/certificates/' + slug + '/';
      };
      titleSelect.addEventListener('change', updateKitLink);
      updateKitLink();
    }
  }

  function commerceApiBase(location){
    const origin=location.origin;
    if(typeof origin==='string'){
      if(PRODUCT_ORIGINS.has(origin))return COMMERCE_ORIGIN;
      if(origin===COMMERCE_ORIGIN||origin==='https://www.officiallypointless.com'||/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::[0-9]+)?$/.test(origin))return '';
      return null;
    }
    // Some embedded contexts/test harnesses expose only location.hostname.
    if(typeof location.hostname==='string'&&location.hostname){
      if(PRODUCT_ORIGINS.has('https://'+location.hostname))return COMMERCE_ORIGIN;
      return ['officiallypointless.com','www.officiallypointless.com','localhost','127.0.0.1'].includes(location.hostname)?'':null;
    }
    return '';
  }

  function mountBrowser(browsingContext) {
    mountTitleSelection({
      document: browsingContext.document,
      search: browsingContext.location.search,
      Event: browsingContext.Event
    });
    const apiBase=commerceApiBase(browsingContext.location),mounts=[];
    if(browsingContext.document.getElementById('department-checkout-availability'))mounts.push(mountCheckout({document:browsingContext.document,fetch:browsingContext.fetch.bind(browsingContext),navigate:url=>browsingContext.top.location.assign(url),apiBase,sku:DEPARTMENT_SKU,buttonId:'department-checkout-button',statusId:'department-checkout-status',availabilityId:'department-checkout-availability'}));
    mounts.push(mountCheckout({
      sku:browsingContext.document.getElementById('checkout-button')?.getAttribute?.('data-checkout-sku')||SKU,
      apiBase,
      document: browsingContext.document,
      fetch: browsingContext.fetch.bind(browsingContext),
      navigate: url => browsingContext.top.location.assign(url)
    }));
    return Promise.all(mounts);
  }

  const exported = {
    statusPresentation, approvedCheckoutUrl, mountCheckout,
    titleIndexForSlug, titleSlugForIndex, mountTitleSelection, mountBrowser
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (typeof document !== 'undefined') mountBrowser(window);
})();
