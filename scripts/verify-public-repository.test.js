'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const guard = path.join(__dirname, 'verify-public-repository.js');
const zero = '0'.repeat(40);

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function repository(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'public-repository-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 'Fixture Author');
  git(repo, 'config', 'user.email', 'fixture@example.invalid');
  return repo;
}

function stage(repo, name, content) {
  const file = path.join(repo, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  git(repo, 'add', '--', name);
}

function commit(repo, message) {
  git(repo, 'commit', '-qm', message);
  return git(repo, 'rev-parse', 'HEAD');
}

function run(repo, ...args) {
  return spawnSync(process.execPath, [guard, ...args], { cwd: repo, encoding: 'utf8' });
}

function outgoing(localSha, remoteSha) {
  return [{ localRef: 'refs/heads/main', localSha, remoteRef: 'refs/heads/main', remoteSha }];
}

function api() {
  return require(guard);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngWithValidTextChunk(original) {
  const contents = Buffer.from('Comment\0fixture');
  const typeAndContents = Buffer.concat([Buffer.from('tEXt'), contents]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(contents.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndContents));
  return Buffer.concat([original.subarray(0, -12), length, typeAndContents, checksum, original.subarray(-12)]);
}

test('CLI accepts a safe staged Git index', (t) => {
  const repo = repository(t);
  stage(repo, 'README.md', '# Public site\n');
  const result = run(repo, '--staged');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /verified/i);
});

test('staged summary counts reviewed regular files', (t) => {
  const repo = repository(t);
  stage(repo, 'README.md', '# Public site\n');
  stage(repo, 'site/staticwebapp.config.json', '{"routes":[]}\n');
  assert.deepEqual(api().validateStagedRepository(repo), { entries: 2, objects: 2 });
});

test('rejects an unreviewed staged ZIP path', (t) => {
  const repo = repository(t);
  stage(repo, 'private-delivery.zip', Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  assert.throws(() => api().validateStagedRepository(repo), /Unapproved public repository path/);
});

test('rejects a ZIP blob renamed as the reviewed PNG', (t) => {
  const repo = repository(t);
  stage(repo, 'site/assets/gift-kit-cover.png', Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2]));
  assert.throws(() => api().validateStagedRepository(repo), /site\/assets\/gift-kit-cover\.png/);
});

test('accepts the three approved static asset objects', (t) => {
  const repo = repository(t);
  stage(repo, 'site/assets/gift-kit-cover.png', fs.readFileSync(path.join(__dirname, '../site/assets/gift-kit-cover.png')));
  stage(repo, 'site/pdf/ministry-unopened-tabs-certificate.pdf', fs.readFileSync(path.join(__dirname, '../site/pdf/ministry-unopened-tabs-certificate.pdf')));
  stage(repo, 'site/ministry-title-gift/certificate.svg', fs.readFileSync(path.join(__dirname, '../site/ministry-title-gift/certificate.svg')));
  assert.deepEqual(api().validateStagedRepository(repo), { entries: 3, objects: 3 });
});

test('rejects a structurally valid PNG with new metadata at the reviewed cover path', (t) => {
  const repo = repository(t);
  const original = fs.readFileSync(path.join(__dirname, '../site/assets/gift-kit-cover.png'));
  stage(repo, 'site/assets/gift-kit-cover.png', pngWithValidTextChunk(original));
  assert.throws(() => api().validateStagedRepository(repo), /approved asset|SHA-256/i);
});

test('rejects a valid PDF with a new comment at the reviewed sample path', (t) => {
  const repo = repository(t);
  const original = fs.readFileSync(path.join(__dirname, '../site/pdf/ministry-unopened-tabs-certificate.pdf'), 'latin1');
  stage(repo, 'site/pdf/ministry-unopened-tabs-certificate.pdf', Buffer.from(original.replace('%%EOF', '% fixture comment\n%%EOF'), 'latin1'));
  assert.throws(() => api().validateStagedRepository(repo), /approved asset|SHA-256/i);
});

test('rejects a valid SVG with a new comment at the reviewed certificate path', (t) => {
  const repo = repository(t);
  const original = fs.readFileSync(path.join(__dirname, '../site/ministry-title-gift/certificate.svg'), 'utf8');
  stage(repo, 'site/ministry-title-gift/certificate.svg', original.replace('</svg>', '<!-- fixture comment --></svg>'));
  assert.throws(() => api().validateStagedRepository(repo), /approved asset|SHA-256/i);
});

