# Quality review and publication records

I keep each version's measurements and publication evidence separate. A documentation update does not relabel older test results as new validation.

## Repository update - 1.0.0-rc.4

published successfully on **2026-10-29** , on `docs/repository-refresh-rc4` from the published `062bdad623c53c2bd10661c3fe578f1cfc62b2b2` baseline. I improved the README presentation, corrected publication records, clarified contribution/review guidance and updated the package and lockfile version metadata. I changed no website source, public assets, dependencies, tests or workflows.

I passed `npm run check`: source rules, formatting, **0 Astro errors/warnings/hints across 25 files** and the **12-route static build**. I checked **78 relative links and anchors across 13 Markdown files**, matched all three package/lockfile version entries, and confirmed that dependencies and all website, test and workflow files are unchanged.

I reviewed a local GFM-style rendering of the README at **390px and 1024px**, in light and dark modes. All images loaded, the five tables rendered, the collapsible details opened and closed, and the document had no horizontal overflow. This is a local layout check with the installed Markdown renderer and review CSS, not an exact screenshot of GitHub. The check summary and captures are local, ignored artifacts under `artifacts/repository-review.json` and `artifacts/readme-*.png`.

The website screenshots and measurements below remain rc.3 evidence. My existing branch CI runs fresh browser and Lighthouse checks after this update is pushed; I do not reuse the old measurements as its results. This repository update has not been merged or deployed.

## Website review - 1.0.0-rc.3

