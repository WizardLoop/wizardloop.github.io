# Integration feasibility - Phase 1

> My historical Phase 1 record. I chose a static, link-based site on 2026-10-28. I have superseded the integration proposals and operational assumptions below, but retain this report for dated observations and asset provenance. See [README](../README.md), [deployment](DEPLOYMENT.md) and [current boundaries](QA-INTEGRATIONS.md) for my maintained architecture.

I reviewed these options on 2026-10-27 (Asia/Jerusalem) for my local design review. I changed no remote settings, deployments, credentials, webhooks, sessions, releases or production content during this research. At that point, I had not implemented or end-to-end tested the integration proposals below.

## Findings that affect design approval

- I could not embed the complete Telegram channel page on my site: the observed response for `https://t.me/s/wizard_loop` contained `X-Frame-Options: SAMEORIGIN`. My proposed alternative was a native Posts page containing individual official Post Widgets and permanent Telegram links.
- Telegram documents a bot-authenticated MTProto path for profile photo, video and bio retrieval. I would need to test it with an authorized bot and my privacy settings before promising automatic primary-profile video sync. I did not choose a personal user session as the default.
- Official post responses expose real animated media, but do not guarantee complete Telegram-client fidelity. The observed responses contain both supported-media markup and unsupported-media notices. Custom emoji animation and TGS/WebM/video playback require browser verification after the design is chosen.
- Telegram embeds execute third-party code and the observed embed HTML writes a `stel_dt` cookie. They must not be described as cookieless. Proposed default: show local post information and an explicit control to load Telegram content, with an always-available source link.
- The local profile asset is a verified public Telegram still preview. It is not proof of the account's current primary video, original-resolution image, or an operating sync service.

## Public observations

I made read-only HTTP requests from my development environment. Initial sandbox requests failed because socket access was restricted; approved public reads subsequently succeeded. I record observations of those responses, not permanent service guarantees.

