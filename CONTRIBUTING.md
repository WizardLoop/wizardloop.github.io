# Contributing to WizardLoop

This repository is the source of one creator's personal website. Contributions should improve that website while preserving the owner's identity, verified content and control over publication.

For a small correction, open a focused pull request. Discuss substantial visual changes, new services or dependencies in an issue first. Never disclose credentials, personal submissions or a vulnerability in a public issue or pull request; use [SECURITY.md](SECURITY.md).

## Working locally

1. Read the [README](README.md), relevant service guide and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
2. Use a dedicated branch or fork. Do not work directly on `main` or alter another repository as part of this project.
3. Install locked dependencies with `npm ci` using Node 22.23.4 or newer.
4. Run `npm run dev`. The frontend and optional `npm run dev:feedback` mock require no live credentials.
5. Make the smallest coherent change. Keep content, styles, browser interactions and private integrations in their existing locations.

Do not change `wizardloop.com`, either CNAME file, production settings or deployment behavior as incidental cleanup. Such changes need a specific proposal and owner approval.

## Content, design and accessibility

- Use English by default and preserve correct direction handling for Hebrew content.
- Verify project links and factual claims. Do not invent clients, achievements, personal details or social profiles.
- Use a regular hyphen instead of the em dash character U+2014 in controlled content, metadata and documentation.
- Keep keyboard access, visible focus, semantic headings, readable contrast and small-screen layouts. Honor reduced motion and the global motion control.
- Keep useful static content when JavaScript or a third party fails. Avoid heavy dependencies for effects that local CSS or existing components can provide.
- Preserve media attribution. MIT code contributions do not relicense the owner's artwork or third-party assets. Record the source and license of any new font, icon, media or dependency.

## Validation and pull requests

Run `npm run check`. For layout or interaction changes, build the site and run relevant Playwright checks, including `npm run test:browsers` when browser behavior changes. Follow service-specific tests for profile, posts or feedback changes. Do not write redundant tests for a simple text correction; existing content/build checks still apply.

A useful pull request describes the concrete problem, resulting behavior, validation and remaining limits. Include desktop/mobile screenshots for visual changes and both themes where relevant. Identify mocks and fixtures explicitly. Do not report an external integration as verified unless it was exercised with authorized credentials.

Keep lockfile changes with dependency changes. Do not commit `node_modules`, build output, test artifacts, `.env`, `.dev.vars`, sessions, private chat IDs, submitted messages or tokens. Check the diff for accidentally included local files before submitting.

Owner review governs design and content acceptance. A pull request does not authorize merging, deploying, enabling services, creating releases or changing DNS. Follow [DEPLOYMENT.md](docs/DEPLOYMENT.md) for those separate operations.

By submitting new source code, you offer it under the repository's MIT license. Only submit material you have the right to contribute, and identify any different asset license. Participation is subject to the [Code of Conduct](CODE_OF_CONDUCT.md).
