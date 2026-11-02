'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { validatePublicArtifact } = require('./verify-public-artifact.js');

const sourceSite = path.resolve(__dirname, '..', 'site');
const validatorScript = path.join(__dirname, 'verify-public-artifact.js');

function copiedSite(t) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pointless-public-artifact-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const site = path.join(tempRoot, 'site');
  fs.cpSync(sourceSite, site, { recursive: true });
  return site;
}

test('accepts a clean copy of the public site', (t) => {
  const site = copiedSite(t);
  assert.doesNotThrow(() => validatePublicArtifact(site));
});

test('rejects a paid ZIP in public staging', (t) => {
  const site = copiedSite(t);
  fs.writeFileSync(path.join(site, 'paid-gift-kit.zip'), 'private delivery');
  assert.throws(() => validatePublicArtifact(site), /paid-gift-kit\.zip/);
});

test('rejects a renamed archive regardless of its extension', (t) => {
  const site = copiedSite(t);
  fs.writeFileSync(path.join(site, 'paid-gift-kit.dat'), 'private delivery');
  assert.throws(() => validatePublicArtifact(site), /paid-gift-kit\.dat/);
});

test('rejects a hidden file nested under an allowed directory', (t) => {
  const site = copiedSite(t);
  fs.mkdirSync(path.join(site, 'gift-kit', '.private'));
  fs.writeFileSync(path.join(site, 'gift-kit', '.private', 'START-HERE.html'), 'private delivery');
  assert.throws(() => validatePublicArtifact(site), /gift-kit\/\.private/);
});

test('rejects a symlink at an otherwise approved file path', (t) => {
  const site = copiedSite(t);
  const checkoutScript = path.join(site, 'assets', 'checkout.js');
  fs.rmSync(checkoutScript, { force: true });
  fs.symlinkSync('../index.html', checkoutScript);
  assert.throws(() => validatePublicArtifact(site), /assets\/checkout\.js/);
});

test('rejects a symlink at an otherwise approved directory path', (t) => {
  const site = copiedSite(t);
  fs.rmSync(path.join(site, 'privacy'), { recursive: true });
  fs.symlinkSync('terms', path.join(site, 'privacy'));
  assert.throws(() => validatePublicArtifact(site), /privacy/);
});

test('rejects a missing required public path', (t) => {
  const site = copiedSite(t);
  fs.rmSync(path.join(site, 'contact', 'index.html'));
  assert.throws(() => validatePublicArtifact(site), /contact\/index\.html/);
});

test('permits an ordinary assets/checkout.js file', (t) => {
  const site = copiedSite(t);
  fs.writeFileSync(path.join(site, 'assets', 'checkout.js'), 'console.log("checkout closed");\n');
  assert.doesNotThrow(() => validatePublicArtifact(site));
});

test('rejects a directory at an approved file path', (t) => {
  const site = copiedSite(t);
  fs.rmSync(path.join(site, 'contact', 'index.html'));
  fs.mkdirSync(path.join(site, 'contact', 'index.html'));
  assert.throws(() => validatePublicArtifact(site), /contact\/index\.html/);
});

test('CLI validates an explicitly supplied site directory and rejects contamination', (t) => {
  const site = copiedSite(t);
  const clean = spawnSync(process.execPath, [validatorScript, site], { encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);

  fs.writeFileSync(path.join(site, 'START-HERE.html'), 'private delivery');
  const contaminated = spawnSync(process.execPath, [validatorScript, site], { encoding: 'utf8' });
  assert.notEqual(contaminated.status, 0);
  assert.match(contaminated.stderr, /START-HERE\.html/);
});

test('CLI requires exactly one site directory argument', () => {
  const missing = spawnSync(process.execPath, [validatorScript], { encoding: 'utf8' });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /site directory/i);
});
