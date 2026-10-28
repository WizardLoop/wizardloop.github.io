# Changelog

This file records repository changes. A heading does not mean a Git tag, GitHub Release or production deployment exists.

## 1.0.0-rc.1 - Unreleased

### Website

- Rebuild the personal portfolio with Astro static output and the selected Spectrum Circuit direction, developed with comic framing and the owner's wizard illustrations.
- Add Home, About, Selected Work, Projects, Posts, Community, Feedback, Privacy, Cookies, Security, Accessibility and a custom 404 page.
- Add responsive navigation, light and dark themes, persistent preferences, keyboard controls, motion pause and reduced-motion behavior.
- Return the hero to a still preview when a native decoder stops unexpectedly, while preserving intentional user and visibility pauses.
- Detect a frozen native-video clock even when the decoder still reports playback, and avoid false failures after delayed timer callbacks.
- Include 30 original wizard animations and six flag samples, unchanged source TGS files, transparent posters and provenance manifests.
- Add page-specific metadata, structured data, static social artwork, favicons, sitemap output and domain-preserving builds.

### Services and tooling

- Add an isolated profile synchronization service with active-photo identity matching, video/still selection, cache, fallback and offline fixtures.
- Add consent-gated Telegram posts and a separately configured supported-update ingestion path. Original Telegram links remain available when embedded media is incomplete.
- Add a feedback Worker and local mock, server validation, Turnstile verification, private-chat setup and provider-mocked tests.
- Add source/build checks, browser coverage, accessibility checks, quality CI and an approval-gated manual Pages workflow.
- Correct the canvas media fixture, measure native loop capability independently from application code, and record actual encoded AVC metadata.
- Document setup, content editing, service limitations, asset rights, contribution, security reporting and release/rollback procedures.

### Review status

This is an unreleased review candidate. Measured browser, accessibility, performance and offline-service results are documented in [the quality review](docs/QA.md). Authenticated Telegram/profile media tests, live feedback delivery, native Safari and human screen-reader review, production validation, merge approval and release approval remain separate steps. Complete legal/accessibility conformance is not asserted.

## Earlier baseline

The original four-file website remains in Git history at `658ed667c173f861cd16e6048126de12ec3648b9` from 2025-07-20. The initial audit found no Git tags or GitHub Releases. Do not assign a historical semantic version retrospectively. Phase 1 tooling used `0.1.0-preview.1` while three local concepts were evaluated; it was not a production release.
