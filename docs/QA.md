# Website quality review

Local review on **2026-10-27**, Windows, for unreleased `1.0.0-rc.1`. The selected Spectrum Circuit direction now uses WizardLoop's supplied wizard artwork, comic framing, local social icons and complete light/dark layouts. This report separates observed results from integrations that still need credentials or operational approval.

## Review locally

```sh
npm ci
npm run dev
```

Open [the website](http://127.0.0.1:4322), [the artwork collection](http://127.0.0.1:4322/work/), [posts](http://127.0.0.1:4322/posts/) or [feedback](http://127.0.0.1:4322/feedback/). Use the header controls to change theme and pause motion. The original three design studies run separately with `npm run dev:concepts` on port 4321; they are excluded from the final static build.

For a production-like local review, stop the development server, run `npm run build`, then `npm run preview -- --host 127.0.0.1 --port 4322`. Neither path publishes the site.

### Actual browser captures

| Theme | Desktop, 1440 x 1000 | Mobile, 390 x 844 |
| --- | --- | --- |
| Light | [View desktop](previews/home-light-desktop.png) | [View mobile](previews/home-light-mobile.png) |
| Dark | [View desktop](previews/home-dark-desktop.png) | [View mobile](previews/home-dark-mobile.png) |

These PNGs were captured from the built site with Playwright, with motion paused for reproducibility. Full-page route captures remain under `artifacts/final/`. `artifacts/final/wizardloop-home-animation.webm` records actual native hero animation; `hero-live-animation.png` captures a playing frame. The running local preview is the interactive example.

## Browser acceptance

### PR CI follow-up, 2026-10-28

The [first PR quality run](https://github.com/WizardLoop/wizardloop.github.io/actions/runs/40461052552) on Ubuntu 24.04 recorded **137 browser tests passed and 2 failed**. Formatting, source checks, typechecking, build, feedback unit tests and both Python test suites passed. The failures were confined to native-media tests in Linux WebKit:

- The hero advanced through its first clip, then its clock stopped while `paused` remained `false`. Listening only for `pause` and `error` missed that state. A lightweight progress monitor now returns to the labeled still preview after four seconds of observed nonprogress. It stops while motion is disabled, the hero is offscreen, the document is hidden, or the page is suspended. A long timer scheduling gap resets observation rather than misclassifying a busy main thread.
- The canvas-stream fixture painted before capture started and never produced another frame. Its unbounded `play()` wait timed out. The fixture now paints after capture starts, keeps producing frames, and uses bounded playback and clock assertions.

The native-media test now first measures the same MP4 in a bare video element without site code, attaching its timeline to the report. If that independent probe sustains playback, the full loop, theme and pause/resume assertions remain required. If it demonstrably stops or stalls, the test explicitly verifies the real site's still fallback and records the unsupported native loop in a platform annotation. It does not report fallback as successful uninterrupted playback. A separate frozen-clock fixture verifies the new monitor and preserves an intentional pause longer than its deadline.

The AVC manifest also now records the encoded codec `avc1.424029`, independently of the encoder's requested `avc1.42001F`; the original MP4 bytes are unchanged. Review the latest PR check run for the remote result of these corrections. The local results below describe the earlier review and remain historical evidence.

### Earlier local browser review, 2026-10-27

The complete serial run recorded **129 passed, 6 failed and 1 skipped** across 136 cases. Follow-up checks corrected no-JavaScript/HTML-attribute test assumptions, exposed the Windows native looping failure described below, and verified its graceful fallback after the application fix. The final affected-behavior run recorded **15 passed, 0 failed and 1 explicitly unsupported check** across 16 cases.

The latest result for each case is **138 passed, 0 unresolved failures and 2 skipped** across 140 unique engine/test combinations: Chromium 69 passed, Firefox 35 passed, and Windows WebKit 34 passed with 2 explicit limitations. This combines the complete run and focused rechecks; it is **not** a claim that a fresh complete local run was green. [The machine-readable summary](qa/browser-summary.json) preserves all six run histories and their failures. Full reports remain in `artifacts/final/`.

The two skipped checks are uninterrupted native looping in this Windows WebKit installation and its unsupported `canvas.captureStream()` profile-video fixture. A separate real-media check passed for the Windows native-loop fallback. Chromium and Firefox passed sustained hero playback across a full loop boundary, theme changes and intentional pause/resume.

Coverage includes all 12 routes, direct loads, local assets and browser errors; Chromium layouts at 320, 360, 390, 768, 1024 and 1440px in both themes; and selected Firefox/WebKit interaction coverage. The complete six-width matrix is not claimed for every engine.

Interaction checks cover keyboard navigation, visible focus, skip links, modal focus containment/return, Escape, fixed header, saved preferences, manual motion pause, reduced motion, tooltip dismissal, real native hero playback, Canvas motion, gallery reveal/focus, profile fallbacks, JavaScript-free content and metadata, consent-gated posts, pagination and feedback failures. Provider-mocked tests are identified as such.

The final accessibility scan set uses axe-core on Home, About, Work, Posts and Feedback at desktop/mobile sizes and in both themes. Automated checks do not replace a human screen-reader audit or establish legal conformance.

### Windows WebKit media behavior

The installed Windows WebKit uses its native Media Foundation backend. Its reported `videoWidth`/`videoHeight` can reflect destination dimensions, and native media requests can bypass Playwright route interception. This was checked against [the exact pinned WebKit source](https://github.com/WebKit/WebKit/blob/56453fdfe0b0ca6258c23e6453b34f70b885d13f/Source/WebCore/platform/graphics/win/MediaPlayerPrivateMediaFoundation.cpp#L1769): `BeginCreateObjectFromURL` loads the URL directly, destination dimensions configure output, and the resulting frame size becomes `naturalSize`.

The MP4 container and Chromium/Firefox decoding verify 768 x 768 source dimensions. Windows WebKit reports its native display size instead; failed-media tests use a genuinely missing server URL because interception is bypassed.

An uninterrupted probe also reproduced a native looping failure: both the real site and a bare video element advanced through the first 2.4-second clip, then became paused near the loop boundary without a JavaScript `pause()` call. Identical later video-frame captures confirmed that playback had stopped. This occurred before any screenshot, so an earlier screenshot-interference hypothesis was rejected. The native source sets a paused flag when a session ends, consistent with the observation, but the exact upstream cause is not established. Evidence is retained in `artifacts/final/webkit-capture-side-effect-probe.json`.

The site now returns to its still preview after an unexpected native pause while playback is allowed, instead of repeatedly forcing a restart. User pauses, theme transitions, offscreen/hidden content and stale queued pause events remain separate cases. A dedicated Windows WebKit check verifies the real fallback; successful native looping on this installation is explicitly unsupported, not reported as passing. Actual Safari on Apple hardware remains unverified.

## Measured performance

Lighthouse **13.5.0**, mobile simulation, built local preview, three sequential runs with no concurrent acceptance browsers. [All sample summaries](qa/lighthouse-summary.json) are committed. Full HTML/JSON reports remain in `artifacts/lighthouse-review/`, `artifacts/lighthouse-review-2/` and `artifacts/lighthouse-review-3/`.

| Page | Performance median | Observed range | Accessibility | Best Practices | SEO | Median LCP | Median TBT | Median CLS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Home | 92 | 59-97 | 100 | 100 | 100 | 2.58 s | 133 ms | 0.00005 |
| Work | 95 | 94-96 | 100 | 100 | 100 | 1.49 s | 241 ms | 0 |
| Posts | 100 | 66-100 | 100 | 100 | 100 | 1.52 s | 49 ms | 0 |
| Feedback | 99 | 98-100 | 100 | 100 | 100 | 1.67 s | 23 ms | 0.03183 |

Accessibility, Best Practices and SEO scored 100 in every one of these samples. Performance medians meet the 90+ target, but **not every run does**. Home and Posts had substantially slower initial-render outliers in the first run. Local machine and rendering variability remain material; these are lab results, not field Core Web Vitals or a guarantee of production performance. Median metrics are calculated individually rather than taken from one selected run.

These samples include the original performance changes. The first precedes the paused-menu CSS fix; later tooltip hover/Escape fixes do not alter the initial, unfocused rendering path. The subsequent native-pause fallback was event-driven. The PR follow-up adds a 500ms progress sample only during permitted native playback; these Lighthouse measurements predate that monitor and are not a fresh benchmark of it. No audit-specific user-agent detection, animation suppression or benchmark delay is used.

### Improvements supported by measurements

- The original in-page SVG animation implementation measured Home performance 43 and about 16.4 seconds of total blocking time. The native hero now plays a 768 x 768 H.264 loop from the original animation, with a still poster, no audio and no video request under initial reduced motion. Separate theme files are approximately 645 KB and 635 KB.
- The 36 quality-94 WebP delivery images total 1,309,102 bytes, compared with 3,117,278 bytes for the preserved lossless masters, a reduction of about 58%. Source TGS files, dimensions and alpha channels are preserved.
- Work renders nine initial cards and reveals the remainder on request. Hidden cards do not request their previews during normal initial loading, while a no-JavaScript visitor can access all 30.
- Canvas playback is limited to three visible scenes and 24 drawn frames per second, while elapsed-time sampling preserves the original animation duration. Offscreen/hidden-document playback pauses.

## Source, build and service checks

Formatting, Astro/TypeScript checking and static generation passed. The last typecheck reported **0 errors, 0 warnings and 0 hints**. Static checks cover unique titles, HTML metadata without JavaScript, local links/assets, social images, domain preservation, exclusion of experiments/private services and basic secret patterns. Source checks enforce the ban on U+2014. The npm dependency audit reported **0 vulnerabilities** at review time; this is not a security certification.

Offline service tests passed: **31 profile tests, 45 posts tests and 22 feedback tests**. Read [integration verification](QA-INTEGRATIONS.md) for scope and provider observations. A read-only security review found no additional concrete issue in the feedback validation, private-chat setup, public snapshot boundary, isolated synchronization adapters or workflow permissions.

Quality CI is defined with read-only repository permissions and cannot publish Pages. Its actual remote result must be inspected separately. A manual deployment workflow exists but has not been run.

## External limitations and remaining approval

- Authenticated Telegram primary-profile/video retrieval is unverified. The public still snapshot is not claimed to be an authenticated original or the active primary video. Last-good assets and GitHub/local fallbacks remain available.
- Real public Telegram widgets loaded only after consent. A video in post 54 played in the observed run. A provider sticker request returned HTTP 500, and animated TGS/custom-emoji fidelity was not established. Original post links remain available and these limits are disclosed.
- Feedback validation and UI states were exercised with a loopback mock and mocked providers. There is no approved public Worker, configured Turnstile service or verified real private-message delivery. The public form remains unavailable until configured.
- Sync schedules and Linux/systemd deployment adapters are prepared but inactive. Their intended hosting environment and real provider credentials still need verification.
- A complete human screen-reader audit and native browser-chrome zoom inspection have not been performed. Responsive reflow and automated accessibility results do not establish complete WCAG 2.2 AA, Israeli Standard 5568 or legal compliance.
- GitHub Pages response-header controls and detailed hosting settings must be checked before an approved production operation. Source configuration alone does not establish active CSP, Permissions Policy, HTTPS settings or protected environments.

No merge, production deployment, DNS change, Git tag or release is authorized by these results. Review the concrete changes and [deployment procedure](DEPLOYMENT.md) before approving any of those actions.

## Reproduce

```sh
npm run check
npx playwright install chromium firefox webkit
npm run test:browsers
npm run audit:performance
```

Browser tests use one worker locally and two in CI. Stop a development server before acceptance testing so the runner uses the static build. Run Lighthouse separately from browser tests while the built preview is listening on port 4322; set `LIGHTHOUSE_OUTPUT` to preserve separate samples. Optional service test commands and their pinned dependencies are in [the README](../README.md) and [integration verification](QA-INTEGRATIONS.md).
