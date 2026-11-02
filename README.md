# Officially Pointless

Eight fictional gifts and playful browser tools, hosted on Azure Static Web Apps.

Current version is free. It has no live checkout, public auction, payment claims, or transmitted image inputs. The API explicitly reports checkout closed. Seller setup and the purchased deliverable must be verified before any sales are enabled.

This repository contains only deployable site files, a closed billing-status API and its deployment workflow. Credentials are stored separately as repository secrets. The source code and original artwork are copyright their creator; no commercial redistribution license is granted here. Published previews may be used for personal non-commercial gifts under the site's use terms.

Run `node --test`, `node scripts/verify-public-artifact.js site`, and `node scripts/verify-public-repository.js --head` before deployment. Deployment is pinned to upstream action commits and runs only on main or a manual dispatch.

In this **public repository only**, install the local publication hooks with `git config core.hooksPath .githooks`. The pre-commit hook checks the Git index, and the pre-push hook checks every commit being sent, including files added and removed before the final commit. The reviewed 31-path policy is in `.public-files.json`; changes to that list need a fresh publication review. CI checks the committed tree again before upload.

These checks block unreviewed paths, nonregular Git entries, unexpected file formats, ZIP signatures, and recognizable credential markers. The three reviewed static assets also have fixed SHA-256 pins; replacing one requires review and an intentional policy change. Other content checks are heuristic defenses, not DRM or proof of content provenance. Keep the private source root and paid ZIP outside this public repository.