for (const [name, content] of [
  ['site/assets/gift-kit-cover.png', 'plain text, not a PNG'],
  ['site/pdf/ministry-unopened-tabs-certificate.pdf', 'plain text, not a PDF'],
  ['site/ministry-title-gift/certificate.svg', '<html>Not SVG</html>'],
  ['site/staticwebapp.config.json', '{malformed'],
  ['README.md', Buffer.from([0xff, 0xfe, 0x00])],
]) {
  test(`rejects malformed reviewed format at ${name}`, (t) => {
    const repo = repository(t);
    stage(repo, name, content);
    assert.throws(() => api().validateStagedRepository(repo), /format|UTF-8|JSON|SVG|PNG|PDF/i);
  });
}

test('rejects a symlink at a reviewed path', (t) => {
  const repo = repository(t);
  fs.symlinkSync('site/index.html', path.join(repo, 'README.md'));
  git(repo, 'add', 'README.md');
  assert.throws(() => api().validateStagedRepository(repo), /README\.md/);
});

test('rejects a submodule mode at a reviewed path', (t) => {
  const repo = repository(t);
  stage(repo, 'README.md', '# Public site\n');
  const sha = commit(repo, 'safe base');
  git(repo, 'update-index', '--add', '--cacheinfo', '160000', sha, 'README.md');
  assert.throws(() => api().validateStagedRepository(repo), /README\.md/);
});

test('rejects credential markers without echoing values', (t) => {
  const repo = repository(t);
  const canary = 'AK' + 'IA' + 'Q'.repeat(16);
  stage(repo, 'README.md', `# Public site\n${canary}\n`);
  assert.throws(() => api().validateStagedRepository(repo), (error) => {
    assert.match(error.message, /credential|secret/i);
    assert.doesNotMatch(error.message, new RegExp(canary));
    return true;
  });
  const result = run(repo, '--staged');
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stderr, new RegExp(canary));
});

test('rejects a GitHub token marker assembled only inside a Git fixture', (t) => {
  const repo = repository(t);
  const canary = 'gh' + 'p_' + 'x'.repeat(36);
  stage(repo, 'README.md', `# Public site\n${canary}\n`);
  assert.throws(() => api().validateStagedRepository(repo), /credential/i);
});

test('rejects a private key marker', (t) => {
  const repo = repository(t);
  stage(repo, 'README.md', ['-----BEGIN', 'PRIVATE KEY-----'].join(' ') + '\n');
  assert.throws(() => api().validateStagedRepository(repo), /private key|credential|secret/i);
});

test('rejects an unsafe indexed blob even after the working file is cleaned', (t) => {
  const repo = repository(t);
  stage(repo, 'README.md', 'azure_static_web_apps_api_token: ' + 'q'.repeat(40) + '\n');
  fs.writeFileSync(path.join(repo, 'README.md'), '# Public site\n');
  assert.throws(() => api().validateStagedRepository(repo), /README\.md/);
});

for (const [name, key] of [
  ['site/staticwebapp.config.json', 'deployment_token'],
  ['api/package.json', 'azure_static_web_apps_api_token'],
  ['api/host.json', 'SWA_CLI_DEPLOYMENT_TOKEN'],
]) {
  test(`rejects a quoted ${key} value in reviewed JSON`, (t) => {
    const repo = repository(t);
    const canary = ['q'.repeat(20), 'r'.repeat(20)].join('');
    stage(repo, name, JSON.stringify({ [key]: canary }));
    assert.throws(() => api().validateStagedRepository(repo), (error) => {
      assert.match(error.message, /credential/i);
      assert.doesNotMatch(error.message, new RegExp(canary));
      return true;
    });
    const result = run(repo, '--staged');
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, new RegExp(canary));
  });
}

test('rejects a single-quoted deployment token key in reviewed text', (t) => {
  const repo = repository(t);
  const canary = ['q'.repeat(20), 'r'.repeat(20)].join('');
  stage(repo, 'README.md', `'deployment_token': '${canary}'\n`);
  assert.throws(() => api().validateStagedRepository(repo), /credential/i);
});

test('permits a workflow reference to the configured GitHub secret', (t) => {
  const repo = repository(t);
  stage(repo, '.github/workflows/azure.yml', 'azure_static_web_apps_api_token: ${{ secrets.AZURE_STATIC_WEB_APPS_API_TOKEN }}\n');
  assert.deepEqual(api().validateStagedRepository(repo), { entries: 1, objects: 1 });
});

