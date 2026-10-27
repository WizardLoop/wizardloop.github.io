# Integration verification

Reviewed locally on **2026-10-27** for the unreleased `1.0.0-rc.1` build. These results do not establish production readiness, authenticated Telegram synchronization or real feedback delivery. See [QA.md](QA.md) for the final website/browser and performance review.

## Offline services

| Component | Observed result | What the result covers |
| --- | --- | --- |
| Profile synchronization | **31 passed, 0 failures, 0 errors, 0 skips** | Active-primary identity matching, video/still selection logic, independent bio fallback, caching, privacy removal, safe output paths, bounded failures and last-good preservation. Telethon constructor checks ran with Telethon 1.45.0 and Pillow 13.0.0. |
| Posts synchronization | **45 passed** | 33 ingestion/state tests plus 12 deployment-adapter tests. Includes albums across batches, edits, cursor ordering, exclusions, protected-channel removal, private recovery, build isolation and inactive deployment gates. |
| Feedback service | **22 passed** | Provider-mocked validation, Turnstile verification, restrictive origins, rate limiting, safe Telegram formatting, timeouts, uncertain delivery and the loopback-only HTTP mock. No message was sent to Telegram. |

Profile evidence is recorded in the ignored `services/profile-sync/test-output/test-results.json`. The posts and feedback counts are the observed local test-run results; their reproducible commands are:

```sh
python -m unittest discover -s services/profile-sync -p 'test_*.py' -v
python -m unittest discover -s services/posts-sync -p 'test_*.py'
npm run test:unit
```

Install the profile service's pinned requirements in an isolated environment first. Independent regression evidence in `artifacts/sync-service-review.json` confirms that an accessible GitHub bio survives avatar failure, a fixture cannot overwrite the real profile directory from another working directory, and an authoritative protected-channel response produces an empty public index. Private cursor/history remain available for recovery; removing an already deployed snapshot still requires an approved deployment.

## Real public Telegram embeds

The local Posts page was tested in Chromium against the real public provider, without bot credentials or send actions. The initial observation is timestamped **2026-10-27T03:18:49.901Z** in `artifacts/final/telegram-live-results.json`.

- No Telegram requests occurred before consent. Official post frames for [51](https://t.me/wizard_loop/51), [52](https://t.me/wizard_loop/52), [53](https://t.me/wizard_loop/53) and [54](https://t.me/wizard_loop/54) loaded after consent.
- The inspected images loaded. Video metadata was available for posts 53 and 54. The motion follow-up made post 54 visible and explicitly invoked muted playback: its video advanced from 0 to **1.326075 seconds**, with `paused: false` and `readyState: 4`. This verifies that video's playback, not automatic playback of every embed.
- Pausing site motion removed all embedded frames. Revoking consent stored `no`. Telegram set its own cookies after consent; this supports the external-content disclosure.
- The provider returned **HTTP 500** for one `cdn4.telesco.pe/file/sticker.tgs` request. Two MP4 requests were recorded as aborted. The initial run recorded no console errors, but those external network failures remain part of the result.
- Custom-emoji/sticker canvas markup was present. In the visible follow-up, post 52's sampled canvas hashes did not change over the observation interval. **Animated TGS and custom-emoji fidelity are not proven.** Original Telegram links remain necessary; a loaded frame or canvas is not proof of complete media playback.

Evidence: `artifacts/final/telegram-live-motion-results.json`, `telegram-live-visible-52.png`, `telegram-live-visible-54.png` and the two `telegram-official-post-*.png` screenshots. These ignored local artifacts describe that run, not a permanent provider guarantee.

## Local feedback UI

`artifacts/final/feedback-ui-results.json` records required-field focus, rejection before verification, keyboard submission to the actual loopback HTTP mock, uncertain-delivery messaging, retry with new local verification, and simulated rate-limit recovery. It explicitly records `realTelegramDelivery: false`, `realCAPTCHA: false` and `localHttpMockVerified: true`.

## Remaining acceptance

Authenticated primary-profile/video access, real MP4/poster selection and cross-browser playback need configured MTProto credentials and owner verification. Live posts ingestion, edits and scheduling have not been activated. Real feedback requires an approved Worker endpoint, Turnstile credentials, verified numeric private Chat ID and a separately authorized delivery test. Read [Profile sync](PROFILE-SYNC.md), [Posts sync](POSTS-SYNC.md) and [Feedback setup](FEEDBACK-SETUP.md) before these steps.

No complete human screen-reader audit or legal/accessibility certification has been performed. No production deployment, merge, tag or release is represented by this report.
