'use strict';

const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const { TextDecoder } = require('node:util');

// Reviewed public surface. Changing this list requires a new publication review.
const reviewedPaths = [
  "api/instance-proxy.js",
  "api/instance-proxy.test.js",
  "api/certificates/index.js",
  "api/certificates/function.json",
  "site/assets/certificate-instances.js",
  ".githooks/pre-commit",
  ".githooks/pre-push",
  ".github/workflows/azure.yml",
  ".gitignore",
  ".public-files.json",
  "README.md",
  "api/catalog.js",
  "api/checkout/function.json",
  "api/checkout/index.js",
  "api/commerce.test.js",
  "api/community/function.json",
  "api/community/index.js",
  "api/community-service.js",
  "api/community-store.js",
  "api/google-identity.js",
  "api/community.test.js",
  "test/community-fixtures.js",
  "api/host.json",
  "api/package.json",
  "api/product.json",
  "api/status/function.json",
  "api/status/index.js",
  "scripts/verify-public-artifact.js",
  "scripts/verify-public-artifact.test.js",
  "scripts/verify-public-repository.js",
  "scripts/verify-public-repository.test.js",
  "site/assets/checkout.js",
  "site/assets/gift-kit-cover.png",
  "site/contact/index.html",
  "site/gift-kit/index.html",
  "site/index.html",
  "site/ministry-title-gift/index.html",
  "site/privacy/index.html",
  "site/robots.txt",
  "site/sitemap.xml",
  "site/sales-status/index.html",
  "site/staticwebapp.config.json",
  "site/terms/index.html",
  "test/checkout-ui.test.js",
  "api/department-access.js",
  "api/department-service.js",
  "api/departments.json",
  "api/departments.test.js",
  "api/departments/index.js",
  "api/departments/function.json",
  "site/assets/departments.js",
  "site/departments/access/index.html",
  "site/presence/index.html",
  "site/departments/make-it-worse/index.html",
  "site/assets/departments/make-it-worse.png",
  "site/departments/silence/index.html",
  "site/assets/departments/silence.png",
  "site/departments/loading/index.html",
  "site/assets/departments/loading.png",
  "site/departments/last-word/index.html",
  "site/assets/departments/last-word.png",
  "site/departments/museum/index.html",
  "site/assets/departments/museum.png",
  "site/departments/golden-error/index.html",
  "site/assets/departments/golden-error.png",
  "site/departments/button/index.html",
  "site/assets/departments/button.png",
  "site/departments/empty-wing/index.html",
  "site/assets/departments/empty-wing.png",
  "site/departments/unnecessary-ribbon/index.html",
  "site/assets/departments/unnecessary-ribbon.png",
  "site/departments/invisible-monument/index.html",
  "site/assets/departments/invisible-monument.png",
  "site/departments/index.html",
  "site/assets/product-dispatch.js",
  "api/product-sites.js",
  "api/commerce-origins.js",
  ".github/workflows/products.yml",
  "site/certificates/minister-of-unopened-tabs/index.html",
  "site/certificates/secretary-of-one-more-coffee/index.html",
  "site/certificates/director-of-unnecessary-meetings/index.html",
  "site/certificates/chief-of-the-snack-drawer/index.html",
  "site/certificates/commissioner-of-replying-tomorrow/index.html",
  "site/assets/certificates/minister-of-unopened-tabs.png",
  "site/assets/certificates/secretary-of-one-more-coffee.png",
  "site/assets/certificates/director-of-unnecessary-meetings.png",
  "site/assets/certificates/chief-of-the-snack-drawer.png",
  "site/assets/certificates/commissioner-of-replying-tomorrow.png",
  "api/gift-products.json",
  "api/paid-state.js",
  "api/gift-service.js",
  "api/gifts/index.js",
  "api/gifts/function.json",
  "api/gifts.test.js",
  "site/assets/gifts.js",
  "site/assets/gifts.css",
  "site/gifts/index.html",
  "site/gifts/create/index.html",
  "site/gifts/view/index.html",
  "site/people/index.html"
];
const allowedPaths = new Set(reviewedPaths);
const approvedAssetSha256 = {
  "site/assets/gift-kit-cover.png": "cbf319c87fb5957990e35ba8469162231cc42b9cdcb6c155de3a621806e259f1",
  "site/assets/departments/make-it-worse.png": "0f77e83796fe47299f3771eed48315a7730b257b2642ffe8088c7e82772d2830",
  "site/assets/departments/silence.png": "17490f3c7f095e234b25ce704ccbe3481c5cc7d656a989e3b6dfc08c434ee9a5",
  "site/assets/departments/loading.png": "4f881bdbe6af6fcecc11010fe7a2a08e80773683cef039f2c622d5995ba9185a",
  "site/assets/departments/last-word.png": "9c4554ca0d1a7355e2adc07fde26f5e56bdfe818dd84d140c0196a1c1a80427c",
  "site/assets/departments/museum.png": "8e2fefaf83eb294204739fec303099484550063fe37281642397f1077de4aa09",
  "site/assets/departments/golden-error.png": "5858fda18e368f305da23c430dca621014f6bbd71fda17a017f01ed90b99fe03",
  "site/assets/departments/button.png": "223a81a5176e7517cf34c7a769e4dff61c09b083d7564e7da7e451a6b27d9d8b",
  "site/assets/departments/empty-wing.png": "40f88aa8b55466a9e119fbddf7c8c2df7b33242da5b02aa5c1740c5e3bb5aab2",
  "site/assets/departments/unnecessary-ribbon.png": "73e4c3d62584a2f6f1c143a1684b5a3a0d9dd1ec1bfd88d3e2b36c435bb5a267",
  "site/assets/departments/invisible-monument.png": "22e933550be1d591763612c3a8a4c9eef367768d22d714ade9913ff42cb55af8",
  "site/assets/certificates/minister-of-unopened-tabs.png": "cbf319c87fb5957990e35ba8469162231cc42b9cdcb6c155de3a621806e259f1",
  "site/assets/certificates/secretary-of-one-more-coffee.png": "c9297dedcc350edd0c069fe6e93c2458951c02e772a2542de52350748fafa26c",
  "site/assets/certificates/director-of-unnecessary-meetings.png": "24e0332109a9ce38b6f7c4e84b191b4360ab1eba8531d511cf94a2ae52cbe8a4",
  "site/assets/certificates/chief-of-the-snack-drawer.png": "a441c29750257b15d04a5258cbc8f72312a0f16b3276e3ce76baff21376dd230",
  "site/assets/certificates/commissioner-of-replying-tomorrow.png": "6ad39439bb4bd90fc058a3b68443613946b7eaed13da41a2cc0dfcbb7fc38165"
};
const shaPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i;
const utf8 = new TextDecoder('utf-8', { fatal: true });
const zipSignatures = [
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08]),
];
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const credentialPatterns = [
  /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\b(?:azure_static_web_apps_api_token|swa_cli_deployment_token|deployment[_-]?token)['"]?\s*[:=]\s*['"]?[A-Za-z0-9+/_=-]{20,}/i,
];

function git(repoPath, args) {
  if (typeof repoPath !== 'string' || !repoPath) {
    throw new Error('A repository path is required');
  }
  try {
    return execFileSync('git', ['-C', repoPath, ...args], {
      encoding: 'buffer',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    throw new Error('Git inspection failed; check the repository and fetch missing objects');
  }
}

function validateSha(sha) {
  if (typeof sha !== 'string' || !shaPattern.test(sha)) {
    throw new Error('Malformed ref SHA');
  }
}

function isZeroSha(sha) {
  return /^0+$/.test(sha);
}

function requireCommit(repoPath, sha) {
  try {
    const type = git(repoPath, ['cat-file', '-t', sha]).toString('ascii').trim();
    if (type !== 'commit') throw new Error('wrong object type');
  } catch {
    throw new Error('Commit object unavailable; fetch missing remote objects before pushing');
  }
}

function records(buffer) {
  return buffer.toString('utf8').split('\0').filter(Boolean);
}

function indexEntries(repoPath) {
  return records(git(repoPath, ['ls-files', '--stage', '-z'])).map((record) => {
    const tab = record.indexOf('\t');
    if (tab < 0) throw new Error('Malformed Git index entry');
    const fields = record.slice(0, tab).split(' ');
    if (fields.length !== 3) throw new Error('Malformed Git index entry');
    return { mode: fields[0], type: 'blob', sha: fields[1], stage: fields[2], path: record.slice(tab + 1) };
  });
}

function treeEntries(repoPath, revision) {
  return records(git(repoPath, ['ls-tree', '-r', '-z', '--full-tree', revision])).map((record) => {
    const tab = record.indexOf('\t');
    if (tab < 0) throw new Error('Malformed Git tree entry');
    const fields = record.slice(0, tab).split(' ');
    if (fields.length !== 3) throw new Error('Malformed Git tree entry');
    return { mode: fields[0], type: fields[1], sha: fields[2], stage: '0', path: record.slice(tab + 1) };
  });
}

function checkedText(blob, path) {
  let text;
  try {
    text = utf8.decode(blob);
  } catch {
    throw new Error(`Invalid UTF-8 text format: ${path}`);
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) {
    throw new Error(`Invalid text format: ${path}`);
  }
  return text;
}

function validatePng(blob, path) {
  if (blob.length < 45 || !blob.subarray(0, 8).equals(pngSignature) ||
      blob.readUInt32BE(8) !== 13 || blob.toString('ascii', 12, 16) !== 'IHDR' ||
      !blob.subarray(-12, -8).equals(Buffer.alloc(4)) ||
      blob.toString('ascii', blob.length - 8, blob.length - 4) !== 'IEND') {
    throw new Error(`Invalid PNG format: ${path}`);
  }
}

function validateApprovedAsset(blob, path) {
  const expected = approvedAssetSha256[path];
  if (expected && createHash('sha256').update(blob).digest('hex') !== expected) {
    throw new Error(`Unapproved asset SHA-256 in reviewed public path: ${path}`);
  }
}

function validateBlob(blob, path) {
  if (zipSignatures.some((signature) => blob.includes(signature))) {
    throw new Error(`ZIP signature in reviewed public path: ${path}`);
  }
  const bytes = blob.toString('latin1');
  if (credentialPatterns.some((pattern) => pattern.test(bytes))) {
    throw new Error(`Credential marker in reviewed public path: ${path}`);
  }
  if (path.endsWith('.png')) {
    validatePng(blob, path);
    validateApprovedAsset(blob, path);
    return;
  }
  if (path.endsWith('.pdf')) {
    if (!blob.subarray(0, 5).equals(Buffer.from('%PDF-')) || !/%%EOF\s*$/.test(bytes)) {
      throw new Error(`Invalid PDF format: ${path}`);
    }
    validateApprovedAsset(blob, path);
    return;
  }

  const text = checkedText(blob, path);
  if (path.endsWith('.svg') && !/^\s*(?:<\?xml[^>]*>\s*)?<svg\b[\s\S]*<\/svg>\s*$/i.test(text)) {
    throw new Error(`Invalid SVG format: ${path}`);
  }
  validateApprovedAsset(blob, path);
  if (path.endsWith('.json')) {
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON format: ${path}`);
    }
    if (path === '.public-files.json' &&
        (JSON.stringify(value) !== JSON.stringify({ files: reviewedPaths, assetSha256: approvedAssetSha256 }))) {
      throw new Error('Public repository policy differs from the reviewed paths');
    }
  }
}

function newState() {
  return { commits: 0, entries: 0, objects: new Set(), validated: new Set() };
}

function scanEntries(repoPath, entries, state) {
  for (const entry of entries) {
    if (!allowedPaths.has(entry.path)) {
      throw new Error('Unapproved public repository path');
    }
    if (!['100644', '100755'].includes(entry.mode) || entry.type !== 'blob' || entry.stage !== '0') {
      throw new Error(`Nonregular Git entry in reviewed public path: ${entry.path}`);
    }
    validateSha(entry.sha);
    state.entries += 1;
    state.objects.add(entry.sha);
    const key = `${entry.sha}\0${entry.path}`;
    if (!state.validated.has(key)) {
      validateBlob(git(repoPath, ['cat-file', 'blob', entry.sha]), entry.path);
      state.validated.add(key);
    }
  }
}

function summary(state) {
  return { commits: state.commits, entries: state.entries, objects: state.objects.size };
}

function validateStagedRepository(repoPath) {
  const state = newState();
  scanEntries(repoPath, indexEntries(repoPath), state);
  return { entries: state.entries, objects: state.objects.size };
}

function validateCommitRepository(repoPath, revision) {
  validateSha(revision);
  requireCommit(repoPath, revision);
  const state = newState();
  state.commits = 1;
  scanEntries(repoPath, treeEntries(repoPath, revision), state);
  return summary(state);
}

function validateOutgoingRepository(repoPath, updates) {
  if (!Array.isArray(updates)) throw new Error('Ref updates must be an array');
  const state = newState();
  for (const update of updates) {
    if (!update || typeof update !== 'object') throw new Error('Malformed ref update');
    validateSha(update.localSha);
    validateSha(update.remoteSha);
    if (isZeroSha(update.localSha)) continue;
    requireCommit(repoPath, update.localSha);
    if (!isZeroSha(update.remoteSha)) requireCommit(repoPath, update.remoteSha);
    const args = ['rev-list', '--reverse', update.localSha];
    if (!isZeroSha(update.remoteSha)) args.push(`^${update.remoteSha}`);
    const revisions = git(repoPath, args).toString('ascii').trim().split('\n').filter(Boolean);
    for (const revision of revisions) {
      state.commits += 1;
      scanEntries(repoPath, treeEntries(repoPath, revision), state);
    }
  }
  return summary(state);
}

function parseUpdates(input) {
  const updates = [];
  for (const line of input.split('\n')) {
    if (!line) continue;
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 4 || fields.some((field) => !field)) throw new Error('Malformed pre-push ref update');
    const [localRef, localSha, remoteRef, remoteSha] = fields;
    validateSha(localSha);
    validateSha(remoteSha);
    updates.push({ localRef, localSha, remoteRef, remoteSha });
  }
  return updates;
}

module.exports = { validateStagedRepository, validateCommitRepository, validateOutgoingRepository };

if (require.main === module) {
  try {
    let result;
    if (process.argv.length !== 3) throw new Error('Usage: verify-public-repository.js --staged|--head|--push|--policy');
    if (process.argv[2] === '--policy') {
      validateBlob(fs.readFileSync('.public-files.json'), '.public-files.json');
      console.log('Public policy verified');
      process.exit(0);
    } else if (process.argv[2] === '--staged') {
      result = validateStagedRepository(process.cwd());
    } else if (process.argv[2] === '--head') {
      const revision = git(process.cwd(), ['rev-parse', '--verify', 'HEAD^{commit}']).toString('ascii').trim();
      result = validateCommitRepository(process.cwd(), revision);
    } else if (process.argv[2] === '--push') {
      result = validateOutgoingRepository(process.cwd(), parseUpdates(fs.readFileSync(0, 'utf8')));
    } else {
      throw new Error('Usage: verify-public-repository.js --staged|--head|--push');
    }
    console.log(`Public repository verified: ${result.commits || 0} commits, ${result.entries} entries, ${result.objects} objects`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
