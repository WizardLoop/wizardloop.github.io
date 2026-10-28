# Contributing to WizardLoop

This repository is one creator's personal website. Contributions should preserve the owner's identity, verified content and control over publication. Open focused pull requests for corrections, and discuss major visual changes or dependencies first. Report vulnerabilities privately through [SECURITY.md](SECURITY.md).

## Local work

1. Read [README.md](README.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
2. Use a dedicated branch or fork. Do not work directly on `main` or modify another repository as part of this project.
3. Install Node 22.23.4 or newer, run `npm ci`, then `npm run dev`.
4. Edit content, styles and browser interactions in their documented locations. No service credentials or mock server are needed.

Preserve `wizardloop.com`, both source CNAME files and existing public routes. Hosting or domain changes require a specific owner-reviewed proposal. Keep the site static unless the owner explicitly requests a different architecture.

## Content and interface

- Use English by default and correct direction handling for Hebrew.
- Verify claims and links. Do not invent clients, achievements or profiles.
- Use a regular hyphen instead of U+2014 in controlled content and metadata.
- Preserve keyboard access, visible focus, semantic headings, contrast and narrow-screen layouts. Honor reduced motion and the global motion control.
- Keep useful content when JavaScript fails. Do not load external scripts or media merely to display a link to another service.
- Record asset provenance and licensing. MIT code contributions do not relicense the owner's branding or artwork.

## Validation and review

Run `npm run check`. For layout or interaction changes, run relevant browser tests against the built site; use `npm run test:browsers` for browser behavior changes. Do not add redundant tests for a simple text correction; existing content/build checks still apply.

Describe the concrete change, validation actually performed and remaining limits. Include desktop/mobile screenshots and both themes for visual changes. Do not treat older QA reports as verification of the new revision.

Keep lockfile updates with dependency changes. Exclude installed packages, build output, test artifacts, `.env` files, credentials and personal messages. Review the diff before submitting.

**An owner-approved merge into `main` triggers publication after checks pass.** Creating a pull request does not authorize someone else to merge it. Confirm publication readiness before merging and follow [DEPLOYMENT.md](docs/DEPLOYMENT.md). Tags, releases and DNS changes remain separate owner decisions.

New source contributions are offered under the repository's MIT license. Submit only material you may contribute and identify any different asset license. Participation follows [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
