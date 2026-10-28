# GitHub Pages publication and recovery

I use this guide for `WizardLoop/wizardloop.github.io` and `wizardloop.com` only. My site is static. I do not need a private host, bot, synchronization schedule, feedback service or additional infrastructure.

When I approve and merge a change into `main`, it triggers my checked-in Pages workflow. Creating or updating a pull request does not publish it.

## Verified publication and current repository work

My published website is **`1.0.0-rc.3`, deployed on 2026-10-28**. [PR #5](https://github.com/WizardLoop/wizardloop.github.io/pull/5) merged at 13:50:17 UTC as commit [`062bdad623c53c2bd10661c3fe578f1cfc62b2b2`](https://github.com/WizardLoop/wizardloop.github.io/commit/062bdad623c53c2bd10661c3fe578f1cfc62b2b2). I verified that both the build and deploy jobs in [deployment run 40700122492](https://github.com/WizardLoop/wizardloop.github.io/actions/runs/40700122492) succeeded, completing at **13:57:11 UTC (16:57:11 Asia/Jerusalem)**. My live HTTPS check returned 200 and confirmed the Silver Grimoire artwork and SVG marks.

My **`1.0.0-rc.4` repository update remains unreleased**. I am improving documentation and version metadata only; this update changes no website source, public assets, tests or workflows. I keep the published site's evidence separate from this documentation review in [QA.md](QA.md). My preceding `1.0.0-rc.2` deployment remains historical evidence in [CHANGELOG.md](../CHANGELOG.md). A package version or successful deployment does not establish that a Git tag or GitHub Release exists.

## One-time repository setting

I retain these setup instructions for checking or restoring my GitHub Pages configuration:

1. Open repository **Settings > Pages > Build and deployment** and select **GitHub Actions** as the source.
2. Preserve the existing custom domain `wizardloop.com` and HTTPS configuration. This change does not require editing DNS.
3. Check **Settings > Actions > General** permits the actions used by the repository.
4. Check the `github-pages` environment permits deployment from `main`. If I configure required reviewers, deployments wait for that review; the workflow does not remove this protection.
5. Retain the previous published commit/artifact and note the current Pages/domain settings for recovery.

I verified the publication identified above. These recovery instructions do not establish the state of every account setting. Source code and CNAME alone cannot switch the Pages publishing source. If the source is changed back to a branch, my old root `index.html` may be published instead of the Astro `dist/` artifact. Ensure the source is correct before relying on merge-to-publish behavior.

In my 2026-10-28 read-only check of the same merged rc.3 commit, the [custom deployment](https://github.com/WizardLoop/wizardloop.github.io/actions/runs/40700122492) succeeded, while the parallel [legacy Pages/Jekyll run 40700121145](https://github.com/WizardLoop/wizardloop.github.io/actions/runs/40700121145) failed at 13:50:54 UTC. These are separate builders. My intended publishing source is **GitHub Actions**, which builds Astro and publishes only `dist/`. I have not directly verified the current Pages source setting, and this check changed no settings. The earlier Jekyll frontmatter failure is historical context, not a reason to rewrite valid Astro as Jekyll YAML or add a root `.nojekyll` to publish the legacy repository files. I need to confirm the Pages source setting to resolve the parallel legacy build.

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

For a local non-indexable review build, set `PUBLIC_PREVIEW=true`. My production workflow explicitly sets it to `false`. I review the final diff, screenshots, factual content, rights, keyboard behavior and measured QA before merging.

## What runs after merging

`.github/workflows/ci.yml` runs on development-branch pushes, pull requests and manual dispatch. It has read-only repository permissions and cannot deploy. Require its `check` result before merging through repository rules if desired; these rules are account settings and are not created by this source change.

After browser tests, that review workflow measures Home, About, Work, Projects, Posts and Contact with Lighthouse on Linux. I retain the HTML/JSON reports, raw traces and network logs in a separate `mobile-lighthouse-results` artifact for seven days. Audit execution errors fail CI; numeric scores are recorded without a fixed threshold. The production workflow below still validates the build and browser suite before publication.

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

See [QA.md](QA.md) for local and CI evidence, publication verification and known browser/assistive-technology limits.

## Rollback

I retain a known-good deployment and its commit before a change. For an Astro regression, prepare a revert or recovery pull request that restores the known-good source and lockfile while preserving the domain. Validate it, then leave the merge for my approval. The same `main` workflow publishes the recovery. Do not force-push `main`, delete history or overwrite tags.

Keep the validated Pages workflow in the recovery change. Reverting the pull request that introduced automatic publication would also remove its `push` trigger; in that case a merge alone will not publish the recovery. Retain the workflow or use its reviewed manual dispatch path, and verify the resulting deployment.

The pre-rebuild baseline is `658ed667c173f861cd16e6048126de12ec3648b9`. It has no npm build, so running this Astro workflow against that old commit is not a valid recovery procedure. Its original `index.html`, `assets/css/style.css` and `CNAME` are retained in the repository and Git history. If that legacy site is needed, prepare an explicitly reviewed artifact/publication workflow appropriate to the active Pages source. Preserve its relative paths, PaperMod notice and `wizardloop.com`; DNS need not change.

Git history does not record every hosting setting. Restore account settings only with my approval, using the recovery record.

## Tags and releases

I checked the repository's tags and GitHub Releases on 2026-10-28; both lists were empty. The verified rc.3 website deployment is not a GitHub Release. A successful deployment does not create a tag or Release. When I decide to publish a release, I verify the live result, recheck existing tags/releases, choose the semantic version, update the package and lockfile together, and tag the exact reviewed commit. Never overwrite an existing tag. My release notes state actual validation, known limits, licensing and recovery instructions.