| URL | Result | Relevant observation |
| --- | --- | --- |
| [Telegram profile](https://t.me/wizardloop) | 200 | Public bio and JPEG Open Graph image; no video element. CSP `frame-ancestors https://web.telegram.org`; legacy X-Frame-Options `ALLOW-FROM https://web.telegram.org`; no Access-Control-Allow-Origin. |
| [Channel preview](https://t.me/s/wizard_loop) | 200 | Real message IDs and custom emoji markup. X-Frame-Options `SAMEORIGIN`; no Access-Control-Allow-Origin. |
| [Post 51 embed](https://t.me/Wizard_Loop/51?embed=1) | 200 | Custom emoji tags with static emoji fallback and a notice to open Telegram. |
| [Post 52 embed](https://t.me/Wizard_Loop/52?embed=1) | 200 | `application/x-tgsticker` source and Telegram's sticker player script; unsupported-media fallback also present. |
| [Post 53 embed](https://t.me/Wizard_Loop/53?embed=1) | 200 | MP4 video markup, custom emoji tags, Telegram player scripts and unsupported-media fallback. |
| [Official widget script](https://telegram.org/js/telegram-widget.js?22) | 200 | Creates a per-message `https://t.me/{channel}/{id}?embed=1` iframe; script response has Access-Control-Allow-Origin `*`. |
| [Production home](https://wizardloop.com/) | 200 | Server `GitHub.com`, Cache-Control `max-age=600`. No CSP, HSTS, Referrer-Policy, Permissions-Policy or X-Frame-Options header in the observed response. |
| [Public Pages API](https://api.github.com/repos/WizardLoop/wizardloop.github.io/pages) | 404 without authentication | Publishing settings could not be inspected through this request. This does not prove Pages is disabled. |

The individual embed responses had no X-Frame-Options or CSP header in this observation. Missing CORS headers do not prevent normal iframe embedding; they do prevent treating the response as freely readable cross-origin data. Do not fetch the channel HTML from client JavaScript or strip Telegram's framing restrictions.

### Verified content for local concepts

My public profile bio, observed in both page content and metadata:

> Independent designer, illustrator & animator. Expressive characters. Playful visuals. Unexpected loops.

I downloaded the image from the profile page's `og:image` URL into `concepts/assets/profile-telegram.jpg`. It is a 320 x 320 JPEG, 32,157 bytes. SHA-256: `2FB36A4AD9412D9212EA029B81A0F8054AF440E3F5208F06128074D4A580690A`. I visually checked the purple wizard character beside a glowing portal. Its permanent provenance is my public profile URL above; the CDN URL is an implementation detail, not a stable publishing contract. This is my branding/media, outside my new code's MIT license.

Genuine sample links: [Amanimo post](https://t.me/Wizard_Loop/51), [associated sticker](https://t.me/Wizard_Loop/52), [Psychedelic Adaptive post](https://t.me/Wizard_Loop/53), and [Adaptive Star of David post](https://t.me/Wizard_Loop/54). Post 51 reports `2026-10-22T20:55:52+00:00`; post 52 reports `2026-10-22T20:56:09+00:00`. These are source examples, not invented project credits. No reusable scraping infrastructure was created.

## Profile and bio sync proposal

Telegram's supported MTProto methods [contacts.resolveUsername](https://core.telegram.org/method/contacts.resolveUsername), [users.getFullUser](https://core.telegram.org/method/users.getFullUser), [photos.getUserPhotos](https://core.telegram.org/method/photos.getUserPhotos) and [upload.getFile](https://core.telegram.org/method/upload.getFile) explicitly permit bots. [auth.importBotAuthorization](https://core.telegram.org/method/auth.importBotAuthorization) accepts bot authorization with an API ID/hash. This supports testing a dedicated bot before considering a more powerful personal user session.

My proposed selection algorithm:

1. Resolve `wizardloop`, read current user and full-user information. [UserProfilePhoto](https://core.telegram.org/constructor/userProfilePhoto) provides `photo_id`, `has_video` and the `personal` flag. [userFull](https://core.telegram.org/constructor/userFull) provides `profile_photo`, optional `about`, and separately identified personal/fallback photos.
2. Select the current `profile_photo`, cross-checking the current photo ID. If a complete Photo is needed, obtain the matching ID through `photos.getUserPhotos`. Never select the largest ID or newest upload date as a substitute for the active profile. Do not publish a contact-specific personal photo or privately accessible profile data as public branding.
3. Inspect [Photo.video_sizes](https://core.telegram.org/constructor/photo). Telegram documents MPEG4 variants. Prefer the highest appropriate full animation, not a small preview: the [file documentation](https://core.telegram.org/api/files#videosize-type-values) identifies `u` as the animated profile and `p` as its small preview. Download using the documented file location and refresh expiring file references as needed. This promises the best available Telegram rendition, not an unavailable pre-upload original.
4. Use [videoSize.video_start_ts](https://core.telegram.org/constructor/videoSize) for the intended static preview frame. Generate fixed-size local poster, favicon and social-image derivatives. Keep a stable public URL for crawler assets and an atomic, validated asset manifest for the site.
5. Read supported `userFull.about` when available. Otherwise use verified GitHub bio, then editable local copy. The public-page bio above is evidence for Phase 1, not a proposed long-term HTML scraper.

My proposed operation was a separate small sync process with encrypted credentials, timeout, bounded retries and Telegram flood-wait handling. Check on a conservative schedule, for example every 6 hours, plus a manual trigger. Publish only changed, validated assets and safe metadata. Do not serialize API responses, access hashes, sessions or download credentials into the site. Preserve the last valid asset on transient failure; if none exists, fall back to GitHub, then a local mark. Handle an explicit removal or privacy change I request separately from a network outage.

For the chosen design, I proposed a muted, looping, `playsinline` video with dimensions, poster and a pause control. Reduced motion should default to the poster. I attempted no MTProto login or video download because credentials were not configured. Bot visibility, identity matching and video quality remained acceptance tests at this stage.

The HTTP [Bot API](https://core.telegram.org/bots/api#getuserprofilephotos) returns profile photos as PhotoSize arrays; that method does not document video sizes. It is not evidence of profile-video support.

## Posts: supported approach and limitations

Telegram's [official Post Widget](https://core.telegram.org/widgets/post) supports individual public group/channel messages, including width and dark-theme configuration. It was my preferred renderer for this proposal. A native `/posts` page could keep my navigation and maintain a cached list of verified message IDs, dates, short accessible descriptions and source links. Load a limited batch of widgets on request or near the viewport; reserve space to reduce layout shift and provide failure/retry states.

For automatic discovery, a channel-member bot can receive new posts and edits. [Telegram's FAQ](https://core.telegram.org/bots/faq#what-messages-will-my-bot-get) documents channel message delivery. The [Update schema](https://core.telegram.org/bots/api#update) exposes `channel_post` and `edited_channel_post`; undelivered updates are retained for at most 24 hours. Persist updates promptly, deduplicate IDs and handle downtime. The reviewed schema has no general channel-post deletion event. I would need explicit reconciliation and removal controls.

Historical backfill differs: [messages.getHistory](https://core.telegram.org/method/messages.getHistory) is users-only. Start with known IDs I approve or an export. If an authorized user session is eventually needed for complete backfill, keep it isolated and explain the scope first. [channels.getMessages](https://core.telegram.org/method/channels.getMessages) permits bots for known IDs, subject to access; test this for edit/deletion reconciliation rather than assuming bot history access.

Do not cache expiring CDN media links as permanent URLs. Do not substitute static emoji or poster images and label them full animation. The cross-origin widget cannot be restyled or paused by arbitrary parent-page DOM access. Reduced-motion behavior and the ability to pause each animated type need real browser testing. If the widget lacks sufficient controls, keep it unloaded until requested and clearly offer the Telegram original. The site's motion toggle should not claim to pause third-party media unless verified.

Before final implementation approval, run a Chromium/Firefox/WebKit matrix on real channel examples for: TGS, WebM, custom emoji, video, albums, long text, keyboard use, RTL, narrow viewports, blocked requests, consent refusal and reduced motion. HTTP source inspection is not playback verification. No claim of complete fidelity is made.

## Feedback and hosting notes for Phase 2

Keep the site static. A separate Worker can validate method, exact allowed Origin, content type, body size, required name/message and optional email. Limit lengths, reject unexpected fields, use a honeypot and abuse controls, and send escaped plain text or safely escaped Telegram HTML. Do not treat CORS as authentication. Never send visitor IPs to Telegram or log form bodies.

[Turnstile Siteverify](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) is mandatory on the server. Tokens are single-use and expire after five minutes. Validate success, hostname and action; reject missing, expired and replayed tokens. `remoteip` is optional. Keep the secret server-side and show accessible timeout/retry messages. The normal design can omit passing the IP to Siteverify, though Cloudflare still receives network/security signals.

Cloudflare's [Worker rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) is approximate and local to each Cloudflare location. It is not a strict global quota. Use a Durable Object if strict global protection for the Telegram destination is required, with documented retention for any abuse-control keys.

My proposed setup required me to start the bot, configure my numeric private chat ID privately, then approve a delivery test. My username alone is not proof that a bot can message my private account. Until secrets and a real delivery test exist, use a clearly labeled local mock, not a false success message.

My production response at the time lacked the headers listed above. A static HTML CSP can cover some resource rules, but [frame-ancestors cannot be supplied in a meta element](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors). Do not claim server headers are configured by writing an unsupported `_headers` file into GitHub Pages. I would review a proxy/CDN as a separate infrastructure change before using it to supply these headers.

## Privacy and accessibility review boundaries

- My proposed feedback service would process name, message and optional email through the chosen backend and Telegram. Publish purpose, recipients, voluntary/required fields, retention, contact and deletion/correction procedure based on actual operation. I would need to decide retention from actual practice, not invent a policy. Israel's [Privacy Protection Authority guidance](https://www.gov.il/BlobFolder/legalinfo/duty_to_notify/he/notify13.pdf) and [Amendment 13 information](https://www.gov.il/he/pages/tikun13_qa) are relevant to the notice and rights assessment.
- [GitHub documents security logging of visitor IPs](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection). [Cloudflare's Turnstile addendum](https://www.cloudflare.com/turnstile-privacy-policy/) describes security signals including IP, TLS fingerprint, user agent and origin. Therefore, do not publish an unconditional claim that the website collects no information.
- [GDPR territorial scope](https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/application-gdpr_en) depends on establishment, offering services and monitoring; public accessibility from Europe alone is not enough to conclude applicability. [ePrivacy Article 5(3)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02002L0058-20091219) distinguishes consent from strictly necessary storage/access. Assess the actual embeds and tracking before choosing consent behavior. No analytics are needed for the concepts.
- Use [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/) as the engineering target, including reflow, focus, target sizes and motion controls. Israel's [internet accessibility guide](https://www.gov.il/he/pages/website_accessibility) and [SI 5568-1 (2023)](https://www.gov.il/BlobFolder/legalinfo/israeli_accessibility_standards_pdf/he/sitedocs_si-5568-1-september-2023.pdf) require a separate applicability and national-adjustments review. No exemption or legal compliance is assumed from the site's personal branding.
- An accessibility statement must describe actual tests and known third-party limits. Automated axe/Lighthouse results alone do not establish full conformance. Screen-reader testing and legal applicability remain separate review items before publication.

These are my implementation research notes, not a legal certification. I base policy text and compliance claims on the services I actually enable and my verified circumstances.
