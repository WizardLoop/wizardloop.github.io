# WizardLoop

The source of [wizardloop.com](https://wizardloop.com), the personal website of WizardLoop: independent design, illustration, animation, software, Telegram bots and open source.

This is a static Astro website for GitHub Pages. It presents the owner's wizard artwork and connects visitors to the Telegram channel, community, GitHub repositories and direct contact details. There is no application backend, automatic profile/post synchronization, feedback form or bot setup. The website requires no credentials.

**Version: `1.0.0-rc.2`.** This identifies the current source candidate, not a published release or a verified production deployment. See [QA.md](docs/QA.md) for recorded validation and its limits.

## Run locally

Use Node.js **22.23.4 or newer** and npm. GitHub workflows use Node 24.

```sh
git clone https://github.com/WizardLoop/wizardloop.github.io.git
cd wizardloop.github.io
npm ci
npm run dev
```

Open [http://127.0.0.1:4322](http://127.0.0.1:4322). To review a pull request before it is merged, check out that pull request's branch first. Make changes on a dedicated branch.

```sh
npm run build
npm run preview
```

Stop the development server before starting the built preview on the same port. `dist/` is the complete publishable website. Local commands do not deploy it.

No `.env` file is required. The only example setting, `PUBLIC_PREVIEW=true`, marks a local review build as non-indexable. Production builds explicitly disable it. Nothing prefixed `PUBLIC_` may contain a secret.

## Content and assets

| Edit | Location |
| --- | --- |
| Name, verified social URLs, email and navigation | `src/config/site.ts` |
| Page copy, links and route metadata | `src/pages/*.astro` |
| Manually maintained profile copy and image metadata | `public/media/profile/profile.json` |
| Local profile image and poster | `public/media/profile/` |
| Preserved wizard artwork source inventory and provenance | `src/content/artworks.json` |
| Preserved flag asset inventory and attribution | `src/content/flags.json` |
| Colors, typography and responsive layouts | `src/styles/global.css` |
| Shared header, footer and metadata | `src/layouts/Base.astro` |
| Reusable icons and artwork components | `src/components/` |
| Theme, navigation and motion behavior | `src/scripts/` and `public/js/preferences.js` |

The artwork and flag manifests preserve the original asset collection and its provenance. They do not generate a public gallery or a current portfolio listing; the pages choose the illustrations they display.

The local profile is edited in the repository. Changing a Telegram or GitHub profile does not update this site automatically. The Posts and Work pages link to the original Telegram content; Projects points to the owner's GitHub repositories. These destinations remain current on their respective services without requiring a feed importer or repository API request from this website.

Keep factual claims and external links verified. Do not invent clients, achievements or social profiles. Record provenance and rights for new media, provide meaningful alternative text, and preserve image dimensions. The wizard illustrations are original artwork, not screenshots of software or evidence of client relationships.

Controlled text, metadata and documentation must not contain the em dash character U+2014. Use a regular hyphen; source checks enforce this rule.

## Architecture

Astro generates complete HTML for Home, About, Work, Projects, Posts, Community, Contact at the retained `/feedback/` URL, Privacy, Cookies, Security, Accessibility and a custom 404. Directory output supports direct navigation and refreshes on GitHub Pages. Existing routes and the domain remain intact.

CSS, fonts, icons, profile assets and animation media are served locally. The Home hero uses two native 768 x 768 H.264 MP4 derivatives of the supplied `portal-alchemy` artwork, one per theme, with the original 2.4-second duration. Other TGS artwork uses the shared, lazy-loaded light Canvas Lottie player. Motion preferences, reduced motion and visibility controls limit playback; a still preview remains available when playback fails.

The build creates quality-94 WebP delivery copies from the unchanged lossless poster masters, preserving dimensions and alpha. It also generates static favicons and a 1200 x 630 social composition from the local avatar and original artwork. Run `node scripts/generate-brand.mjs` after a manual avatar change, or let `npm run build` regenerate these assets. Social-card typography uses installed Arial or a sans fallback and can vary by operating system; no system font is redistributed.

External destinations are ordinary links. The current site does not embed Telegram, fetch remote profile/feed data, submit visitor messages or load a CAPTCHA. Following a link opens the destination service, whose terms and privacy practices apply. See [current integration boundaries](docs/QA-INTEGRATIONS.md).

`public/CNAME` is copied to `dist/CNAME` and remains `wizardloop.com`. The original root `CNAME`, `index.html` and PaperMod-attributed stylesheet are retained for recovery. Astro uses `src/` for the new site, and only `dist/` is deployed. There is no repository-name base path for this custom domain.

## Quality checks

```sh
npm run check
npx playwright install chromium firefox webkit
npm run test:browsers
```

On Linux, install browser system dependencies with `npx playwright install --with-deps chromium firefox webkit`. Browser tests use the built preview on port 4322; stop any development server on that port first. `npm run check` includes the build.

| Command | Scope |
| --- | --- |
| `npm run format` / `npm run format:check` | Format or check the final site's Astro, CSS and TypeScript source and selected config scripts |
| `npm run lint` | Formatting, punctuation, basic secret patterns, JavaScript syntax and project invariants |
| `npm run typecheck` | Astro and TypeScript diagnostics |
| `npm run build` | Brand/previews, static generation, HTML/metadata/assets/link checks |
| `npm run check` | Lint, typecheck and build |
| `npm test` | Chromium browser suite |
| `npm run test:browsers` | Chromium suite and selected Firefox/WebKit checks |
| `npm run audit:performance` | Lighthouse against the running built preview on port 4322 |

Browser evidence is written under ignored `artifacts/final/`; performance reports go to `artifacts/lighthouse/`. See [QA.md](docs/QA.md) for measured results. Tests do not establish complete accessibility or legal conformance, and older reports do not verify later source changes.

## Publishing

**Merging a reviewed change into `main` triggers the Pages workflow.** The workflow runs lint, typecheck, build and browser checks before uploading `dist/` and deploying it. A failed build or test blocks publication. Pull request quality checks cannot deploy.

One-time prerequisite: in GitHub **Settings > Pages > Build and deployment**, the publishing source must be **GitHub Actions**. Preserve the existing `wizardloop.com` domain and HTTPS setting. The repository cannot establish or verify that account setting by itself; if it still publishes a branch, merging alone may continue serving the old root HTML. See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for setup, manual retry, verification and rollback.

No Cloudflare account, server, bot token, CAPTCHA key, Python installation or personal access token is required. This workflow uses GitHub's built-in token and deployment identity. A Git tag or Release is optional and requires a separate owner decision; merging does not create one.

## Local design studies

The three original concepts remain separate from the production build:

```sh
npm run dev:concepts
```

Open `http://127.0.0.1:4321/concept-a/`, `/concept-b/` or `/concept-c/`. These local studies are non-indexable and are not copied to `dist/`. `npm run test:concepts` and `npm run test:concept-interactions` exercise that earlier review material.

## License and contact

Website source code and tooling are [MIT licensed](LICENSE). WizardLoop's name, branding, illustrations, avatar, animation media and personal content are outside that grant. Fonts and third-party assets retain their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the [asset inventory](docs/DESIGN-ASSET-INVENTORY.md).

Read [CONTRIBUTING.md](CONTRIBUTING.md) before contributing and [SECURITY.md](SECURITY.md) for private vulnerability reporting.

[Telegram](https://t.me/wizardloop) | [Channel](https://t.me/wizard_loop) | [Community](https://t.me/wizardloopchat) | [GitHub](https://github.com/WizardLoop) | [Email](mailto:wizard@wizardloop.com)
