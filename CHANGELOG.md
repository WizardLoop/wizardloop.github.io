# Changelog

I record source changes here and identify verified deployments separately. A version heading alone does not establish that a Git tag or GitHub Release exists.

## 1.0.0-rc.4 - Unreleased

- I redesigned my README with a visual introduction, quick navigation, a publication-status table and clearer setup, editing and documentation guides.
- I recorded the verified publication date and deployment evidence for rc.3, keeping that published website separate from this repository update.
- I clarified first-person writing, documentation-only validation and version maintenance in my contribution guide and pull request template.
- I updated my package and lockfile version metadata together. I changed no website source, media, dependencies, tests or workflows.

This repository-only update is prepared for review. I have not merged or deployed it, created a Git tag or published a GitHub Release.

## 1.0.0-rc.3 - Deployed 2026-10-28

- I added Silver Grimoire to Home, About and Posts, with local still previews and the existing motion controls.
- I replaced decorative star glyphs with an original reusable SVG mark so the design does not depend on a device's emoji font.
- I cached animation source data and isolated each player's mutable copy so repeated artwork placements can run independently.
- I added a manual poster-generation command for animation asset editing.
- I added regression checks for SVG identity, delayed animation loading, independent playback and lifecycle recovery, plus Linux Lighthouse reports in review CI.
- I rewrote my site and repository prose in my own first-person voice while preserving factual history and third-party legal notices.

I published this version after [PR #5](https://github.com/WizardLoop/wizardloop.github.io/pull/5) merged at `062bdad623c53c2bd10661c3fe578f1cfc62b2b2`. [Deployment run 40700122492](https://github.com/WizardLoop/wizardloop.github.io/actions/runs/40700122492) completed successfully on **2026-10-28 at 15:57:11 Asia/Jerusalem (13:57:11 UTC)**. I verified HTTPS 200 and the Silver Grimoire artwork and SVG mark on my live Home page. This publication record does not imply a Git tag or GitHub Release. I retain the version's measured checks and known limits in [QA.md](docs/QA.md).

## 1.0.0-rc.2 - Deployed 2026-10-28

- I simplified my site to static GitHub Pages with manually maintained profile content and local media.
- I replaced the feedback form with verified direct contact links while preserving `/feedback/`.
- I added an accessible email-copy action, persistent mobile-menu close control and visible current-page navigation.
- I refined my illustrated destination pages around original ink, paper, star and infinity artwork while retaining my wizard identity and motion.
- I preloaded my local body font to reduce initial text-layout work and recorded fresh Lighthouse measurements and broader three-engine responsive coverage.
- I directed Work and Posts visitors to my Telegram channel and Projects visitors to all my GitHub repositories, retaining the existing page URLs.
- I removed automatic profile/post services, the feedback backend, CAPTCHA setup, related fixtures and obsolete operational instructions.
- I removed embedded-feed loading and explained external-link behavior in my privacy, security and accessibility information.
- I configured publication of validated `dist/` output on pushes to `main`, with a manual retry option. Lint, typecheck, build and browser checks run before deployment; deployment permissions stay in the deploy job.
- I documented the one-time GitHub Actions publishing-source setting, direct content editing, verification and rollback. I made no DNS change and added no service credentials.

I merged this baseline through [PR #4](https://github.com/WizardLoop/wizardloop.github.io/pull/4) at `ef1157b` and verified it in production on 2026-10-28. [Deployment run 40679459115](https://github.com/WizardLoop/wizardloop.github.io/actions/runs/40679459115) passed 170 browser tests. I retain its local validation and known limits in the [pinned rc.2 QA report](https://github.com/WizardLoop/wizardloop.github.io/blob/ef1157bd1d3f45420656864b5cfbf895d9128f3a/docs/QA.md). I do not claim completed legal conformance or a human screen-reader review.

## 1.0.0-rc.1 - Earlier review candidate

- I rebuilt my personal site with Astro, the Spectrum Circuit direction, comic framing and my wizard illustrations.
- I added responsive pages, themes, navigation, motion preferences, semantic metadata, static social artwork and domain-preserving builds.
- I included 30 original wizard animations, six flag samples, retained TGS sources, transparent posters and provenance manifests.
- I added native hero video and static fallbacks for decoders that stop or freeze, plus browser, accessibility and performance checks.
- I prototyped private profile/post synchronization and a feedback backend. I removed those components in `1.0.0-rc.2` when I chose a simpler static scope. Their earlier code and review evidence remain in Git history.

I keep the earlier service tests as historical evidence, not verification of a current live service. This entry does not imply a release.

## Earlier baseline

My original four-file website remains in Git history at `658ed667c173f861cd16e6048126de12ec3648b9`, dated 2025-07-20. My initial audit found no tags or GitHub Releases; recheck before creating any release. I have not assigned a historical semantic version retrospectively. I used `0.1.0-preview.1` for the three local concepts' Phase 1 tooling, not a production release.