I recorded the following results on **2026-10-28** for **1.0.0-rc.3** on `polish/studio-motion-and-marks`, based on `ef1157bd1d3f45420656864b5cfbf895d9128f3a`. After that review, [PR #5](https://github.com/WizardLoop/wizardloop.github.io/pull/5) merged at `062bdad623c53c2bd10661c3fe578f1cfc62b2b2`. [Deployment run 40700122492](https://github.com/WizardLoop/wizardloop.github.io/actions/runs/40700122492) passed all **185 browser checks** and published successfully on **2026-10-28**. I then verified live HTTPS 200 and the Silver Grimoire and SVG mark on Home. That publication does not imply a Git tag or GitHub Release.

### What I changed

I added my Silver Grimoire animation to Home, About and Posts, with local still previews and the existing motion controls. I replaced decorative star glyphs with a reusable SVG mark, cached animation source data while isolating each player's mutable copy, and added a manual poster-generation command. I also rewrote my public copy and repository prose in my first-person voice.

My site remains static: local profile/media, direct Telegram and GitHub links, and Contact at the retained `/feedback/` URL. I added no backend, CAPTCHA, embedded feed, synchronization service or credential requirement.

### Source and build checks

- `npm run check` passed. Astro reported **0 errors, 0 warnings and 0 hints across 25 files**; the build validated **12 routes** and generated **37 delivery previews**.
- My dependency audit earlier in this review reported **0 known vulnerabilities**. That is not a complete security audit or certification.
- I retained `wizardloop.com`, the CNAME declarations and `dist/`-only publication. My public build checks cover local assets, links, metadata and controlled-content punctuation.

### Browser results and correction history

I ran the complete local suite on Windows against the built site at `http://127.0.0.1:4322`, with one Playwright worker and retries disabled. The initial run recorded **183 passed and 3 failed out of 186 tests**.

All three failures came from the same outdated profile-alt assertion, once per engine. The test expected the word `WizardLoop`, while my revised first-person text was `My public profile artwork`. I corrected only that test expectation and reran the affected cases: **3 of 3 passed**. I changed no served application source between the full run and the focused verification; only the assertion and documentation changed.

The latest result for each of **186 unique browser checks is passing**: **Chromium 79, Firefox 53 and WebKit 54**, with no unresolved failures or skips. I report this as a combined result, **not a green full-suite local rerun**. [browser-summary.json](qa/browser-summary.json) retains both histories, the original failure messages and platform notes. Raw reports remain in ignored `artifacts/rc3-initial-full-results.json` and `artifacts/rc3-profile-results.json`.

I then independently passed the complete **185-case Linux suite** in [GitHub run 40695410701](https://github.com/WizardLoop/wizardloop.github.io/actions/runs/40695410701), at application commit `4158b20978d02241db478da2101dae3409de22bc`, with no failures or skips. That run took 2.3 minutes for browser checks. Linux omits the Windows-specific native-video diagnostic. [ci-summary.json](qa/ci-summary.json) records the remote evidence. The subsequent report-only update changes no application code, dependencies or workflow.

My responsive matrix covers 12 routes, three engines, six widths (320, 360, 390, 768, 1024 and 1440px) and both themes: **432 viewport cases**. **24 axe checks passed** across six main pages, both themes and mobile/desktop. The suite also checks direct navigation, keyboard/focus behavior, mobile-menu scrolling, theme/motion persistence, local profile fallback, static SEO/social assets and the absence of unsolicited external requests. Clipboard tests use controlled success, denial and unavailable-API fixtures; they do not inspect a visitor's clipboard or send a message.

### Motion and platform evidence

All new motion checks passed. I verified changing Canvas pixels for Silver Grimoire in its three layouts, stable layout dimensions, pause/resume, reduced motion, failed-asset fallbacks and repeated placements. Repeated instances share one source download while retaining independent canvases and the playback limit.

I tested the registered `pagehide` and `pageshow` handlers with synthetic events. Those tests verify cleanup and reinitialization logic; they do **not** establish a real browser back-forward-cache restoration.

Windows WebKit decoded and advanced the native hero MP4, then stopped across its first loop. I reproduced that limitation in a bare video without application code and verified the application's visible still fallback. I do **not** report uninterrupted native looping as supported in that measured environment. Playwright WebKit is not equivalent to every native Safari installation.

### Visual review

I made **20 additional visual captures**, with **zero errors recorded by that capture pass**. The refreshed review images include both themes, mobile layouts, the new artwork placements and the SVG marks:

- Home: [light desktop](previews/home-light-desktop.png), [dark desktop](previews/home-dark-desktop.png), [light mobile](previews/home-light-mobile.png), [dark mobile](previews/home-dark-mobile.png).
- About: [light desktop](previews/about-light-desktop.png), [dark mobile](previews/about-dark-mobile.png).
- Home studio section: [dark desktop](previews/studio-dark-desktop.png), [light mobile](previews/studio-light-mobile.png).
- Posts: [light desktop](previews/posts-light-desktop.png), [dark mobile](previews/posts-dark-mobile.png).
- Work: [light desktop](previews/work-light-desktop.png), [dark mobile](previews/work-dark-mobile.png).
- Contact: [light desktop](previews/contact-light-desktop.png), [dark mobile](previews/contact-dark-mobile.png).
- Projects: [light desktop](previews/projects-light-desktop.png).

### Performance

I measured the built site with Lighthouse 13.5.0, Chrome 149 and simulated mobile throttling on Windows, after closing the acceptance browsers. I retained all ten samples in [lighthouse-summary.json](qa/lighthouse-summary.json).

| Page | Samples | Performance median | Range | LCP median | TBT median | Maximum CLS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | 3 | 57 | 38-83 | 6.08 s | 473 ms | 0.0082 |
| About | 3 | 95 | 90-98 | 1.74 s | 258 ms | 0 |
| Work | 1 | 95 | 95 | 1.80 s | 20 ms | 0 |
| Projects | 1 | 98 | 98 | 1.58 s | 48 ms | 0 |
| Posts | 1 | 98 | 98 | 1.66 s | 152 ms | 0 |
| Contact | 1 | 100 | 100 | 1.54 s | 0 ms | 0 |

Accessibility and Best Practices scored 100 in all ten samples. SEO scored 100 in nine; the first Home sample scored 92 because the audit timed out fetching `robots.txt`. Direct verification returned 200 with valid content, and both repeated Home audits scored SEO 100. I retain the original result.

**Home did not meet my 90 performance target in these Windows samples.** The reports show variable initial style/layout work before any TGS or Lottie request. The affected runs used identical payloads; the current evidence does not establish the root cause. I tried preloading the existing Cormorant font, measured Home at 61 and reverted that experiment because it did not resolve the delayed first paint. Its two samples remain separately recorded, outside the final-source distribution.

I added an independent Linux Lighthouse pass to development-branch CI, with HTML/JSON reports, raw traces and network logs retained as the `mobile-lighthouse-results` artifact. A failed audit execution fails CI; numeric scores are recorded without a flaky score threshold.

The successful [same-revision Linux run](https://github.com/WizardLoop/wizardloop.github.io/actions/runs/40695410701) measured one sample per page:

| Page | Performance | Accessibility | Best Practices | SEO | LCP | TBT | CLS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | 98 | 100 | 100 | 100 | 2.25 s | 0 ms | 0 |
| About | 97 | 100 | 100 | 100 | 2.47 s | 4 ms | 0 |
| Work | 100 | 100 | 100 | 100 | 1.51 s | 0 ms | 0 |
| Projects | 100 | 100 | 100 | 100 | 1.52 s | 0 ms | 0 |
| Posts | 98 | 100 | 100 | 100 | 2.23 s | 9 ms | 0 |
| Contact | 100 | 100 | 100 | 100 | 1.51 s | 0 ms | 0 |

These independent readings meet the 90 target in that environment. They do not erase the lower Windows measurements or establish their cause. I keep the environments separate, retain all samples and do not equate lab results with field Core Web Vitals or universal device performance. The complete remote samples are in [ci-summary.json](qa/ci-summary.json).

### Historical baseline and publication

My preceding rc.2 baseline was merged through [PR #4](https://github.com/WizardLoop/wizardloop.github.io/pull/4) at `ef1157b` and verified in production on 2026-10-28. [Deployment run 40679459115](https://github.com/WizardLoop/wizardloop.github.io/actions/runs/40679459115) passed 170 browser tests. Its local results and performance measurements remain in the [pinned rc.2 QA report](https://github.com/WizardLoop/wizardloop.github.io/blob/ef1157bd1d3f45420656864b5cfbf895d9128f3a/docs/QA.md). Those historical results do not validate rc.3.

I made no DNS or hosting-setting changes in this review. [DEPLOYMENT.md](DEPLOYMENT.md) records the verified rc.3 publication, the separate failed legacy Jekyll build and the publishing-source and recovery requirements. Passing local checks alone does not merge, deploy, tag or release a revision.

### Remaining limits

I have not completed a full human screen-reader audit, native Safari/device review or legal accessibility/privacy assessment. Automated checks do not establish full accessibility or legal conformance. External services control their own availability, and opening a Telegram or email link does not verify message delivery. The local Home performance limitation remains recorded above. I require review and publication approval for future changes, including the rc.4 repository update.
