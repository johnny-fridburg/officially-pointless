# Officially Pointless

Eight fictional gifts and playful browser tools, hosted on Azure Static Web Apps.

Current version is free. It has no live checkout, public auction, payment claims, or transmitted image inputs. The API explicitly reports checkout closed. Seller setup and the purchased deliverable must be verified before any sales are enabled.

This repository contains only deployable site files, a closed billing-status API and its deployment workflow. Credentials are stored separately as repository secrets. The source code and original artwork are copyright their creator; no commercial redistribution license is granted here. Published previews may be used for personal non-commercial gifts under the site's use terms.

Run `node --test api/commerce.test.js` before deployment. Deployment is pinned to upstream action commits and runs only on main or a manual dispatch.
