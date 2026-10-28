# Deployment, release and rollback

Scope is `WizardLoop/wizardloop.github.io` and the existing domain `wizardloop.com`. This is a procedure for a later approved operation. It does not authorize a merge, deployment, DNS change, credential update, external message, tag or release.

The package is `1.0.0-rc.1`, unreleased. Keep development on a dedicated branch. The original baseline is commit `658ed667c173f861cd16e6048126de12ec3648b9`; retain it and the original root `CNAME`, `index.html` and `assets/css/style.css` so the earlier site remains recoverable. Preserve the PaperMod attribution.

## Build and review

Astro uses `site: 'https://wizardloop.com'`, static output, directory-format pages and trailing slashes. Build from the repository root with Node 22.23.4 or newer; workflows use Node 24.

```sh
npm ci
npm run check
npx playwright install --with-deps chromium firefox webkit
npm run test:browsers
```

`npm run check` includes brand generation, static generation and validation of `dist/`. Stop any development server at port 4322 before browser tests so the runner does not reuse it instead of the built preview. Python service tests and authorized live-provider acceptance are separate checks in their guides.

The deployable artifact is **only `dist/`**. It contains static HTML, media, metadata, icons, sitemap output, the custom 404 and CNAME. It must not contain services, credentials, sessions, local artifacts, source maps or experimental concepts. `public/CNAME` and `dist/CNAME` must contain exactly `wizardloop.com`; preserve the root CNAME too. Do not add `/wizardloop.github.io` as an Astro base path.

Set `PUBLIC_PREVIEW=true` before building a review version to mark pages non-indexable. Production must have preview mode disabled. This variable does not create a protected hosting environment; local review remains the default.

Before publication:

1. Review the final diff, screenshots, measured accessibility/performance results and limitations. Separate mocked/fixture results from real provider checks.
2. Verify content and rights, direct page loads, links, theme/motion behavior, profile fallback and JavaScript-free metadata. Inspect social artwork directly and check the artifact for sensitive material.
3. Read current GitHub Pages source, domain and HTTPS settings through an authorized account. The initial audit confirmed Pages exists, but its detailed settings were unavailable through the read-only interface.
4. Determine whether Pages publishes directly from a branch. A merge into that branch can trigger production even when the new workflow is manual. Resolve the source and timing with the owner before approving or executing a merge.
5. Identify the exact commit/artifact, configuration and rollback target. Obtain explicit approval for merge and deployment. A selected design, passing tests or typed workflow token is not that approval.

Any needed Pages-source, domain, HTTPS, environment-protection or DNS change is a separate concrete infrastructure change for approval. This rebuild does not require a DNS change.

## What the owner should prepare in GitHub

Prepare these values and review the current settings before the final approval. Do not change the production source or merge a publishing branch during preparation.

| Location | Required preparation |
| --- | --- |
| Settings > Pages | Record the current publishing source. The prepared Astro workflow expects **GitHub Actions** at publication time. If Pages currently publishes a branch, resolve that transition before merging. Preserve the existing `wizardloop.com` custom domain and verify HTTPS. |
| Settings > Environments > github-pages | Review branch restrictions and any required reviewer. Limit production deployment to the reviewed `main` branch; the manual confirmation field is not an access-control boundary. |
| Settings > Actions > General | Allow the repository's checked-in GitHub Actions. The workflow declares its permissions; a personal access token is not required for Pages deployment. |
| Settings > Secrets and variables > Actions > Variables | If feedback will be enabled, prepare `PUBLIC_FEEDBACK_API_URL` including `/feedback`, and `PUBLIC_TURNSTILE_SITE_KEY`. Both are public values. Leave them empty until the separate Worker is configured and verified. |
| Pull request checks | Require the current `check` and `profile-sync-tests` jobs to succeed on the commit being reviewed. Check the attached media capability evidence as well as the pass/fail totals. |
| Recovery record | Retain the previously deployed artifact, its commit and current Pages/domain settings before the approved change. |

