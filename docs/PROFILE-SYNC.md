# Profile synchronization

This service is implemented for local review. No Telegram credentials have been supplied, no bot login has been attempted, and authenticated profile or video downloads remain untested. Offline fixtures exercise selection, fallback, output and safety behavior without claiming that a Telegram account has been synchronized.

## Public output contract

Run the service from the repository root. Its default output directory is the repository's `public/media/profile`, anchored to the script location rather than the current working directory. The site may read its JSON during a static build; the browser never receives Telegram credentials or talks to MTProto.

| File | Purpose |
| --- | --- |
| `avatar.jpg` | Validated current profile still, GitHub fallback or local mark. |
| `profile.mp4` | Best accessible full Telegram profile animation. Absent when unavailable. |
| `poster.jpg` | Frame selected with Telegram's timestamp when FFmpeg succeeds; otherwise the profile still. |
| `profile.json` | Allowlisted public metadata and stable site-relative asset URLs. |

The manifest fields are `source`, `avatar`, `video`, `poster`, `bio`, `bioSource`, `syncedAt`, `checkedAt`, `status`, `posterSource`, `width`, `height` and `mediaNote`. `video` is either `/media/profile/profile.mp4` or `null`. `source` is `telegram`, `github` or `local`; `status` is `current`, `fallback`, `retained` or `fixture`. `syncedAt` remains unchanged when retaining a previous snapshot after a source outage. `checkedAt` tracks the latest attempt. A fixture status and note must never be presented as a successful live sync.

The service does not create favicons, Apple icons or social compositions. After a changed snapshot, run the site's asset-generation and static-build pipeline so those assets and Schema.org image references are derived from the same snapshot. Keep their public URLs stable. Publish a complete validated build only through the separately approved deployment process.

## Selection and privacy rules

The bot resolves the known `wizardloop` username and reads `users.getFullUser`. It uses `User.photo.photo_id` as the active identity. A matching `full_user.profile_photo` is preferred; otherwise up to five pages of `photos.getUserPhotos` are searched for that exact ID. Upload dates, list order and the highest photo ID never determine the primary. An unresolved identity causes retention or fallback, not a guess.

Contact-specific `personal` photos and the separately identified personal/fallback profile fields are rejected. A confirmed primary removal or privacy change prevents retaining the old Telegram image. The bot should be dedicated to this purpose and should not be added as a contact to expand profile visibility. The owner must verify the bot-visible biography and image are intended for public publication before enabling a live schedule.

Only `video_sizes` type `u` is accepted as full profile MPEG4. Type `p` is a small preview and is never silently substituted. When more than one full rendition is exposed, the largest pixel area and then file size wins. This is the best rendition Telegram makes available, not a claim to retrieve an unavailable pre-upload original. Original MP4 bytes are preserved; the service does not transcode or reduce their quality. Oversized or invalid media is rejected instead of choosing an inferior rendition.

The current photo identity is checked again after download. File reference failures trigger a fresh lookup before a retry. If the full animation is inaccessible but the current still is valid, the manifest explicitly describes the still-only result. `video_start_ts` controls the optional poster extraction. Missing FFmpeg or failed extraction leaves a valid still poster and an honest `posterSource`.

Telegram's supported `about` field is the first biography source. If absent, the public GitHub biography is read independently of GitHub image downloading. The editable local biography is last. Biography text is limited to 500 characters, control characters are removed and U+2014 is converted to a normal hyphen. Render this field as escaped text, never as HTML.

## Isolated setup

Use Python 3.11 or newer. Create a dedicated environment rather than installing dependencies into a system Python:

```sh
python -m venv services/profile-sync/.venv
```

Linux/macOS:

```sh
services/profile-sync/.venv/bin/python -m pip install -r services/profile-sync/requirements.txt
services/profile-sync/.venv/bin/python -m unittest discover -s services/profile-sync -p 'test_*.py' -v
```

Windows PowerShell:

