# Current external-service boundaries

Scope updated on **2026-10-28** for the static `1.0.0-rc.2` source candidate. This document describes the intended and implemented architecture; current measured validation belongs in [QA.md](QA.md). It does not claim that this candidate has been deployed.

## Static behavior

- Profile copy and media are local repository assets, updated manually. No Telegram or GitHub profile request runs in the browser or build.
- Work and Posts contain ordinary links to Telegram. There is no embedded feed, remote widget loader, scheduled importer or post-sync service.
- Projects links to the owner's GitHub repositories. It does not need an API token or a browser-side repository request.
- Contact at the retained `/feedback/` route provides verified Telegram and email links. It has no form, CAPTCHA, submission endpoint or message-delivery bot.
- Fonts, icons, illustrations, video and motion-player code are served with the static website. No external content consent is needed to load a third-party widget because the current site does not embed one.
- Theme and motion preferences remain local browser preferences. The relevant policy pages explain these and hosting/external-destination behavior.

A visitor who follows an external link leaves this website and uses that service directly. This distinction does not imply that GitHub Pages or a destination service collects no technical information.

## Operational requirements

Only GitHub Pages and the repository build workflow are needed. There are no bot credentials, account sessions, private numeric chat IDs, remote schedulers or separate application hosting requirements. Pages must use the GitHub Actions publishing source as described in [DEPLOYMENT.md](DEPLOYMENT.md).

Earlier provider tests and offline service counts applied to removed components. Their reports remain in Git history and must not be cited as evidence for this revision. Native media behavior, accessibility, link checks and deployment verification still require the tests described in the current QA and deployment guides. No complete legal or accessibility conformance is asserted.
