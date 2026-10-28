# WizardLoop

This is the source of [wizardloop.com](https://wizardloop.com), my personal website. I'm WizardLoop, an independent creator working across design, illustration, animation, software, Telegram bots and open source.

I use Astro to publish a static website on GitHub Pages. I share my wizard artwork and link to my Telegram channel, community, GitHub repositories and direct contact details. I keep the site free of application backends, automatic profile/post synchronization, feedback forms and bot setup. Running the website requires no credentials.

**Current source candidate: `1.0.0-rc.3`.** I have not deployed this candidate. My previous `1.0.0-rc.2` baseline was merged in [PR #4](https://github.com/WizardLoop/wizardloop.github.io/pull/4) at `ef1157b` and verified in production on 2026-10-28. [Its deployment run](https://github.com/WizardLoop/wizardloop.github.io/actions/runs/40679459115) passed 170 browser tests. I keep those results separate from the new candidate's validation in [QA.md](docs/QA.md).

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

I preserve my original asset collection and its provenance in the artwork and flag manifests. These inventories do not generate a public gallery or current portfolio listing; I choose the illustrations displayed on each page.

I edit my local profile in the repository. Changing my Telegram or GitHub profile does not update this site automatically. My Posts and Work pages link to my original Telegram content; Projects points to my GitHub repositories. I update those destinations on their respective services without a feed importer or repository API request from this website.

Keep factual claims and external links verified. Do not invent clients, achievements or social profiles. Record provenance and rights for new media, provide meaningful alternative text, and preserve image dimensions. My wizard illustrations are original artwork, not screenshots of software or evidence of client relationships.

Controlled text, metadata and documentation must not contain the em dash character U+2014. Use a regular hyphen; source checks enforce this rule.

## Architecture

I use Astro to generate complete HTML for Home, About, Work, Projects, Posts, Community, Contact at the retained `/feedback/` URL, Privacy, Cookies, Security, Accessibility and a custom 404. Directory output supports direct navigation and refreshes on GitHub Pages. I preserve my existing routes and domain.

I serve CSS, fonts, icons, profile assets and animation media locally. My Home hero uses two native 768 x 768 H.264 MP4 derivatives of my `portal-alchemy` artwork, one per theme, with the original 2.4-second duration. Other TGS artwork uses a shared, lazy-loaded light Canvas Lottie player. I cache animation source data while keeping each placement's mutable player data separate. Motion preferences, reduced motion and visibility controls limit playback; a still preview remains available when playback fails. I use Silver Grimoire on Home, About and Posts, and reusable SVG sparks instead of decorative star text glyphs.

My build creates quality-94 WebP delivery copies from unchanged lossless poster masters, preserving dimensions and alpha. It also generates static favicons and a 1200 x 630 social composition from my local avatar and original artwork. Run `node scripts/generate-brand.mjs` after a manual avatar change, or let `npm run build` regenerate these assets. Social-card typography uses installed Arial or a sans fallback and can vary by operating system; I do not redistribute a system font.

To regenerate a still when editing an animation asset, install the Playwright Chromium browser and run:

```sh
npm run media:poster -- silver-grimoire
npm run media:poster -- silver-grimoire 0.35
```

The optional second argument selects a frame fraction from 0 up to, but not including, 1; the default is 0.35. This manual asset-editing step needs a browser. Ordinary development and static builds do not; browser QA remains a separate check.

I use ordinary links for external destinations. I do not embed Telegram, fetch remote profile/feed data, submit visitor messages or load a CAPTCHA. Following a link opens the destination service, whose terms and privacy practices apply. See [current integration boundaries](docs/QA-INTEGRATIONS.md).

My build copies `public/CNAME` to `dist/CNAME`, preserving `wizardloop.com`. I retain the original root `CNAME`, `index.html` and PaperMod-attributed stylesheet for recovery. Astro uses `src/` for my rebuilt site, and I deploy only `dist/`. This custom domain needs no repository-name base path.

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
| `npm run media:poster -- silver-grimoire [frame-fraction]` | Manually regenerate an animation poster while editing media |

Browser evidence is written under ignored `artifacts/final/`; performance reports go to `artifacts/lighthouse/`. See [QA.md](docs/QA.md) for measured results. Tests do not establish complete accessibility or legal conformance, and older reports do not verify later source changes.

My development-branch CI also measures six pages with Lighthouse after browser tests and retains a separate `mobile-lighthouse-results` artifact, including raw traces and network logs. Audit execution errors fail the check; numeric scores are evidence, not a fixed pass threshold. My QA report records the complete 185-case Linux pass, its 97-100 performance scores and the separate Windows Home performance limitation.

## Publishing

**When I merge a reviewed change into `main`, it triggers my Pages workflow.** The workflow runs lint, typecheck, build and browser checks before uploading `dist/` and deploying it. A failed build or test blocks publication. Pull request quality checks cannot deploy.

My verified baseline uses GitHub Pages publication. If restoring or reconfiguring it, confirm **Settings > Pages > Build and deployment** uses **GitHub Actions**. Preserve my existing `wizardloop.com` domain and HTTPS setting. The repository cannot change that account setting by itself; branch publication could serve my old root HTML instead of `dist/`. See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for setup, manual retry, verification and rollback.

No Cloudflare account, server, bot token, CAPTCHA key, Python installation or personal access token is required. My workflow uses GitHub's built-in token and deployment identity. I decide separately whether to create a Git tag or Release; merging does not create one.

## Local design studies

I keep my three original concepts separate from the production build:

```sh
npm run dev:concepts
```

Open `http://127.0.0.1:4321/concept-a/`, `/concept-b/` or `/concept-c/`. These local studies are non-indexable and are not copied to `dist/`. `npm run test:concepts` and `npm run test:concept-interactions` exercise that earlier review material.

## License and contact

I license my website source code and tooling under [MIT](LICENSE). My name, branding, illustrations, avatar, animation media and personal content are outside that grant. Fonts and third-party assets retain their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the [asset inventory](docs/DESIGN-ASSET-INVENTORY.md).

Read [CONTRIBUTING.md](CONTRIBUTING.md) before contributing and [SECURITY.md](SECURITY.md) for private vulnerability reporting.

[Telegram](https://t.me/wizardloop) | [Channel](https://t.me/wizard_loop) | [Community](https://t.me/wizardloopchat) | [GitHub](https://github.com/WizardLoop) | [Email](mailto:wizard@wizardloop.com)