```powershell
services/profile-sync/.venv/Scripts/python.exe -m pip install -r services/profile-sync/requirements.txt
services/profile-sync/.venv/Scripts/python.exe -m unittest discover -s services/profile-sync -p 'test_*.py' -v
```

Telethon 1.45.0 and Pillow 13.0.0 were verified against their official PyPI releases on 2026-10-27. Resolved transitive dependencies are pinned in the same requirements file. Recheck releases and advisories when updating; do not let an unreviewed upgrade silently change Telegram schema handling.

## Credentials

Supply these only through the host's secret store or a private process environment:

| Variable | Meaning |
| --- | --- |
| `TELEGRAM_API_ID` | API application ID issued by Telegram. |
| `TELEGRAM_API_HASH` | Its private API application hash. |
| `TELEGRAM_BOT_TOKEN` | Dedicated bot token issued by BotFather. |
| `PROFILE_LOCAL_BIO` | Optional editable public fallback biography. |
| `FFMPEG_BINARY` | Optional path to an installed, maintained FFmpeg binary. Otherwise `PATH` is searched. |

The service uses bot authorization with a fresh `MemorySession`. It never prompts for a phone number, exports sessions or writes a `.session` file. Personal sessions are deliberately unsupported. Setting `TELEGRAM_SESSION`, `TELEGRAM_STRING_SESSION` or `TELEGRAM_PHONE` produces a configuration error. Do not pass secrets as command-line arguments, commit a private environment file or store credentials inside the public output directory. No API responses, access hashes, user IDs or session data are serialized into the manifest.

