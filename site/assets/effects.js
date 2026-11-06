'use strict';
(() => {
  const tinyRuleTitles = Object.freeze(['A ceremonial nod is required', 'The opening must be announced twice', 'A tiny pause precedes the opening']);
  const products = Object.freeze({
    'department-make-it-worse': {slug: 'make-it-worse', name: 'Bad Taste Department', action: 'none'},
    'department-silence': {slug: 'silence', name: 'A Minute of Silence', action: 'silence', seconds: 60},
    'department-loading': {slug: 'loading', name: 'The Sponsored Loading Bar', action: 'loading', seconds: 5},
    'department-last-word': {slug: 'last-word', name: 'The Last Word', action: 'none'},
    'department-museum': {slug: 'museum', name: 'The Ordinary Museum', action: 'none'},
    'department-golden-error': {slug: 'golden-error', name: 'A Gold-Plated Error', action: 'none'},
    'department-button': {slug: 'button', name: 'The Over-Sponsored Button', action: 'button'},
    'department-empty-wing': {slug: 'empty-wing', name: 'The Empty Wing', action: 'none'},
    'department-unnecessary-ribbon': {slug: 'unnecessary-ribbon', name: 'The Unnecessary Ribbon', action: 'ribbon'},
    'department-invisible-monument': {slug: 'invisible-monument', name: 'The Invisible Monument', action: 'none'},
    'game-name-the-boss': {slug: 'name-the-boss', name: 'Name the Boss', action: 'boss'},
    'honor-patron-of-the-next-nothing': {slug: 'patron-of-the-next-nothing', name: 'Patron of the Next Nothing', action: 'ceremony'},
    'honor-the-bench-nobody-needed': {slug: 'the-bench-nobody-needed', name: 'The Bench Nobody Needed', action: 'none'},
    'honor-the-honorary-forecast': {slug: 'the-honorary-forecast', name: 'The Honorary Forecast', action: 'none', fixedForecast: 'Outlook: a ceremonial nod, followed by absolutely ordinary conditions.'},
    'honor-commissioner-of-a-tiny-rule': {slug: 'commissioner-of-a-tiny-rule', name: 'Commissioner of a Tiny Rule', action: 'ceremony', titleChoices: tinyRuleTitles},
  });
  function productFor(sku) {
    if (typeof sku !== 'string' || !Object.hasOwn(products, sku)) throw Error('This product is unavailable.');
    return products[sku];
  }
  function apiBase(host) {
    return Object.entries(products).some(([sku, product]) => sku.startsWith('department-') && host === product.slug + '.officiallypointless.com')
      ? 'https://officiallypointless.com' : '';
  }
  function productPath(sku) {
    const product = productFor(sku);
    return (sku.startsWith('honor-') ? '/honors/' : sku.startsWith('game-') ? '/games/' : '/departments/') + product.slug + '/';
  }
  function availability(body, sku) {
    const closed = {previewEnabled: false, purchaseEnabled: false, participationEnabled: false};
    if (!body || typeof body.previewEnabled !== 'boolean' || !Array.isArray(body.products)) return closed;
    const entries = body.products.filter(product => product && product.sku === sku);
    if (entries.length !== 1) return closed;
    return {previewEnabled: body.previewEnabled, purchaseEnabled: entries[0].purchaseEnabled === true,
      participationEnabled: entries[0].participationEnabled === true};
  }
  function publicText(value, limit, required = false) {
    if (typeof value !== 'string') throw Error('Enter a public name, title and dedication.');
    const text = value.trim();
    if (text.length > limit || (required && !text)) throw Error('Use a name up to 60 characters, a title up to 70 and a dedication up to 240.');
    if (/[^\x20-\x7E\u00A0-\u00FF]/u.test(text)) throw Error('This edition supports Latin letters, numbers and ordinary punctuation. Use a single line in each field.');
    return text;
  }
  function previewPayload(sku, fields) {
    const product = productFor(sku);
    if (!fields || fields.consent !== true) throw Error('Agree to public display of this name, title and dedication before previewing.');
    const title = publicText(fields.title, 70, true);
    if (product.titleChoices && !product.titleChoices.includes(title)) throw Error('Choose one of the three fixed tiny rules.');
    return {action: 'preview', sku, name: publicText(fields.name, 60, true), title,
      text: publicText(fields.text, 240), consent: true};
  }
  function base64Bytes(value) {
    if (typeof value !== 'string' || !value || value.length > 32 * 1024 * 1024 || value.length % 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw Error('The finished files could not be loaded. Try again.');
    return Uint8Array.from(atob(value), character => character.charCodeAt(0));
  }
  function pngBytes(value) {
    const bytes = base64Bytes(value), signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 45 || !signature.every((byte, index) => bytes[index] === byte) ||
      String.fromCharCode(...bytes.slice(12, 16)) !== 'IHDR' || String.fromCharCode(...bytes.slice(-8, -4)) !== 'IEND') {
      throw Error('The image could not be loaded. Try again.');
    }
    return bytes;
  }
  function readPreview(body) {
    if (!body || typeof body.preview !== 'string' || !body.preview.startsWith('data:image/png;base64,') ||
      typeof body.instance !== 'string' || !body.instance.trim() || body.instance.length > 8192) {
      throw Error('The preview could not be loaded. Create a fresh preview.');
    }
    pngBytes(body.preview.slice('data:image/png;base64,'.length));
    return {preview: body.preview, instance: body.instance};
  }
  function readEffect(value) {
    if (!value || typeof value !== 'object') throw Error('This public record could not be loaded.');
    const product = productFor(value.sku), max = product.action === 'boss' ? 3 : product.action === 'none' ? 0 : 1;
    if (typeof value.id !== 'string' || !/^[a-f0-9]{24}$/.test(value.id) || typeof value.completed !== 'boolean' ||
      !Number.isInteger(value.createdAt) || value.createdAt < 0 || value.createdAt > 8640000000000000 ||
      typeof value.result !== 'string' || value.result.length > 500 || !Number.isInteger(value.actionsRemaining) ||
      value.actionsRemaining < 0 || value.actionsRemaining > max ||
      (value.completed && value.actionsRemaining !== 0) || (!value.completed && value.actionsRemaining === 0)) {
      throw Error('This public record could not be loaded.');
    }
    if (product.titleChoices && !product.titleChoices.includes(value.title) || product.fixedForecast && value.result !== product.fixedForecast) throw Error('This public record could not be loaded.');
    return {id: value.id, sku: value.sku, name: publicText(value.name, 60, true), title: publicText(value.title, 70, true),
      text: publicText(value.text, 240), createdAt: value.createdAt, completed: value.completed,
      result: value.result, actionsRemaining: value.actionsRemaining};
  }
  function readFinished(body, expected) {
    const effect = readEffect(body?.effect), product = productFor(expected.sku);
    if (body.filename !== product.slug || effect.sku !== expected.sku ||
      ['id', 'name', 'title', 'text'].some(field => expected[field] !== undefined && effect[field] !== expected[field])) {
      throw Error('The finished files do not match this purchased instance. Use the original names and key.');
    }
    const png = pngBytes(body.png), pdf = base64Bytes(body.pdf);
    if (String.fromCharCode(...pdf.slice(0, 5)) !== '%PDF-' ||
      !String.fromCharCode(...pdf.slice(-64)).trimEnd().endsWith('%%EOF')) throw Error('The finished PDF could not be loaded. Try again.');
    return {effect, png, pdf, filename: body.filename};
  }
  function readRecovered(body, sku, id) {
    const recovered = readEffect(body?.effect);
    if (recovered.id !== id || recovered.sku !== sku) throw Error('The finished files do not match this product and public record ID.');
    return readFinished(body, recovered);
  }
  function definiteRejection(error) {
    return Number.isInteger(error?.status) && error.status >= 400 && error.status < 500;
  }
  function allowedMoves(effect) {
    if (!effect || effect.completed || effect.actionsRemaining <= 0) return [];
    const product = productFor(effect.sku);
    if (product.action === 'boss') return ['attack', 'defend', 'boast'];
    if (product.action === 'button' || product.action === 'ribbon' || product.action === 'ceremony') return ['activate'];
    if (product.action === 'silence' || product.action === 'loading') return [effect.result.startsWith('Ceremony started') ? 'complete' : 'start'];
    return [];
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {apiBase, productPath, availability, previewPayload, readPreview, readEffect, readFinished, readRecovered, definiteRejection, allowedMoves};
  if (typeof document === 'undefined') return;

  const base = apiBase(location.hostname);
  const messages = {
    payment_required: 'This key does not verify a paid purchase of this product. Check your Gumroad receipt.',
    payment_unavailable: 'Payment verification is temporarily unavailable. Try again shortly.',
    product_not_open: 'This product is not open for delivery yet.',
    preview_closed: 'Watermarked previews are not open yet.',
    participation_closed: 'Paid participation is not open yet. Your public record is still readable.',
    invalid_preview: 'Create a fresh watermarked preview before verifying payment.',
    purchase_already_assigned: 'This purchase already has its finished instance. Use the original name, title, dedication and key.',
    timer_not_ready: 'The ceremony is not ready to complete yet. Wait a little longer, then ask the server again.',
    action_exhausted: 'This purchased occasion is complete. It cannot be reset or extended.',
    invalid_move: 'That action is unavailable for this purchased occasion.',
    invalid_request_id: 'This action could not be confirmed. Please try again.',
    replay_conflict: 'This action conflicts with an earlier request. Verify your original purchase again to refresh the record.',
    effect_not_found: 'This public record is unavailable or has been removed.',
    effect_removed: 'This public record was removed. Use its original ID and purchase key to retrieve the finished files below.',
    not_found: 'This public record is unavailable or has been removed.',
    invalid_name: 'Enter a public name up to 60 characters and a title up to 70 characters.',
    invalid_title: 'Enter a public title up to 70 characters.',
    invalid_rule_title: 'Choose one of the three fixed tiny rules.',
    invalid_text: 'Use a dedication up to 240 characters on one line.',
    unsupported_characters: 'This edition supports Latin letters, numbers and ordinary punctuation.',
    unsupported_name_characters: 'This edition supports Latin letters, numbers and ordinary punctuation.',
    public_consent_required: 'Agree to public display of this name, title and dedication first.',
    ceremony_in_progress: 'This ceremony has already started. Get its current finished files to refresh the recorded state.',
    effect_completed: 'This purchased occasion is already complete. Get its finished files to see the recorded result.',
    request_conflict: 'This action conflicts with an earlier request. Get the current finished files before continuing.',
    invalid_id: 'Use the public record ID from your occasion’s link.',
  };
  async function fetchJson(query, payload, signal) {
    const response = await fetch(base + '/api/effects' + query, {method: payload ? 'POST' : 'GET',
      headers: payload ? {'Content-Type': 'text/plain;charset=UTF-8', Accept: 'application/json'} : {Accept: 'application/json'},
      credentials: 'omit', cache: 'no-store', ...(payload ? {body: JSON.stringify(payload)} : {}), signal});
    const body = await response.json();
    if (!response.ok) {
      const error = Error(messages[body?.error] || 'The service is temporarily unavailable. Try again shortly.');
      error.code = body?.error || 'service_unavailable'; error.status = response.status; throw error;
    }
    return body;
  }
  function recordLink(id) {return 'https://officiallypointless.com/effects/view/?id=' + id;}
  function node(tag, text, className) {
    const element = document.createElement(tag); if (text !== undefined) element.textContent = text;
    if (className) element.className = className; return element;
  }
  function publicCard(effect, linkTitle) {
    const article = node('article', undefined, 'effect-record'), product = productFor(effect.sku);
    article.append(node('p', product.name, 'eyebrow'));
    const heading = node('h2');
    if (linkTitle) {const link = node('a', effect.title); link.href = recordLink(effect.id); heading.append(link);}
    else heading.textContent = effect.title;
    article.append(heading, node('p', 'Credited to ' + effect.name, 'effect-credit'), node('p', effect.text, 'effect-dedication'),
      node('p', effect.result, 'effect-recorded-result'), node('p', effect.completed ? 'Completed and recorded.' : effect.actionsRemaining + ' purchased action(s) remaining.', 'fine'));
    const date = node('time', new Date(effect.createdAt).toLocaleDateString('en-US', {year: 'numeric', month: 'long', day: 'numeric'}), 'fine');
    date.dateTime = new Date(effect.createdAt).toISOString(); article.append(date);
    const productLink = node('a', 'View this occasion and purchase availability', 'text-link');
    productLink.href = 'https://officiallypointless.com' + productPath(effect.sku); article.append(productLink); return article;
  }
  const publicPage = document.getElementById('effect-gallery-page');
  if (publicPage) {
    const status = document.getElementById('effect-gallery-status'), records = document.getElementById('effect-records');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 35000);
    const mode = publicPage.dataset.effectPage;
    (async () => {
      try {
        if (mode === 'gallery') {
          const body = await fetchJson('?action=feed', null, controller.signal);
          if (!Array.isArray(body.effects) || body.effects.length > 50) throw Error('Public records could not be loaded.');
          const effects = body.effects.map(readEffect); records.replaceChildren(...effects.map(effect => publicCard(effect, true)));
          status.textContent = effects.length ? effects.length + ' public record' + (effects.length === 1 ? '' : 's') + '. Names, dedications and recorded outcomes.' : 'No public occasions have been recorded yet.';
        } else {
          const params = new URLSearchParams(location.search), id = params.get('id');
          if (params.getAll('id').length !== 1 || !/^[a-f0-9]{24}$/.test(id || '')) throw Error('Use a valid public record link.');
          const body = await fetchJson('?action=view&id=' + id, null, controller.signal), effect = readEffect(body.effect);
          if (effect.id !== id) throw Error('This public record could not be loaded.');
          records.replaceChildren(publicCard(effect, false)); status.textContent = 'Public record. This page displays its recorded outcome.';
        }
      } catch (error) {status.textContent = error.name === 'AbortError' ? 'Public records took too long to load. Reload to try again.' : error.message;}
      finally {clearTimeout(timeout);}
    })();
    addEventListener('pagehide', () => controller.abort(), {once: true}); return;
  }

  const form = document.getElementById('effect-form'); if (!form) return;
  const get = id => document.getElementById(id), sku = form.dataset.effectSku;
  const name = get('effect-name'), title = get('effect-title'), text = get('effect-text'), consent = get('effect-consent');
  const image = get('effect-preview'), sample = get('effect-sample'), caption = get('effect-caption');
  const status = get('effect-status'), previewButton = get('effect-preview-button'), deliverButton = get('effect-deliver-button');
  const license = get('effect-license'), deliveryForm = get('effect-delivery-form'), play = get('effect-play');
  const downloads = get('effect-downloads'), downloadButton = get('effect-download-button'), removeForm = get('effect-remove-form');
  const removeConsent = get('effect-remove-consent'), removeButton = get('effect-remove-button');
  const existingRemoveForm = get('effect-existing-removal-form'), existingId = get('effect-existing-id');
  const existingKey = get('effect-existing-key'), existingConsent = get('effect-existing-consent');
  const existingRemoveButton = get('effect-existing-remove-button'), existingRemovalStatus = get('effect-existing-removal-status');
  const existingDownloadButton = get('effect-existing-download-button');
  const moveButtons = Array.from(play.querySelectorAll('[data-effect-move]')), urls = [];
  let gates = availability(null, sku), signed = null, signedFields = null, effect = null, paidKey = '';
  let revision = 0, pending = null, busy = false, timer = null, timerStarted = null, retryMove = null;
  function clearDownloads() {
    downloads.hidden = true;
    for (const id of ['effect-png', 'effect-pdf']) get(id).removeAttribute('href');
    while (urls.length) URL.revokeObjectURL(urls.pop());
  }
  function clearTimer() {if (timer !== null) clearInterval(timer); timer = null; timerStarted = null; get('effect-timer-info').textContent = '';}
  function controls() {
    for (const field of [name, title, text, consent, license, existingId, existingKey, existingConsent]) field.disabled = busy;
    previewButton.disabled = busy || !gates.previewEnabled; deliverButton.disabled = busy || !signed;
    play.hidden = !effect || !paidKey;
    form.setAttribute('aria-busy', String(busy)); play.setAttribute('aria-busy', String(busy));
    const moves = allowedMoves(effect);
    for (const button of moveButtons) {
      const move = button.dataset.effectMove, timerMove = move === 'start' || move === 'complete';
      button.hidden = timerMove && !moves.includes(move);
      button.disabled = busy || !paidKey || !gates.participationEnabled || !moves.includes(move) || Boolean(retryMove && retryMove.move !== move);
    }
    downloadButton.disabled = busy || !effect || !paidKey;
    removeConsent.disabled = busy; removeButton.disabled = busy || !effect || !paidKey || !removeConsent.checked;
    existingRemoveButton.disabled = busy || !existingConsent.checked;
    existingDownloadButton.disabled = busy;
  }
  function showEffect(value) {
    effect = value; play.hidden = false;
    get('effect-current-result').textContent = effect.result;
    get('effect-actions-remaining').textContent = effect.actionsRemaining + ' purchased action(s) remaining.';
    const link = get('effect-public-link'); link.href = recordLink(effect.id); link.hidden = false;
    get('effect-participation-status').textContent = effect.completed ? 'This finished occasion is complete. Its recorded result cannot be reset.'
      : gates.participationEnabled ? 'Only this verified purchase can perform its remaining actions.' : 'Paid participation is not open yet.';
    if (effect.completed) clearTimer();
    else if (allowedMoves(effect).includes('complete')) timerInfo();
  }
  function invalidate() {
    revision++; pending?.abort(); pending = null; busy = false; signed = null; signedFields = null; effect = null; paidKey = ''; retryMove = null;
    image.hidden = true; image.removeAttribute('src'); sample.hidden = false;
    caption.textContent = 'Example artwork. Preview the public words you want for this purchased instance.';
    clearDownloads(); clearTimer(); get('effect-public-link').hidden = true; get('effect-public-link').removeAttribute('href');
    removeConsent.checked = false;
    status.textContent = gates.previewEnabled ? 'Create a fresh watermarked preview for these public words.' : 'Watermarked previews and new purchases are not open yet.';
    controls();
  }
  for (const field of [name, title, text, consent]) field.addEventListener('input', invalidate);
  title.addEventListener('change', invalidate);
  consent.addEventListener('change', invalidate); removeConsent.addEventListener('change', controls);
  existingConsent.addEventListener('change', controls);
  async function request(payload) {
    const controller = new AbortController(); pending = controller;
    const timeout = setTimeout(() => controller.abort(), 35000);
    try {return await fetchJson('', payload, controller.signal);} finally {clearTimeout(timeout); if (pending === controller) pending = null;}
  }
  async function operation(message, work, statusElement = status) {
    if (busy) return; const current = revision; busy = true; controls(); statusElement.textContent = message;
    try {await work(current);} catch (error) {
      if (current === revision) statusElement.textContent = error.name === 'AbortError'
        ? 'The request timed out. Retry with the same public words and purchase key.' : error.message;
    } finally {if (current === revision) {busy = false; controls();}}
  }
  function showFiles(files) {
    clearDownloads();
    try {
      for (const [format, type] of [['png', 'image/png'], ['pdf', 'application/pdf']]) {
        const url = URL.createObjectURL(new Blob([files[format]], {type})); urls.push(url);
        const link = get('effect-' + format); link.href = url; link.download = files.filename + '.' + format;
      }
      downloads.hidden = false;
    } catch (error) {clearDownloads(); throw error;}
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !gates.previewEnabled || !form.reportValidity()) return;
    let fields;
    try {fields = previewPayload(sku, {name: name.value, title: title.value, text: text.value, consent: consent.checked});}
    catch (error) {status.textContent = error.message; return;}
    invalidate();
    await operation('Creating your watermarked preview on our server…', async current => {
      const body = readPreview(await request(fields)); if (current !== revision) return;
      signed = body.instance; signedFields = fields; image.src = body.preview; image.hidden = false; sample.hidden = true;
      caption.textContent = 'Your preview has a huge watermark baked into its pixels. Check every public word before purchasing.';
      status.textContent = 'Preview ready. Your public words are fixed when we verify payment and create this instance.';
    });
  });
  deliveryForm.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !signed || !deliveryForm.reportValidity()) return;
    const key = license.value.trim(); if (!key) return;
    clearDownloads();
    await operation('Verifying payment and creating one finished public instance…', async current => {
      const files = readFinished(await request({action: 'deliver', instance: signed, license: key}), {...signedFields, ...(effect ? {id: effect.id} : {})});
      if (current !== revision) return;
      paidKey = key; license.value = ''; retryMove = null; showEffect(files.effect); showFiles(files);
      status.textContent = 'Payment verified. Your public record and finished PNG and image-only PDF are ready.';
    });
  });
  function timerInfo() {
    const seconds = productFor(sku).seconds;
    const estimate = timerStarted === null ? null : Math.max(0, seconds - Math.floor((Date.now() - timerStarted) / 1000));
    get('effect-timer-info').textContent = estimate === null ? 'This ceremony has started. The server checks when its wait is complete.'
      : estimate > 0 ? 'Estimated wait: ' + estimate + ' seconds. The server decides when the ceremony is complete.'
        : 'The estimated wait has ended. Ask the server to confirm completion.';
  }
  for (const button of moveButtons) button.addEventListener('click', async () => {
    const move = button.dataset.effectMove;
    if (busy || !paidKey || !effect || !gates.participationEnabled || !allowedMoves(effect).includes(move)) return;
    if (retryMove && retryMove.move !== move) return;
    const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
    const claim = retryMove || {move, requestId: Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')};
    retryMove = claim; clearDownloads();
    await operation('Verifying and recording this purchased action…', async current => {
      try {
        const body = await request({action: 'play', id: effect.id, license: paidKey, move, requestId: claim.requestId});
        const next = readEffect(body.effect);
        if (current !== revision) return;
        if (['id', 'sku', 'name', 'title', 'text'].some(field => next[field] !== effect[field])) throw Error('The action response did not match this purchased instance.');
        retryMove = null; showEffect(next);
        if (move === 'start') {clearTimer(); timerStarted = Date.now(); timerInfo(); timer = setInterval(timerInfo, 1000);}
        status.textContent = next.completed ? 'Your purchased occasion is complete and recorded. Get the finished files with its final result.'
          : 'Paid action recorded. ' + next.actionsRemaining + ' action(s) remain on this instance.';
      } catch (error) {
        if (definiteRejection(error)) retryMove = null;
        else if (current === revision) error.message = 'The action could not be confirmed. Retry the same action to recover its recorded result.';
        throw error;
      }
    });
  });
  downloadButton.addEventListener('click', async () => {
    if (busy || !effect || !paidKey) return; clearDownloads();
    await operation('Verifying your purchase and loading its finished files…', async current => {
      const files = readFinished(await request({action: 'download', id: effect.id, license: paidKey}), effect);
      if (current !== revision) return; retryMove = null; showEffect(files.effect); showFiles(files);
      status.textContent = 'Your verified finished PNG and image-only PDF are ready.';
    });
  });
  removeForm.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !effect || !paidKey || !removeConsent.checked) return;
    const id = effect.id;
    await operation('Verifying your key and removing the public record…', async current => {
      const body = await request({action: 'remove', id, license: paidKey}); if (current !== revision) return;
      if (body.removed !== true) throw Error('Removal could not be confirmed. Try again.');
      invalidate(); license.value = ''; status.textContent = 'Public record removed. This purchase remains consumed and cannot create or reset another instance.';
      existingId.value = id; get('effect-existing-removal').open = true;
    });
  });
  existingDownloadButton.addEventListener('click', async () => {
    if (busy || !existingId.reportValidity() || !existingKey.reportValidity()) return;
    const id = existingId.value.trim(), key = existingKey.value.trim();
    if (!/^[a-f0-9]{24}$/.test(id) || !key) {existingRemovalStatus.textContent = 'Enter the original 24-character public record ID and matching purchase key.'; return;}
    invalidate(); existingConsent.checked = false; license.value = '';
    await operation('Verifying your purchase and retrieving its finished files…', async current => {
      const files = readRecovered(await request({action: 'download', id, license: key}), sku, id);
      if (current !== revision) return;
      showFiles(files); existingKey.value = '';
      existingRemovalStatus.textContent = 'Your verified finished files are ready above.';
    }, existingRemovalStatus);
  });
  existingRemoveForm.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !existingConsent.checked || !existingRemoveForm.reportValidity()) return;
    const id = existingId.value.trim(), key = existingKey.value.trim();
    if (!/^[a-f0-9]{24}$/.test(id) || !key) {existingRemovalStatus.textContent = 'Enter the original 24-character public record ID and matching purchase key.'; return;}
    await operation('Verifying your original key and removing the public record…', async current => {
      const body = await request({action: 'remove', id, license: key}); if (current !== revision) return;
      if (body.removed !== true) throw Error('Removal could not be confirmed. Try again.');
      existingKey.value = ''; existingConsent.checked = false;
      if (effect?.id === id) invalidate();
      existingRemovalStatus.textContent = 'Public record removed. This purchase remains consumed and cannot create or reset another instance.';
    }, existingRemovalStatus);
  });
  controls();
  (async () => {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 35000);
    try {
      gates = availability(await fetchJson('?action=status', null, controller.signal), sku);
      status.textContent = gates.previewEnabled ? 'Preview your public words with a huge watermark. Purchase and participation require server verification.'
        : 'Watermarked previews and new purchases are not open yet.';
    } catch (_) {status.textContent = 'Availability could not be checked. Previews and new purchases are not open yet.';}
    finally {clearTimeout(timeout); controls();}
    addEventListener('pagehide', () => controller.abort(), {once: true});
  })();
  addEventListener('pagehide', () => {invalidate(); license.value = ''; existingKey.value = '';});
})();
