# Changelog

These headings record source changes. They do not establish that a Git tag, GitHub Release or production deployment exists.

## 1.0.0-rc.2 - Unreleased

- Simplify the site to static GitHub Pages with manually maintained profile content and local media.
- Replace the feedback form with verified direct contact links while preserving `/feedback/`.
- Add an accessible email-copy action, persistent mobile-menu close control and visible current-page navigation.
- Refine the illustrated destination pages around original ink, paper, star and infinity artwork; keep the creator's existing wizard identity and motion.
- Preload the local body font to reduce initial text-layout work; record fresh Lighthouse measurements and broader three-engine responsive coverage.
- Direct Work and Posts visitors to the original Telegram channel and Projects visitors to all GitHub repositories; retain the existing page URLs.
- Remove automatic profile/post services, the feedback backend, CAPTCHA setup, related fixtures and obsolete operational instructions.
- Remove embedded-feed loading and explain the current external-link behavior in privacy, security and accessibility information.
- Publish validated `dist/` output on pushes to `main`, with a manual retry option. Require lint, typecheck, build and browser checks before deployment; keep deployment permissions in the deploy job.
- Document the one-time GitHub Actions publishing-source setting, direct content editing, verification and rollback. No DNS change or additional service credentials are required.

Current validation and known limits are recorded in [QA.md](docs/QA.md). This candidate does not claim completed legal conformance, human screen-reader review or a verified production release.

## 1.0.0-rc.1 - Earlier review candidate

- Rebuilt the personal site with Astro and the selected Spectrum Circuit direction, comic framing and the owner's wizard illustrations.
- Added responsive pages, themes, navigation, motion preferences, semantic metadata, static social artwork and domain-preserving builds.
- Included 30 original wizard animations, six flag samples, retained TGS sources, transparent posters and provenance manifests.
- Added native hero video and static fallbacks for decoders that stop or freeze, plus browser, accessibility and performance checks.
- Prototyped private profile/post synchronization and a feedback backend. Those components were removed in `1.0.0-rc.2` after the owner chose a simpler static scope. Their earlier code and review evidence remain in Git history.

The earlier service tests are historical evidence, not verification of a current live service. No release is implied by this entry.

## Earlier baseline

The original four-file website remains in Git history at `658ed667c173f861cd16e6048126de12ec3648b9`, dated 2025-07-20. The initial audit found no tags or GitHub Releases; recheck before creating any release. Do not assign a historical semantic version retrospectively. Phase 1 tooling used `0.1.0-preview.1` for the three local concepts, not a production release.
