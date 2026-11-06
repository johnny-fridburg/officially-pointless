'use strict';
(() => {
  const sites = [{"host": "promotions.officiallypointless.com", "image": "/assets/certificates/minister-of-unopened-tabs.png", "name": "Unnecessary Promotions", "path": "/gift-kit/", "sku": "unnecessary-promotions", "summary": "Choose one fictional promotion. We create one finished certificate for your recipient."}, {"host": "make-it-worse.officiallypointless.com", "image": "/assets/departments/make-it-worse.png", "name": "Bad Taste Department", "path": "/departments/make-it-worse/", "sku": "department-make-it-worse", "summary": "A citation in defense of questionable taste."}, {"host": "silence.officiallypointless.com", "image": "/assets/departments/silence.png", "name": "A Minute of Silence", "path": "/departments/silence/", "sku": "department-silence", "summary": "A solemn minute for a very small loss."}, {"host": "loading.officiallypointless.com", "image": "/assets/departments/loading.png", "name": "The Sponsored Loading Bar", "path": "/departments/loading/", "sku": "department-loading", "summary": "A brief delay, generously dedicated."}, {"host": "last-word.officiallypointless.com", "image": "/assets/departments/last-word.png", "name": "The Last Word", "path": "/departments/last-word/", "sku": "department-last-word", "summary": "The final statement, carefully typeset."}, {"host": "museum.officiallypointless.com", "image": "/assets/departments/museum.png", "name": "The Ordinary Museum", "path": "/departments/museum/", "sku": "department-museum", "summary": "An exhibit label for an unremarkable object."}, {"host": "golden-error.officiallypointless.com", "image": "/assets/departments/golden-error.png", "name": "A Gold-Plated Error", "path": "/departments/golden-error/", "sku": "department-golden-error", "summary": "An impeccably unnecessary 404."}, {"host": "button.officiallypointless.com", "image": "/assets/departments/button.png", "name": "The Over-Sponsored Button", "path": "/departments/button/", "sku": "department-button", "summary": "A button with nothing useful to accomplish."}, {"host": "empty-wing.officiallypointless.com", "image": "/assets/departments/empty-wing.png", "name": "The Empty Wing", "path": "/departments/empty-wing/", "sku": "department-empty-wing", "summary": "A dedication to an entirely empty gallery."}, {"host": "unnecessary-ribbon.officiallypointless.com", "image": "/assets/departments/unnecessary-ribbon.png", "name": "The Unnecessary Ribbon", "path": "/departments/unnecessary-ribbon/", "sku": "department-unnecessary-ribbon", "summary": "A ceremony in search of an occasion."}, {"host": "invisible-monument.officiallypointless.com", "image": "/assets/departments/invisible-monument.png", "name": "The Invisible Monument", "path": "/departments/invisible-monument/", "sku": "department-invisible-monument", "summary": "An inscription for something you cannot see."}];
  const certificatePaths = ["/certificates/minister-of-unopened-tabs/", "/certificates/secretary-of-one-more-coffee/", "/certificates/director-of-unnecessary-meetings/", "/certificates/chief-of-the-snack-drawer/", "/certificates/commissioner-of-replying-tomorrow/"];
  function siteForPath(pathname) {
    if (certificatePaths.includes(pathname)) return sites.find(site => site.host === 'promotions.officiallypointless.com');
    return sites.find(site => site.path === pathname);
  }
  function productRoute(hostname, pathname) {
    if (pathname !== '/' && pathname !== '/index.html') return null;
    const site = sites.find(site => site.host === hostname);
    return site ? site.path : null;
  }
  if (typeof module === 'object' && module.exports) module.exports = {productRoute, siteForPath};
  if (typeof window === 'object') {
    const route = productRoute(window.location.hostname, window.location.pathname);
    if (route) {
      window.location.replace(route + window.location.search + window.location.hash);
      return;
    }
    const site = sites.find(site => site.host === window.location.hostname);
    if (['officiallypointless.com', 'www.officiallypointless.com'].includes(window.location.hostname) && window.location.protocol === 'https:') {
      for (const link of document.querySelectorAll('a[href^="/"]')) {
        const href = link.getAttribute('href');
        const url = new URL(href, window.location.origin);
        const product = siteForPath(url.pathname);
        if (product) link.setAttribute('href', 'https://' + product.host + url.pathname + url.search + url.hash);
      }
    }
    if (site && window.location.protocol === 'https:') {
      if (window.location.pathname === site.path || site.host === 'promotions.officiallypointless.com' && certificatePaths.includes(window.location.pathname)) {
        const canonical = 'https://' + site.host + window.location.pathname;
        document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical);
        document.querySelector('meta[property="og:url"]')?.setAttribute('content', canonical);
      }
      for (const link of document.querySelectorAll('a[href^="/"]')) {
        const href = link.getAttribute('href');
        if (href.startsWith('//')) continue;
        const target = siteForPath(new URL(href, window.location.origin).pathname);
        link.setAttribute('href', (target?.host === site.host ? 'https://' + site.host : 'https://officiallypointless.com') + href);
      }
    }
  }
})();