The application ID/hash can be obtained through [Telegram API development tools](https://my.telegram.org). Create the dedicated bot through the official [BotFather setup](https://core.telegram.org/bots/features#botfather), then provision its token privately. This service does not need a destination chat ID and never sends a Telegram message.

## Offline fixture and manual runs

The fixture command makes no network requests and requires a separate output directory. The real repository profile directory is rejected even when the command is invoked from another working directory. It generates a synthetic local mark, labels its result `fixture`, and never invents an animated profile:

```sh
python services/profile-sync/profile_sync.py --fixture services/profile-sync/fixtures/active-still.json --output services/profile-sync/test-output
```

Use the dedicated environment's Python executable in place of `python` when it is not activated. With private credentials provisioned, the manual sync command is:

```sh
python services/profile-sync/profile_sync.py --force
```

An optional `--local-avatar path/to/approved-avatar.jpg` overrides the generated local mark. Without `--force`, a valid recent manifest avoids repeat requests for six hours. Missing Telegram credentials allow the public GitHub fallback or a valid existing snapshot; that is not a successful Telegram integration. Safe log events report only source, status, whether video exists and poster provenance. Raw exceptions, biographies and credentials are not logged.

Exit `0` means a usable snapshot or cache was produced, including fallback or retention. Exit `1` means the operation failed. Exit `2` means setup or an existing output lock needs attention. Inspect `status` rather than treating an exit code alone as proof that Telegram succeeded.

## Separate host and proposed schedule

Nothing is deployed or scheduled by these files. A future authorized setup can run as a short-lived process on a small server or private CI runner:

1. Install Python, the pinned environment and optionally FFmpeg on the separate host.
2. Provision bot secrets outside the checkout and public document root. Use a dedicated operating-system account with only the necessary output access.
3. Run the command against a private staging copy of the site's `public/media/profile` directory. Keep the previous valid snapshot between runs.
4. Validate the JSON and local assets, run the site's derivative-asset pipeline, then build and test the full static site.
5. Submit the generated public asset changes for review. Publishing requires the user's separate merge/deployment approval.

A conservative future schedule is once every six hours, with a manual trigger. Use a scheduler concurrency limit of one, a finite overall job timeout, and notifications for sustained failure. Do not place secrets in a scheduler command string. No remote workflow, cron job, credential or production setting has been created here.

## Failure and output behavior

- Ordinary Telegram network/API failure preserves a valid previous Telegram snapshot. A first run falls back to GitHub and then the local mark. Existing GitHub fallback data can refresh on later runs.
- A confirmed missing/personal primary prevents stale Telegram retention. If visibility changes are uncertain because the service cannot connect, the last known valid image remains until a successful check or manual owner removal.
- Requests have bounded retries, timeouts and backoff. Telegram flood waits over 30 seconds stop the attempt. Image bytes are limited to 12 MiB and video bytes to 64 MiB; decoded images are limited to 16 million pixels. Downloads are held in bounded memory and validated before publication.
- GitHub requests use fixed public identity and allowlisted HTTPS hosts. Redirects are revalidated. No GitHub token or browser scraping is needed.
- JPEG normalization removes source metadata without reducing pixel dimensions. MP4 container checks reject truncated or non-MP4 payloads; they are not a substitute for real cross-browser playback testing.
- A lock prevents concurrent writers. Each file replacement is atomic, the manifest is committed last, and ordinary write failures restore prior files. This is not a multi-file filesystem transaction or a live-hosting atomic deployment. Build from the output only after the process exits and publish the complete static build as a unit.
- A killed process can leave `.sync.lock`. Confirm no sync process is running before removing that one lock file. Never publish lock or `.pending` files. No automatic stale-lock deletion can accidentally release a live worker's lock.

## Verification and remaining acceptance tests

Offline tests cover active ID selection against newer history, personal/fallback rejection, missing and full video variants, original rendition ranking, still-only output, independent biography fallback, cache behavior, outage retention, GitHub/local fallback, privacy removal, safe download hosts, write rollback, timestamped poster command arguments and non-secret logs. Telethon constructor signatures are checked when the pinned package is installed.

Measured local result on 2026-10-27: 31 tests passed with zero failures, errors or skips under Telethon 1.45.0 and Pillow 13.0.0. The tests include independent biography fallback when an avatar download fails and rejection of fixture writes to the real profile directory from another working directory. The separate fixture command completed with `status: fixture`, `video: null` and valid 640 x 640 JPEG assets. Python compilation and the U+2014 source-content check also passed. The ignored `services/profile-sync/test-output/test-results.json` records the local test count and dependency versions.

Authenticated acceptance still requires an authorized bot and owner review: confirm bot visibility of the active primary; compare an older photo deliberately selected as primary against a newer history entry; verify a real `u` video download and intended poster frame; test an actual file-reference refresh; confirm profile removal/privacy behavior; and play the resulting MP4 in Chrome, Firefox and WebKit. The UI must use `muted`, `loop`, `playsinline`, stable dimensions, a pause control and a still under reduced motion. No report in this repository claims these authenticated checks passed.

## Primary references

- [Telegram UserProfilePhoto](https://core.telegram.org/constructor/userProfilePhoto), [userFull](https://core.telegram.org/constructor/userFull) and [photos.getUserPhotos](https://core.telegram.org/method/photos.getUserPhotos).
- [Telegram video size types](https://core.telegram.org/api/files#videosize-type-values), [videoSize](https://core.telegram.org/constructor/videoSize) and [InputPhotoFileLocation](https://core.telegram.org/constructor/inputPhotoFileLocation).
- [Bot authorization](https://core.telegram.org/method/auth.importBotAuthorization) and [users.getFullUser](https://core.telegram.org/method/users.getFullUser).
- [Official Telethon client documentation](https://docs.telethon.dev/en/stable/modules/client.html), [Telethon on PyPI](https://pypi.org/project/Telethon/) and [Pillow on PyPI](https://pypi.org/project/Pillow/).

New service code is MIT under the repository license. Installed package metadata identifies Telethon and pyaes as MIT, Pillow as MIT-CMU, rsa as Apache-2.0, and pyasn1 as BSD-2-Clause. Third-party libraries retain those licenses. Profile media and owner branding are not relicensed by this service.
