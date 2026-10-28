# Quality review

Report prepared on **2026-10-28** for static candidate **1.0.0-rc.2**, branch `simplify/static-contact`, based on `main` commit `3316bc7` after PR #3 merged. This candidate has not been merged or deployed; no DNS change was made. The Pages publishing source remains unverified; see [DEPLOYMENT.md](DEPLOYMENT.md).

## Current scope

Local profile/media and direct links replace the previous integrations. Work/Posts lead to Telegram, Projects to all repositories, and Contact retains `/feedback/`. There is no backend, CAPTCHA, embedded feed, synchronization or required credential. Earlier service tests do not validate this revision.

UX changes include email copying where supported, a sticky mobile-menu close control, current-page labeling and an infinity SVG. Native hero/artwork playback retains still previews and motion controls.

## Completed source and build checks

- `npm run check` passed: source checks inspected **231 files**, Astro reported **0 errors, 0 warnings and 0 hints across 24 files**, and build checks validated **12 routes**.
- The dependency audit reported **0 known vulnerabilities**, not a security certification.
- Read-only checks confirmed matching CNAME values, `dist/`-only publication and the main/repository guard. The build scan found no tested secret patterns, removed service runtime, external HTML resources, forms or iframes.
- Documentation links, version consistency and service removal were checked. Account settings and live production remain unverified.

## Browser verification

The final focused run passed **96 of 96 tests**. Combined with unaffected checks from the initial run, the latest result for each of **171 unique browser checks is passing**, with no unresolved failures or skips: Chromium 74, Firefox 48, WebKit 49. This is a combined local result, not a green full-suite rerun. [browser-summary.json](qa/browser-summary.json) retains both run histories. The GitHub check must independently validate the complete suite on the pushed commit.

The initial run recorded **131 passed and 4 failed out of 135 tests**. Three failures incorrectly expected an avatar on Home; the corrected test checks About and passed in every engine. The fourth was a Firefox menu input timeout. Its trace eventually showed the destination loaded; the unchanged interaction then passed on the final build. No action deadline or functional assertion was relaxed to resolve that failure.

The completed layout matrix covers 12 routes in Chromium, Firefox and WebKit at 320, 360, 390, 768, 1024 and 1440px in both themes: **432 viewport cases**. Twenty-four axe checks passed across six main pages, both themes and mobile/desktop. Other passing checks cover keyboard access, preference persistence, external-request absence, direct URLs, static SEO/social assets, local profile fallback and native motion. Clipboard UI checks use deterministic success/denial/no-API fixtures and verify focus and stable layout at 320px; they do not send messages or inspect the user's clipboard.

Each matrix test contains 12 viewport steps and four full-page captures. Its overall deadline is 120 seconds to accommodate capture work; individual action deadlines remain unchanged. The full suite contains 171 cases on Windows and 170 on Linux because one diagnostic specifically targets Windows WebKit. That platform can stop native H.264 looping; tests verify the visible still fallback rather than claiming uninterrupted playback where the independent media probe fails.

## Performance

Lighthouse 13.5.0, local mobile simulation, sequential audits without concurrent acceptance browsers. All seven final samples and earlier diagnostic readings are retained in [lighthouse-summary.json](qa/lighthouse-summary.json).

| Page | Samples | Performance | Observed range | LCP | TBT | CLS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | 3 | 98 median | 94-98 | 2.24 s median | 51 ms median | 0 |
| Work | 1 | 100 | 100 | 1.51 s | 0 ms | 0 |
| Projects | 1 | 100 | 100 | 1.53 s | 0 ms | 0 |
| Posts | 1 | 100 | 100 | 1.52 s | 0 ms | 0 |
| Contact | 1 | 100 | 100 | 1.53 s | 0 ms | 0 |

Accessibility, Best Practices and SEO scored **100 in all seven final samples**. The four destination pages have one final sample each, not a repeatability distribution. These are lab measurements, not field Core Web Vitals or a production guarantee.

Earlier Home readings were 63, 35 and 37; changing page order produced a diagnostic 91. A browser trace identified expensive initial layout and delayed body-font requests before animation startup. Preloading the approximately 25 KB local Manrope font produced the final 98, 94 and 98 readings. The existing artwork and animation remain intact. No audit-specific behavior, user-agent detection or benchmark delay is used.

## Visual evidence

These real Playwright captures were refreshed from the final build with motion paused for reproducibility. Review both themes and mobile layouts:

- Home: [light desktop](previews/home-light-desktop.png), [dark desktop](previews/home-dark-desktop.png), [light mobile](previews/home-light-mobile.png), [dark mobile](previews/home-dark-mobile.png).
- Work: [light desktop](previews/work-light-desktop.png), [dark mobile](previews/work-dark-mobile.png).
- Contact: [light desktop](previews/contact-light-desktop.png), [dark mobile](previews/contact-dark-mobile.png).
- More destinations: [Projects desktop](previews/projects-light-desktop.png), [Posts mobile](previews/posts-dark-mobile.png).

## Remaining limits

No complete human screen-reader audit, native Safari/device review or legal accessibility/privacy assessment is claimed. Playwright WebKit is not equivalent to every Safari installation. The verified public Telegram destinations returned HTTP 200 during review, but external availability and actual message/email delivery are outside the static site's control. The candidate still needs owner review, correct Pages configuration and post-publication verification. No release is implied by passing local checks.
