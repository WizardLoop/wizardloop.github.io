# Telegram posts synchronization

This optional Python 3.11+ service maintains the native site's post index using supported Telegram Bot API events. It has no Python package dependencies. It does not scrape `t.me/s`, download Telegram media, run inside the browser, publish a site, or send messages.

The implementation and offline tests are available. No bot credentials, authenticated requests, live channel updates, scheduler, or deployment have been configured or verified. The current site's manually verified snapshot remains the live input until an operator explicitly runs the service and reviews its output.

## Supported contract and limits

- A dedicated bot receives `channel_post` and `edited_channel_post` updates. This service requires it to be an administrator of the verified public `@wizard_loop` channel. Grant only the minimum rights Telegram permits for membership, not publishing, deleting, inviting, or editing rights unless separately needed.
- The existing verified IDs in `src/content/posts.json` form a deliberately incomplete manual history. New and edited events update that index. The service cannot backfill arbitrary historical posts through Bot API, and Bot MTProto `messages.getHistory` is not available to bots.
- Telegram retains undelivered updates for at most 24 hours. Poll regularly and alert on failures. An outage beyond the retention window can create a permanent gap. The index always declares `historyComplete: false`; `lastSyncedAt` means the last successfully persisted poll, not proof of complete history.
- The reviewed API has no general channel-post deletion event. Maintain an owner-reviewed exclusion file for removed posts. This service does not infer deletion from a failed widget or a temporary network error.
- Album members share `media_group_id` and accumulate across polls in the private normalized cache. The index emits one item with `messageIds`, uses the smallest message ID as its official embed reference, and preserves individual IDs for source links. It cannot know whether an album is complete until its events arrive; a first poll may briefly show a single member. Telegram controls the widget's album presentation.
- TGS, WebM stickers, animations, video, custom emoji and newer rich message types are identified, not flattened into still images. The official widget remains the media renderer. Some content requires Telegram's app; no full playback or formatting fidelity is claimed. The native excerpt is plain text only, while the official embed retains Telegram's own formatting when supported.
- A verified `getChat` response with `has_protected_content: true` produces an empty public index with `status: protected`. No updates are polled or acknowledged while this authoritative flag is present. A message-level protection flag also excludes that message. Protection changes unavailable because of a network failure cannot be detected until a successful check.

