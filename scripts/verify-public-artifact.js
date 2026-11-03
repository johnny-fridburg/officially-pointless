'use strict';

const fs = require('node:fs');
const path = require('node:path');

const requiredFiles = new Set([
  'index.html',
  'assets/gift-kit-cover.png',
  'ministry-title-gift/index.html',
  'gift-kit/index.html',
  'privacy/index.html',
  'terms/index.html',
  'contact/index.html',
  'sales-status/index.html',
  'staticwebapp.config.json',
]);

const allowedFiles = new Set([...requiredFiles, 'assets/checkout.js']);
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