The Pages source and environment behavior follow [GitHub's publishing-source guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) and [custom-workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). These are preparation instructions, not a claim that the account settings have been inspected or changed.

For feedback, prepare a Cloudflare Worker endpoint, a Managed Turnstile widget for `wizardloop.com`, a dedicated Telegram bot and a verified private numeric Chat ID using [the setup guide](FEEDBACK-SETUP.md). Keep `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TURNSTILE_SECRET_KEY` and `RATE_LIMIT_SALT` in Worker secrets, outside GitHub Pages. Never send those values in a PR or commit them.

Automatic profile/posts synchronization additionally needs a separate private host, its service credentials and a reviewed method for delivering validated snapshots into the site build. The prepared schedules do not publish new snapshots to Pages. With no integrations activated, the static site retains its existing snapshots, Telegram links and an unavailable feedback form; approving publication does not make those integrations live.

## Manual Pages workflow

`.github/workflows/ci.yml` runs quality checks on pull requests or manual dispatch with read-only repository permissions. It cannot publish Pages. Its actual run result is evidence; the presence of the file does not mean CI passed.

`.github/workflows/deploy.yml`, named **Approved Pages deployment**, runs only by manual `workflow_dispatch`. Its build requires `main` and confirmation input `DEPLOY_WIZARDLOOP`. It installs locked dependencies, runs `npm run check` and uploads `dist/`. The deployment job alone receives `pages: write` and `id-token: write`, targeting the `github-pages` environment. New production jobs do not cancel an already-running deployment.

After owner approval, merge the reviewed commit through the approved process and manually dispatch this workflow from `main` with that confirmation input. The token is a procedural guard, not proof of authorization. Inspect environment protection/reviewers separately; their presence is not assumed. Configuring them is an infrastructure change needing approval.

Only these public frontend values belong in the repository/environment variables used by this workflow:

| Variable | Meaning |
| --- | --- |
| `PUBLIC_FEEDBACK_API_URL` | Approved HTTPS Worker endpoint, empty while unavailable |
| `PUBLIC_TURNSTILE_SITE_KEY` | Public Managed Turnstile sitekey, empty while unavailable |

Do not supply Telegram sessions, bot tokens, API hashes, private Chat IDs or the Turnstile secret to the Pages build. No profile/posts credentials or ingestion schedule are activated by deployment.

## Separate integrations

These operations need their own configuration, verification and approval:

- [Profile sync](PROFILE-SYNC.md): verify the bot-visible primary and public biography, produce a private staged snapshot, regenerate brand assets and validate a complete static build. A fixture is not a successful live sync.
- [Posts sync](POSTS-SYNC.md): use the supported update-ingestion procedure and private state in that guide. Verify access and edit behavior before scheduling. A bot cannot be assumed to read arbitrary historical channel messages.
- [Feedback](FEEDBACK-SETUP.md): review the Worker, verify its numeric private Chat ID, deploy only with approval and perform a separately authorized delivery test. Leave the public endpoint unavailable until verified.

No repository command automatically provisions a Worker or recurring sync. Never put secrets into CLI arguments, public URLs, logs or tracked configuration. Some secret-management commands publish service versions; follow the relevant guide first.

## Verify production

Record the deployed commit, workflow run, time, artifact identity and observed results. Verify the real site after the approved deployment:

1. Confirm valid HTTPS, the existing domain, no unexpected redirects and the actual Pages/certificate settings.
2. Request every page directly, including nested routes, icons, social image, sitemap and 404 behavior. Check navigation and narrow mobile layout.
3. Inspect HTML without JavaScript for titles, descriptions, canonical URLs, social metadata and structured data. Confirm production does not have preview `noindex`.
4. Exercise theme/motion preferences and profile media/fallbacks. Check third-party media only after consent. A loaded iframe does not establish full Telegram fidelity.
5. If feedback was activated separately, confirm the approved non-sensitive test reaches the intended chat. Test failures without storing submission text in reports.
6. Inspect actual response headers. Document headers unavailable on Pages instead of claiming source files enforce them.

If a material failure occurs, stop further rollout and use the approved rollback path. Do not release while verification is incomplete.

## Rollback

Before the first production change, retain the previous deployed artifact or a verified copy, the baseline commit, current Pages settings and domain value. Protect the recovery material from routine artifact expiry. Git history does not record every hosting setting.

For a later Astro deployment, restore the last known-good reviewed commit through a revert/recovery pull request, retain `wizardloop.com`, rebuild with its lockfile and rerun relevant checks. Obtain rollback authorization, then publish the reviewed artifact through the manual workflow. Do not force-push `main`, overwrite a tag or delete history.

The pre-rebuild baseline has no npm build. Running the new workflow against that old commit is not a valid recovery procedure. Package its original `index.html`, `assets/css/style.css` and `CNAME` from `658ed667c173f861cd16e6048126de12ec3648b9`, or use the preserved legacy artifact, and select an explicitly reviewed Pages publication method appropriate to the active source setting. Preserve relative paths, notices and the existing domain. Do not change DNS to perform recovery.

Worker versions and private sync processes are independent. Stopping a schedule or restoring a Worker needs the relevant operational authorization. Reverting static files does not undo a message already sent or invalidate a leaked credential.

## Tags and releases

After approved deployment and successful live verification, obtain approval for the final semantic version, tag and GitHub Release. Recheck remote tags/releases immediately before selecting the version; never overwrite a tag. The initial audit found none, but that is historical evidence.

Update the package and lockfile consistently, complete `CHANGELOG.md`, and tag the exact reviewed/deployed commit. Release notes should cover visible changes, validation, remaining integration limits, licensing and rollback. A release-candidate version does not mean `1.0.0` has been released.