Authoritative references: [receiving updates and retention](https://core.telegram.org/bots/api#getting-updates), [getUpdates cursor semantics](https://core.telegram.org/bots/api#getupdates), [channel messages and media groups](https://core.telegram.org/bots/api#message), [bot channel delivery](https://core.telegram.org/bots/faq#what-messages-will-my-bot-get), [individual official Post Widgets](https://core.telegram.org/widgets/post), and [users-only history method](https://core.telegram.org/method/messages.getHistory). Reviewed 2026-10-27.

## Run the offline checks

From the repository root, with Python 3.11 or newer:

```sh
python -m unittest discover -s services/posts-sync -p 'test_*.py'
python services/posts-sync/posts_sync.py --fixture services/posts-sync/fixtures/updates.json --output services/posts-sync/test-output/posts.json --state-dir services/posts-sync/test-output/private
```

The fixture contains synthetic channel events clearly labeled as fixtures. It uses the real manual snapshot only as its seed. Its output is marked `status: fixture`, and the CLI refuses the real `src/content/posts.json` as a fixture output. It never creates a Bot API client or uses credentials. The generated `test-output` directory is ignored by Git and must never be published.

## Configure a separate operator service

1. Create a dedicated bot using Telegram's official BotFather flow. Add it as a channel administrator with minimum permissions. Do not reuse a feedback bot or a bot with another updates consumer.
2. Set `POSTS_TELEGRAM_BOT_TOKEN` in the host's protected environment or secret manager. Do not paste tokens into shell history, source code, public artifacts, CI command arguments, or logs.
3. Set `POSTS_SYNC_STATE_DIR` to a persistent private directory outside this repository and outside any web document root, accessible only to the service account. On Windows, configure its ACL explicitly; Python's POSIX mode flag does not replace Windows ACLs. The service refuses live state anywhere under this repository.
4. Back up the private directory. It contains the update cursor, bot/channel identity binding, blocked IDs, normalized public-message metadata and, after a protection change, `last-public-index.json` for recovery. That backup is the previous public snapshot, now retained privately. The directory contains no bot token, Telegram file IDs, raw API response, private-chat text, author identity, or session credentials. Avoid sharing it because it contains operational metadata and recovery content no longer included in the public index.
5. Run manually with a separately staged index, inspect it, then copy the reviewed result into the site's content input before the site's normal build/review process. A live run consumes this bot's events. Only one consumer may own it.

Example after securely setting the two environment variables:

```sh
python services/posts-sync/posts_sync.py --live --seed src/content/posts.json --output services/posts-sync/test-output/posts.json
```

`--state-dir /absolute/private/directory` can be used instead of `POSTS_SYNC_STATE_DIR`. The path is not a secret but must be private. After live verification and explicit integration approval, omit `--output` to update `src/content/posts.json` directly before a build. Keep the normalized private state and use the last generated index as the next `--seed` when running in a separate checkout or service directory.

The service verifies the bot, resolves the exact public channel, and checks administrator membership. An existing webhook is a hard error. It never calls `deleteWebhook`, `setWebhook`, `sendMessage`, or any destructive method. Inspect and consciously change any competing integration outside this service before retrying.

## Scheduling, persistence, and failure behavior

A persistent host or small scheduled job every 1-5 minutes is appropriate after live verification. This repository does not create that schedule or deploy the service. Keep one concurrent instance, durable private storage, a secret-backed environment, generic failure alerts, and a timeout long enough for bounded network retries. Ephemeral CI without durable state is not a suitable default.

Each poll requests at most 100 updates with a 20-second long-poll timeout. Requests have a 35-second socket timeout and at most three attempts. HTTP 429 respects a short server delay; a delay over 30 seconds stops the run so the scheduler can retry later. Each run drains at most 20 batches. Another run continues any backlog. Unwanted update types and other chats are skipped, without persisting their contents.

The public index is replaced atomically first, then the private cursor is replaced atomically. Only a subsequent request acknowledges the new offset to Telegram. If writing the index fails, the cursor does not advance. If writing the cursor fails after a valid index write, replay is safe and deterministic. A process crash between the writes can leave the valid index ahead of its cursor; rerun from the intact state and index. This is idempotent recovery, not a multi-file filesystem transaction. If the state is lost, restore its backup: simply resetting the cursor does not recover expired updates or previous album membership.

Ordinary network, configuration, and parsing failures leave the last valid index on disk. If a later batch fails after earlier batches succeeded, those earlier batches remain safely saved. There is no rollback to older, less complete content. A crashed process can leave a `.lock`; first verify no sync process is running, then remove that specific stale lock manually. Never run concurrent writers or share one bot across consumers.

An authoritative channel-protection change is handled differently from an outage. The service retains the previous index privately, keeps the normalized cache/cursor, and writes `posts: []` with `status: protected` and a `checkedAt` timestamp. It does not present this as a successful content poll or advance `lastSyncedAt`. Repeated protected checks preserve the private recovery copy. After a later verified unprotected response, that seed and the cached messages can be restored through normal polling, with owner exclusions still applied. This does not recover updates that expired while protection was active. A failed write stops preparation without acknowledging updates; an already deployed static snapshot is only removed after a separately approved build/deployment.

The private cache is bounded to 10,000 messages and each JSON file/response to 4 MiB. Exceeding a bound stops processing before acknowledging that batch; plan an archive strategy before growing beyond it. No messages are silently dropped to fit a limit.

## Manual removal and public JSON contract

For confirmed deleted or intentionally excluded post IDs, create a private JSON array, for example `[123, 124]`, and pass `--exclude-ids /private/removed-posts.json` on every run. IDs are examples, not claims about existing channel posts. Apply the same exclusion list consistently; removing a cached ID from the list allows it to appear again. Excluding one member currently removes an overlapping preserved seed album, and a cached album is rebuilt from its remaining unexcluded members. Review the result.

The output retains the existing fields `channel`, `source`, `verifiedAt`, and `posts` with `id`, `title`, `kind`, `url`, and `note`. Additions:

| Field | Meaning |
| --- | --- |
| `status` | `incremental` for a saved live poll, `protected` with no public posts for a verified protected channel, or `fixture` for synthetic output |
| `lastSyncedAt` | UTC time of the last saved batch |
| `checkedAt` | UTC time of an authoritative protected-channel check, when applicable |
| `historyComplete` | Always `false` |
| `posts[].origin` | `manual-verified`, `telegram-updates`, or `fixture` |
| `posts[].date` / `editedAt` | Telegram's original publication / edit timestamp when known |
| `posts[].messageIds` | Known member IDs, including the representative ID |
| `posts[].media` | Detected media kinds, not a playback capability guarantee |
| `posts[].excerpt` | Plain text preview, limited to 280 characters |

Titles use the first real message line or a factual media label when no text exists. Public URLs are constructed only for the known channel. Telegram file IDs, expiring CDN URLs, chat IDs, bot IDs and credentials never enter the public JSON. Public text normalizes the prohibited punctuation to an ASCII hyphen. Render all strings as escaped text; never inject `excerpt` or `title` through raw HTML. Keep official widgets consent-gated and unloaded until requested, with original source links always accessible.

## Required live acceptance before claiming connection

Verify one new channel post, an edit, an album delivered across updates, an animated sticker/custom emoji post, a temporary failure and successful recovery, and an owner-excluded deleted post. Check the generated index, source links, official embeds, consent behavior, mobile layout and motion controls. Confirm no token or operational identity appears in logs or built files. These authenticated and real-media checks remain unperformed because credentials were not supplied. Only then update the site's connection wording and approve any automated build or deployment integration separately.

## Prepared persistent-host scheduling

The `services/posts-sync/deploy/` directory contains inactive Linux/systemd templates. They are files for operator review, not an installed service. No timer has been enabled and no host provisioned. A persistent host is recommended instead of GitHub Actions cache: the cursor, album membership and public history must survive every run, and a cache miss cannot reconstruct expired events. A hosted workflow must never start a fresh `getUpdates` consumer with a missing cursor.

The prepared schedule has two independent paths:

| Schedule | Account and behavior |
| --- | --- |
| Five minutes after the previous posts run ends | `wizardloop-sync` polls supported events into durable public JSON and a separate private cursor. |
| Six hours, at 00:15, 06:15, 12:15 and 18:15 UTC with a short jitter | A profile sync runs first as `wizardloop-sync`; then `wizardloop-build` creates a validated local static archive. |

The builder has no credential environment or credential mount. Its service denies access to the private cursor and root-only secret directory. It receives only an explicit file allowlist: posts JSON plus profile JSON, JPEGs, and MP4 when the manifest declares video. A shared filesystem lock gives the builder a consistent copy while preventing concurrent snapshot writes. The builder releases the lock before dependency installation or static generation, so builds do not delay ordinary polling. A long sync can delay another sync; monitor duration and failures.

The builder archives an operator-approved local Git commit, copies the public snapshot into that temporary source tree, runs `npm ci --ignore-scripts` and `npm run check`, then writes `static.zip` and `provenance.json` to `/var/lib/wizardloop-build/artifacts/<timestamp>-<commit>/`. The existing build regenerates profile-derived brand assets and checks the static output. Provenance records the source commit, snapshot times, profile source/status and SHA-256 of the archive. It explicitly declares `published: false`. Browser/media acceptance remains a separate release check. No GitHub dispatch, upload, push, merge or deployment happens.

### Install on a separately approved Linux host

These are future operator instructions. Do not execute the activation section until live integration and scheduling are explicitly approved. Use a maintained Linux distribution with systemd supporting `LoadCredential`, Python 3.11+, Node satisfying `package.json`, npm, Git, FFmpeg, and fonts needed by the brand generator. Ensure `/usr/bin/npm` points to the intended npm installation, or adapt both the script and reviewed unit paths. Test Linux font rendering because it can differ from the locally measured Windows output.

1. Create system accounts and private directories. These names are deployment examples used by the templates, not existing infrastructure:

```sh
sudo groupadd --system wizardloop-content
sudo useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --gid wizardloop-content wizardloop-sync
sudo useradd --system --no-create-home --home-dir /var/lib/wizardloop-build --shell /usr/sbin/nologin --gid wizardloop-content wizardloop-build
sudo install -d -o root -g root -m 0755 /opt/wizardloop
sudo install -d -o wizardloop-sync -g wizardloop-content -m 0750 /var/lib/wizardloop-content
sudo install -d -o wizardloop-sync -g wizardloop-content -m 2750 /var/lib/wizardloop-content/public /var/lib/wizardloop-content/public/profile
sudo install -d -o wizardloop-sync -g wizardloop-content -m 0700 /var/lib/wizardloop-content/private
sudo install -o wizardloop-sync -g wizardloop-content -m 0640 /dev/null /var/lib/wizardloop-content/snapshot.lock
sudo install -d -o wizardloop-build -g wizardloop-content -m 0750 /var/lib/wizardloop-build
sudo install -d -o root -g root -m 0755 /etc/wizardloop
sudo install -d -o root -g root -m 0700 /etc/wizardloop/secrets
```

2. Install the explicitly approved repository revision at `/opt/wizardloop/repository`, owned by root and read-only to both service accounts. Use only `WizardLoop/wizardloop.github.io`; pin the reviewed commit from the approved main branch. This is an operator-controlled checkout, not a service that automatically pulls new code. The builder records its exact commit and uses a narrowly scoped Git `safe.directory` setting for that root-owned path.

```sh
sudo git clone https://github.com/WizardLoop/wizardloop.github.io.git /opt/wizardloop/repository
sudo git -C /opt/wizardloop/repository checkout --detach APPROVED_MAIN_COMMIT
sudo python3 -m venv /opt/wizardloop/profile-venv
sudo /opt/wizardloop/profile-venv/bin/python -m pip install -r /opt/wizardloop/repository/services/profile-sync/requirements.txt
```

Replace `APPROVED_MAIN_COMMIT` with the explicitly reviewed full commit hash. Do not use the literal placeholder. Both checkout and environment must remain non-writable by service accounts; dependency updates are separate operator-reviewed changes.

3. Provision four root-owned, mode `0600` secret files from a secret manager: `/etc/wizardloop/secrets/posts-token`, `profile-api-id`, `profile-api-hash`, and `profile-token`. Use separate bots for posts and profile visibility. Do not print or place values in command history. `LoadCredential` provides each sync unit only its required files. The adapter passes them only to that sync subprocess. See the profile setup document for obtaining the API credentials; no personal Telegram session is used.

4. Create `/etc/wizardloop/removed-posts.json` as a root-owned, group-readable JSON array, initially `[]`, with group `wizardloop-content` and mode `0640`. This file is always supplied to the scheduled poller. Keep confirmed removals there across every run.

5. Copy the reviewed service/timer files and validate them on the target system. Copying these files does not enable timers:

```sh
sudo install -o root -g root -m 0644 /opt/wizardloop/repository/services/posts-sync/deploy/wizardloop-posts.service /etc/systemd/system/
sudo install -o root -g root -m 0644 /opt/wizardloop/repository/services/posts-sync/deploy/wizardloop-posts.timer /etc/systemd/system/
sudo install -o root -g root -m 0644 /opt/wizardloop/repository/services/posts-sync/deploy/wizardloop-profile.service /etc/systemd/system/
sudo install -o root -g root -m 0644 /opt/wizardloop/repository/services/posts-sync/deploy/wizardloop-build.service /etc/systemd/system/
sudo install -o root -g root -m 0644 /opt/wizardloop/repository/services/posts-sync/deploy/wizardloop-build.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/wizardloop-posts.service /etc/systemd/system/wizardloop-posts.timer /etc/systemd/system/wizardloop-profile.service /etc/systemd/system/wizardloop-build.service /etc/systemd/system/wizardloop-build.timer
sudo systemctl daemon-reload
```

The global `/etc/wizardloop/ENABLE_CONTENT_SYNC` gate is intentionally absent after installation. All services refuse to run without it. Unit parsing, OS permissions, lock behavior, Node dependencies and actual execution must be checked on the intended Linux host; this Windows development environment has not executed systemd.

### Separate approval: live acceptance and scheduling

Only after explicit approval, create the gate and run the first poll manually. It must succeed before building, because the builder rejects a fixture or an unconnected manual snapshot as a live input. It accepts an authoritative `protected` status only when the public posts array is empty, allowing a reviewed build to remove stale embeds:

```sh
sudo install -o root -g root -m 0644 /dev/null /etc/wizardloop/ENABLE_CONTENT_SYNC
sudo systemctl start wizardloop-posts.service
sudo systemctl start wizardloop-build.service
```

The build service starts its profile prerequisite. Inspect generic journal events, manifests, source links, media, the generated archive and provenance; perform the acceptance list above. Exit success can still mean profile fallback or retention, so inspect `profileSource` and `profileStatus`. If approved, enable the timers:

```sh
sudo systemctl enable --now wizardloop-posts.timer wizardloop-build.timer
sudo systemctl list-timers wizardloop-posts.timer wizardloop-build.timer
```

Set host monitoring to alert on failed units, stale successful-poll timestamps, growing disk use and stale locks well before 24 hours. The templates do not install an alert destination. Keep encrypted private-state backups and a bounded artifact-retention policy. Never copy the entire `/var/lib/wizardloop-content` directory into a public artifact. Rotate bot secrets by replacing only the corresponding root-owned file; stop both timers while moving between hosts to avoid competing consumers.

To stop future scheduling, disable both timers and remove the single gate file. Allow a currently running job to finish before making state changes. A forced process termination may leave the service's inner `.lock` or `.sync.lock`, which needs the manual recovery described earlier. Do not delete a lock while another process owns it.

### Review and later delivery to GitHub Pages

Prepared archives remain private on the host. An authorized operator can copy only `static.zip` and `provenance.json` to a review location and independently verify the SHA-256. The archive contains only the validated `dist` tree, including the existing CNAME, with no cursor, source checkout, dependencies or credentials. Local archive preparation is not a Pages deployment.

A future approved delivery path can use a GitHub App with the minimum repository Actions permission to dispatch a separate artifact-import/build workflow from the approved main branch. That workflow must verify an immutable bundle hash/provenance and upload only the static artifact; a distinct protected Pages job must require the owner's deployment approval. It should consume a public-content snapshot from this service, never poll `getUpdates` or restore cursor state from an optional Actions cache. No such GitHub App, workflow dispatch credential, remote upload endpoint or automated delivery is implemented or active here because those require choosing and approving the host and delivery trust boundary. The fully prepared local bundle remains usable through the normal approved review/deployment process without those integrations.

Primary systemd references: [timer behavior](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html) and [credentials and execution isolation](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html). Offline adapter tests verify secret-free build environments, exact public-file copying, fixture/path rejection, stale-video removal, safe archive extraction and inactive unit gates. They do not claim Linux host acceptance or live scheduling passed.