test('rejects a policy file that tries to widen the reviewed paths', (t) => {
  const repo = repository(t);
  stage(repo, '.public-files.json', '{"paths":["private-delivery.zip"]}\n');
  stage(repo, 'private-delivery.zip', Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  assert.throws(() => api().validateStagedRepository(repo), /private-delivery\.zip|policy/i);
});

test('rejects a policy file with a changed approved asset hash', (t) => {
  const repo = repository(t);
  const policy = JSON.parse(fs.readFileSync(path.join(__dirname, '../.public-files.json'), 'utf8'));
  policy.assetSha256['site/assets/gift-kit-cover.png'] = 'f'.repeat(64);
  stage(repo, '.public-files.json', JSON.stringify(policy));
  assert.throws(() => api().validateStagedRepository(repo), /policy differs/i);
});

test('validates a safe committed tree and every safe outgoing revision', (t) => {
  const repo = repository(t);
  stage(repo, 'README.md', '# First public version\n');
  const base = commit(repo, 'base');
  stage(repo, 'README.md', '# Second public version\n');
  const middle = commit(repo, 'second');
  stage(repo, 'README.md', '# Third public version\n');
  const head = commit(repo, 'third');
  assert.deepEqual(api().validateCommitRepository(repo, middle), { commits: 1, entries: 1, objects: 1 });
  assert.deepEqual(api().validateOutgoingRepository(repo, outgoing(head, base)), { commits: 2, entries: 2, objects: 2 });
  assert.deepEqual(api().validateOutgoingRepository(repo, outgoing(head, zero)), { commits: 3, entries: 3, objects: 3 });
});

test('rejects a private file added then deleted in outgoing history', (t) => {
  const repo = repository(t);
  stage(repo, 'README.md', '# Public site\n');
  const base = commit(repo, 'safe base');
  stage(repo, 'private-delivery.zip', Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  commit(repo, 'add private file');
  git(repo, 'rm', 'private-delivery.zip');
  const head = commit(repo, 'remove private file');
  assert.deepEqual(api().validateCommitRepository(repo, head), { commits: 1, entries: 1, objects: 1 });
  assert.throws(() => api().validateOutgoingRepository(repo, outgoing(head, base)), /Unapproved public repository path/);
});

test('deletion ref update skips outgoing content', (t) => {
  const repo = repository(t);
  assert.deepEqual(api().validateOutgoingRepository(repo, outgoing(zero, zero)), { commits: 0, entries: 0, objects: 0 });
  const result = spawnSync(process.execPath, [guard, '--push'], {
    cwd: repo, encoding: 'utf8', input: `refs/heads/main ${zero} refs/heads/main ${zero}\n`,
  });
  assert.equal(result.status, 0, result.stderr);
});

test('missing remote object fails with fetch guidance', (t) => {
  const repo = repository(t);
  stage(repo, 'README.md', '# Public site\n');
  const head = commit(repo, 'safe');
  assert.throws(() => api().validateOutgoingRepository(repo, outgoing(head, 'f'.repeat(40))), /fetch/i);
});

test('pre-push CLI parses real ref updates and rejects malformed input', (t) => {
  const repo = repository(t);
  stage(repo, 'README.md', '# Public site\n');
  const head = commit(repo, 'safe');
  const good = spawnSync(process.execPath, [guard, '--push'], {
    cwd: repo, encoding: 'utf8', input: `refs/heads/main ${head} refs/heads/main ${zero}\n`,
  });
  assert.equal(good.status, 0, good.stderr);
  const malformed = spawnSync(process.execPath, [guard, '--push'], {
    cwd: repo, encoding: 'utf8', input: 'refs/heads/main nonsense refs/heads/main 123\n',
  });
  assert.notEqual(malformed.status, 0);
  assert.match(malformed.stderr, /ref|SHA|update/i);
  const missingField = spawnSync(process.execPath, [guard, '--push'], {
    cwd: repo, encoding: 'utf8', input: 'refs/heads/main only-two-fields\n',
  });
  assert.notEqual(missingField.status, 0);
});

test('head CLI reads committed Git objects and validates arguments', (t) => {
  const repo = repository(t);
  stage(repo, 'README.md', '# Public site\n');
  commit(repo, 'safe');
  assert.equal(run(repo, '--head').status, 0);
  assert.notEqual(run(repo, '--unexpected').status, 0);
});
