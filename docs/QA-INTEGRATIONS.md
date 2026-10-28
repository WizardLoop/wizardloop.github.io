# Current external-service boundaries

I updated this scope on **2026-10-28** for my published static **`1.0.0-rc.3` website**. I verified [deployment run 40700122492](https://github.com/WizardLoop/wizardloop.github.io/actions/runs/40700122492) for merged commit `062bdad623c53c2bd10661c3fe578f1cfc62b2b2`; it completed at **13:57:11 UTC (15:57:11 Asia/Jerusalem)**. My live HTTPS check returned 200 and confirmed the Silver Grimoire artwork and SVG marks.

My **`1.0.0-rc.4` repository update remains unreleased** and changes documentation and version metadata only. I am not changing the website source, public assets, tests, workflows or service boundaries described below. I keep measured validation and publication evidence in [QA.md](QA.md), with operation and recovery instructions in [DEPLOYMENT.md](DEPLOYMENT.md).

## Static behavior

- I update my profile copy and media manually as local repository assets. No Telegram or GitHub profile request runs in the browser or build.
- I use ordinary Telegram links on Work and Posts. I do not load an embedded feed, remote widget, scheduled importer or post-sync service.
- I link Projects to my GitHub repositories. This needs no API token or browser-side repository request.
- I provide verified Telegram and email links at the retained Contact route, `/feedback/`. I do not operate a form, CAPTCHA, submission endpoint or message-delivery bot.
- I serve fonts, icons, illustrations, video and motion-player code with my static website. I do not ask for external-content consent because I do not embed a third-party widget.
- I keep theme and motion preferences in the visitor's browser. My policy pages explain these preferences and hosting/external-destination behavior.

A visitor who follows an external link leaves my website and uses that service directly. I do not imply that GitHub Pages or a destination service collects no technical information.

## Operational requirements

I need only GitHub Pages and my repository build workflow. I do not need bot credentials, account sessions, private numeric chat IDs, remote schedulers or separate application hosting. My intended Pages source is GitHub Actions, as described in [DEPLOYMENT.md](DEPLOYMENT.md). I verified the custom deployment and live site, but I have not directly verified the current account-level source setting; the parallel legacy Jekyll build remains a separate configuration issue.

My earlier provider tests and offline service counts applied to components I removed. I retain those reports in Git history, but they must not be cited as evidence for this revision. I still check native media behavior, accessibility, links and publication as described in my QA and deployment guides. I do not assert complete legal or accessibility conformance.
