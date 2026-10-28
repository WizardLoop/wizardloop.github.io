# Contributing to WizardLoop

This repository is my personal website. Please preserve my identity, verified content and control over publication when contributing. Open focused pull requests for corrections, and discuss major visual changes or dependencies with me first. Report vulnerabilities privately through [SECURITY.md](SECURITY.md).

## Local work

1. Read [README.md](README.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
2. Use a dedicated branch or fork. Do not work directly on `main` or modify another repository as part of this project.
3. Install Node 22.23.4 or newer, run `npm ci`, then `npm run dev`.
4. Edit content, styles and browser interactions in their documented locations. No service credentials or mock server are needed.

Preserve `wizardloop.com`, both source CNAME files and existing public routes. I review hosting or domain changes as separate proposals. Keep my site static unless I explicitly request a different architecture.

## Content and interface

- Use English by default and correct direction handling for Hebrew.
- Write my personal site copy and repository narrative in first person, as WizardLoop: "I updated my site", not "I built this for the owner". Preserve third-party legal notices and factual attribution.
- Verify claims and links. Do not invent clients, achievements or profiles.
- Use a regular hyphen instead of U+2014 in controlled content and metadata.
- Preserve keyboard access, visible focus, semantic headings, contrast and narrow-screen layouts. Honor reduced motion and the global motion control.
- Keep useful content when JavaScript fails. Do not load external scripts or media merely to display a link to another service.
- Record asset provenance and licensing. MIT code contributions do not relicense my branding or artwork.

## Validation and review

Run `npm run check`. For layout or interaction changes, run relevant browser tests against the built site; use `npm run test:browsers` for browser behavior changes. Do not add redundant tests for a simple text correction; existing content/build checks still apply.

Describe the concrete change, validation actually performed and remaining limits. Include desktop/mobile screenshots and both themes for visual changes. Do not treat older QA reports as verification of the new revision.

For documentation-only changes, check Markdown links and anchors, referenced images, factual dates and version consistency, then run `npm run check`. State that visitor behavior is unchanged. Existing CI still runs the browser and Lighthouse suites; a prose edit does not need a new screenshot or a new test that mirrors the text.

When changing my source version, update `package.json`, both root version entries in `package-lock.json`, and `CHANGELOG.md` together. Check existing tags and Releases first. Keep the new entry unreleased until publication is verified; record the actual deployment date and workflow when marking a version published. Preserve historical QA versions and measurements rather than changing their labels to the newest version. A published website does not automatically create a Git tag or GitHub Release.

Keep lockfile updates with dependency changes. Exclude installed packages, build output, test artifacts, `.env` files, credentials and personal messages. Review the diff before submitting.

**A merge I approve into `main` triggers publication after checks pass.** Creating a pull request does not authorize someone else to merge it. Confirm publication readiness with me before merging and follow [DEPLOYMENT.md](docs/DEPLOYMENT.md). I decide separately about tags, releases and DNS changes.

New source contributions are offered under the repository's MIT license. Submit only material you may contribute and identify any different asset license. Participation follows [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
