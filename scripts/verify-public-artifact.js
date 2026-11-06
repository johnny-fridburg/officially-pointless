'use strict';

const fs = require('node:fs');
const path = require('node:path');

const requiredFiles = new Set([
  "assets/checkout.js",
  "assets/gift-kit-cover.png",
  "contact/index.html",
  "gift-kit/index.html",
  "index.html",
  "ministry-title-gift/index.html",
  "privacy/index.html",
  "robots.txt",
  "sitemap.xml",
  "sales-status/index.html",
  "staticwebapp.config.json",
  "terms/index.html",
  "assets/departments.js",
  "departments/access/index.html",
  "presence/index.html",
  "departments/make-it-worse/index.html",
  "assets/departments/make-it-worse.png",
  "departments/silence/index.html",
  "assets/departments/silence.png",
  "departments/loading/index.html",
  "assets/departments/loading.png",
  "departments/last-word/index.html",
  "assets/departments/last-word.png",
  "departments/museum/index.html",
  "assets/departments/museum.png",
  "departments/golden-error/index.html",
  "assets/departments/golden-error.png",
  "departments/button/index.html",
  "assets/departments/button.png",
  "departments/empty-wing/index.html",
  "assets/departments/empty-wing.png",
  "departments/unnecessary-ribbon/index.html",
  "assets/departments/unnecessary-ribbon.png",
  "departments/invisible-monument/index.html",
  "assets/departments/invisible-monument.png",
  "departments/index.html",
  "assets/product-dispatch.js",
  "certificates/minister-of-unopened-tabs/index.html",
  "certificates/secretary-of-one-more-coffee/index.html",
  "certificates/director-of-unnecessary-meetings/index.html",
  "certificates/chief-of-the-snack-drawer/index.html",
  "certificates/commissioner-of-replying-tomorrow/index.html",
  "assets/certificates/minister-of-unopened-tabs.png",
  "assets/certificates/secretary-of-one-more-coffee.png",
  "assets/certificates/director-of-unnecessary-meetings.png",
  "assets/certificates/chief-of-the-snack-drawer.png",
  "assets/certificates/commissioner-of-replying-tomorrow.png",
  "assets/gifts.js",
  "assets/gifts.css",
  "gifts/index.html",
  "gifts/create/index.html",
  "gifts/view/index.html",
  "people/index.html"
]);

const allowedFiles = new Set(requiredFiles);
const allowedDirectories = new Set();
for (const file of allowedFiles) {
  let directory = path.posix.dirname(file);
  while (directory !== '.') {
    allowedDirectories.add(directory);
    directory = path.posix.dirname(directory);
  }
}

function validatePublicArtifact(siteDirectory) {
  if (typeof siteDirectory !== 'string' || siteDirectory.length === 0) {
    throw new Error('An explicit site directory is required');
  }

  const root = path.resolve(siteDirectory);
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Public artifact root is not a regular directory: ${root}`);
  }

  const foundFiles = new Set();

  function visit(directory, relativeDirectory) {
    for (const name of fs.readdirSync(directory)) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      const absolutePath = path.join(directory, name);
      const stat = fs.lstatSync(absolutePath);

      if (stat.isSymbolicLink()) {
        throw new Error(`Symlink in public artifact: ${relativePath}`);
      }
      if (stat.isDirectory()) {
        if (!allowedDirectories.has(relativePath)) {
          throw new Error(`Unapproved directory in public artifact: ${relativePath}`);
        }
        visit(absolutePath, relativePath);
      } else if (stat.isFile()) {
        if (!allowedFiles.has(relativePath)) {
          throw new Error(`Unapproved file in public artifact: ${relativePath}`);
        }
        foundFiles.add(relativePath);
      } else {
        throw new Error(`Nonregular path in public artifact: ${relativePath}`);
      }
    }
  }

  visit(root, '');

  for (const file of requiredFiles) {
    if (!foundFiles.has(file)) {
      throw new Error(`Missing required public path: ${file}`);
    }
  }
}

module.exports = { validatePublicArtifact };

if (require.main === module) {
  if (process.argv.length !== 3) {
    console.error('Usage: node scripts/verify-public-artifact.js <site directory>');
    process.exitCode = 1;
  } else {
    try {
      validatePublicArtifact(process.argv[2]);
      console.log(`Public artifact verified: ${process.argv[2]}`);
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
