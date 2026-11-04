'use strict';

(() => {
  const SKU = 'unnecessary-promotions';
  const CANONICAL_CHECKOUT_URL = 'https://fridburg.gumroad.com/l/unnecessary-promotions';
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
  const DEPARTMENT_URL='https://fridburg.gumroad.com/l/department-collection';
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
    const collection=sku===DEPARTMENT_SKU;
    if(sku!==SKU&&!collection)return error;
    const selected=collection?status.departmentCollection:status;
    if(!isObject(selected)||typeof selected.checkoutEnabled!=='boolean')return error;
    if (selected.checkoutEnabled === false) {
      return {
        state: 'closed',
        disabled: true,
        buttonLabel: 'Checkout is not open yet',
        message: 'Orders are not open. You have not been charged.'
      };
    }
    const catalog = selected.catalog;
    if (!isObject(catalog) || catalog.sku !== sku ||
        catalog.priceUsd !== 19 || catalog.currency !== 'USD' ||
        catalog.kind !== (collection?'online-department-collection':'digital-download')) {
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
    const url=sku===SKU?CANONICAL_CHECKOUT_URL:sku===DEPARTMENT_SKU?DEPARTMENT_URL:null;
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

  async function mountCheckout({document, fetch, navigate, sku=SKU, buttonId='checkout-button',statusId='checkout-status',availabilityId='checkout-availability'}) {
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
          ready: sku===DEPARTMENT_SKU?'The $19 Department Collection is available through Gumroad.':'The $19 digital gift kit is available through Gumroad.',
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
    if (availability) availability.textContent = sku===DEPARTMENT_SKU?'Checking current collection checkout availability…':'Checking current gift-kit checkout availability…';
    if (hasCheckoutControls) button.addEventListener('click', async () => {
      if (state !== 'ready') return;
      state = 'opening';
      button.disabled = true;
      button.textContent = 'Opening checkout…';
      status.textContent = 'Requesting the approved Gumroad checkout. No charge has been made.';
      try {
        const response = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: {'Content-Type': 'application/json', Accept: 'application/json'},
          credentials: 'omit',
          cache: 'no-store',
          body: JSON.stringify({sku})
        });
        if (!response.ok) throw new Error('Checkout unavailable');
        const destination = approvedCheckoutUrl(await response.json(),sku);
        if (!destination) throw new Error('Invalid checkout destination');
        navigate(destination);
      } catch (_) {
        state = 'error';
        render(statusPresentation(null));
      }
    });

    try {
      const response = await fetch('/api/billing/status', {
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
      render(statusPresentation(null));
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
        giftPreview.href = '/gift-kit/?title=' + slug;
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
        kitLink.href = '/gift-kit/?title=' + slug;
      };
      titleSelect.addEventListener('change', updateKitLink);
      updateKitLink();
    }
  }

  function mountBrowser(browsingContext) {
    mountTitleSelection({
      document: browsingContext.document,
      search: browsingContext.location.search,
      Event: browsingContext.Event
    });
    if(browsingContext.document.getElementById('department-checkout-availability'))mountCheckout({document:browsingContext.document,fetch:browsingContext.fetch.bind(browsingContext),navigate:url=>browsingContext.top.location.assign(url),sku:DEPARTMENT_SKU,buttonId:'department-checkout-button',statusId:'department-checkout-status',availabilityId:'department-checkout-availability'});
    return mountCheckout({
      sku:browsingContext.document.getElementById('checkout-button')?.getAttribute?.('data-checkout-sku')||SKU,
      document: browsingContext.document,
      fetch: browsingContext.fetch.bind(browsingContext),
      navigate: url => browsingContext.top.location.assign(url)
    });
  }

  const exported = {
    statusPresentation, approvedCheckoutUrl, mountCheckout,
    titleIndexForSlug, titleSlugForIndex, mountTitleSelection, mountBrowser
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (typeof document !== 'undefined') mountBrowser(window);
})();
