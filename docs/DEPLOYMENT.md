# GitHub Pages publication and recovery

This guide applies only to `WizardLoop/wizardloop.github.io` and `wizardloop.com`. The site is static. No private host, bot, synchronization schedule, feedback service or additional infrastructure is needed.

Merging a reviewed change into `main` is the owner's publication action: it triggers the checked-in Pages workflow. Creating or updating a pull request does not publish it. The current package version is `1.0.0-rc.2`; that label does not prove a release or production deployment exists.

## One-time repository setting

Before merging the first Astro publication change:

1. Open repository **Settings > Pages > Build and deployment** and select **GitHub Actions** as the source.
2. Preserve the existing custom domain `wizardloop.com` and HTTPS configuration. This change does not require editing DNS.
3. Check **Settings > Actions > General** permits the actions used by the repository.
4. Check the `github-pages` environment permits deployment from `main`. If the owner has configured required reviewers, deployments wait for that review; the workflow does not remove this protection.
5. Retain the previous published commit/artifact and note the current Pages/domain settings for recovery.

These are setup instructions, not a claim that the account settings have been inspected or changed. Source code and CNAME alone cannot switch the Pages publishing source. If the source remains a branch, the old root `index.html` may keep being published instead of the Astro `dist/` artifact. Ensure the source is correct before relying on merge-to-publish behavior.

GitHub documents [custom workflow requirements](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [choosing the publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). Astro supports [static publication to GitHub Pages](https://docs.astro.build/en/guides/deploy/github/).

No Actions secrets or repository variables are required. Do not add bot tokens, personal access tokens or private account data to the build. GitHub supplies its built-in token and short-lived deployment identity.

## Build and review locally

Use Node 22.23.4 or newer; workflows use Node 24.

```sh
npm ci
npm run check
npx playwright install --with-deps chromium firefox webkit
npm run test:browsers
```

Stop any development server on port 4322 before browser tests so Playwright uses the built preview. The publishable artifact is **only `dist/`**. It must include complete static HTML, local assets, icons, social metadata, sitemap, custom 404 and CNAME. It must not contain local test artifacts, credentials, experimental concepts or private files.

The root `CNAME`, `public/CNAME` and generated `dist/CNAME` must contain `wizardloop.com`. Astro's `site` remains `https://wizardloop.com`, with directory output and trailing slashes. Do not add `/wizardloop.github.io` as a base path.

For a local non-indexable review build, set `PUBLIC_PREVIEW=true`. The production workflow explicitly sets it to `false`. Review the final diff, screenshots, factual content, rights, keyboard behavior and measured QA before the owner merges.

## What runs after merging

`.github/workflows/ci.yml` runs on development-branch pushes, pull requests and manual dispatch. It has read-only repository permissions and cannot deploy. Require its `check` result before merging through repository rules if desired; these rules are account settings and are not created by this source change.

`.github/workflows/deploy.yml`, named **Deploy to GitHub Pages**, runs on pushes to `main` and supports manual dispatch. Its build is restricted to this repository and `main`.

1. Check out the selected commit and install locked npm dependencies.
2. Run `npm run check` for lint, typecheck and the complete static build.
3. Install the three Playwright browsers and run `npm run test:browsers` against that build.
4. Retain browser diagnostics as an Actions artifact and upload only `dist/` as the Pages artifact after successful checks.
5. Deploy that artifact through the `github-pages` environment. Only the deploy job receives `pages: write` and `id-token: write`.

A failing build or browser test prevents deployment. An already running production workflow is not canceled by a newer run. Environment protection rules, disabled Actions or an incorrect Pages source can still block publication; inspect the run result instead of assuming the merge succeeded publicly.

For a transient failure, open **Actions > Deploy to GitHub Pages** and rerun the failed workflow. To rebuild the latest `main`, choose **Run workflow** with `main` selected. A manual run on another branch is skipped by the guard. Do not use a rerun as a substitute for fixing a reproducible validation failure.

## Verify the published result

After the workflow reports a successful deployment:

- Open `https://wizardloop.com` and confirm valid HTTPS and the intended revision.
- Load `/about/`, `/work/`, `/projects/`, `/posts/`, `/community/` and `/feedback/` directly. Check the retained policy URLs and custom 404 behavior.
- Confirm Work and Posts open the intended Telegram channel, Projects links to all repositories, and contact links reach the verified Telegram account and email address.
- Check desktop/mobile navigation, both themes, motion pause and reduced motion. External destinations should not be fetched merely by opening the website.
- Fetch social artwork, icons, sitemap and HTML metadata without JavaScript. Production pages must not carry preview `noindex`.
- Record the commit, successful workflow URL and observations. Account-level headers and certificate settings must be verified from the real response; source files cannot prove them.

See [QA.md](QA.md) for local test evidence and known browser/assistive-technology limits.

## Rollback

Retain a known-good deployment and its commit before a change. For an Astro regression, prepare a revert or recovery pull request that restores the known-good source and lockfile while preserving the domain. Validate it, then let the owner merge it. The same `main` workflow publishes the recovery. Do not force-push `main`, delete history or overwrite tags.

Keep the validated Pages workflow in the recovery change. Reverting the pull request that introduced automatic publication would also remove its `push` trigger; in that case a merge alone will not publish the recovery. Retain the workflow or use its reviewed manual dispatch path, and verify the resulting deployment.

The pre-rebuild baseline is `658ed667c173f861cd16e6048126de12ec3648b9`. It has no npm build, so running this Astro workflow against that old commit is not a valid recovery procedure. Its original `index.html`, `assets/css/style.css` and `CNAME` are retained in the repository and Git history. If that legacy site is needed, prepare an explicitly reviewed artifact/publication workflow appropriate to the active Pages source. Preserve its relative paths, PaperMod notice and `wizardloop.com`; DNS need not change.

Git history does not record every hosting setting. Restore account settings only through an owner-approved operation, using the recovery record.

## Tags and releases

A successful deployment does not create a Git tag or GitHub Release. If the owner requests a release, verify the live result, recheck existing tags/releases, choose the semantic version, update the package and lockfile together, and tag the exact reviewed commit. Never overwrite an existing tag. Release notes should state actual validation, known limits, licensing and recovery instructions.
