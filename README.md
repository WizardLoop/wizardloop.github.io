# WizardLoop

The source of [wizardloop.com](https://wizardloop.com), the personal website of WizardLoop: independent design, illustration, animation, software, Telegram bots and open source.

The rebuild develops the selected Spectrum Circuit concept into a comic-inspired portfolio, with original wizard illustrations, expressive vector loops and a light paper palette alongside a complete dark theme. Astro generates the static site; small browser scripts handle interaction, and separate optional services handle private integrations.

**Status: `1.0.0-rc.1`, unreleased.** This branch is for implementation and review. Fixtures and mocked tests do not establish that production integrations work. Authenticated Telegram profile/video retrieval, live feedback delivery and production deployment need separate configuration, verification and owner approval. No release or deployment is implied by the package version.

## Run locally

Use Node.js **22.23.4 or newer**, with npm. Repository workflows use Node 24. Python 3.11 or newer is needed only for the optional synchronization services and their tests.

```sh
git clone --branch design/three-local-concepts https://github.com/WizardLoop/wizardloop.github.io.git
cd wizardloop.github.io
npm ci
npm run dev
```

Open [http://127.0.0.1:4322](http://127.0.0.1:4322). No credentials are needed to view the website. This unreleased review lives on `design/three-local-concepts`; the default branch still contains the earlier site. For an existing checkout of the review branch, skip cloning. Work on a dedicated development branch rather than `main`.

To exercise feedback locally, run this in a second terminal:

```sh
npm run dev:feedback
```

The loopback mock listens on port 8787. The development form identifies it as a local test and sends nothing to Telegram. See [feedback setup](docs/FEEDBACK-SETUP.md) for its validation rules and limitations.

Build and inspect the static result:

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4322
```

Stop the development server before starting the preview on the same port. `dist/` contains the publishable HTML, browser assets, domain file and social metadata. Neither command deploys anything.

## Configuration and content

`.env.example` contains public frontend options only. Copy it to a local `.env` if configuration is needed. Keep the feedback endpoint and Turnstile sitekey empty until the separate service is approved and verified. A `PUBLIC_` prefix means the value can be included in browser files; it must never contain a secret.

| Edit | Location |
| --- | --- |
| Name, verified social URLs, email and navigation | `src/config/site.ts` |
| Page copy and route-specific metadata | `src/pages/*.astro` |
| Verified software projects | `src/content/projects.json` |
| Wizard artwork titles, descriptions and provenance | `src/content/artworks.json` |
| Curated flag animations and attribution | `src/content/flags.json` |
| Public channel post index | `src/content/posts.json` |
| Public profile snapshot and media | `public/media/profile/` |
| Colors, typography and responsive layouts | `src/styles/global.css` |
| Common header, footer and metadata | `src/layouts/Base.astro` |
| Reusable icons, art and content components | `src/components/` |
| Browser preferences, embeds and motion | `src/scripts/` |

Keep claims factual. Link to verified projects and describe the actual role. The wizard scenes are portfolio artwork, not software screenshots or evidence of client relationships. Record provenance and rights for new assets, write meaningful alternative text and preserve image dimensions.

Controlled content must not contain the em dash character U+2014. Use a regular hyphen instead; source checks enforce this rule. Do not introduce unverified X, LinkedIn or organization identities into metadata.

## Architecture

- Astro generates complete HTML for Home, About, Work, Projects, Posts, Community, Feedback, Privacy, Cookies, Security, Accessibility and a custom 404. Directory output supports direct requests and refreshes on GitHub Pages.
- Local CSS and fonts provide the visual system. No application framework, CMS, database or general-purpose backend is required for the portfolio.
- The Home hero uses a native 768 x 768 H.264 MP4 loop derived from the supplied `portal-alchemy` artwork, with separate light and dark versions and the original 2.4-second duration. Other original TGS artwork loads through one shared light Canvas Lottie player. At most three visible Canvas scenes play, drawn at up to 24 frames per second while elapsed-time sampling preserves each original animation's duration. Motion controls, reduced-motion preferences and viewport/document visibility limit both playback paths.
- Static WebP delivery copies in `public/media/previews/` provide the initial and no-animation view. The build creates these quality-94 copies from unchanged lossless masters in `public/media/posters/`, preserving dimensions and the alpha channel. Original TGS sources also remain unchanged.
- Official Telegram embeds load only after visitor consent. Original post links remain available without embedding. Telegram controls embedded media support; custom emoji, stickers and animation fidelity are not guaranteed by the website.
- Profile data is read at build time from a public snapshot. Private MTProto work happens in the separate sync service, never in the browser or Pages output.
- Feedback uses an optional Cloudflare Worker with server-side validation and Turnstile verification. GitHub Pages serves only the frontend.

The build copies `public/CNAME` to `dist/CNAME`, preserving `wizardloop.com`. The original root `CNAME`, `index.html` and PaperMod-attributed stylesheet remain as historical source. Astro builds from `src/`; the legacy HTML is not its homepage input. No repository-name base path is added to this custom-domain site.

## Integration status and setup

| Integration | Current review boundary | Instructions |
| --- | --- | --- |
| Telegram profile | Public snapshot and local fallbacks available; authenticated active-primary/video access unverified | [Profile sync](docs/PROFILE-SYNC.md) |
| Telegram posts | Verified post index and consent-gated embeds; supported-update ingestion requires separate configuration, with no live schedule enabled | [Posts sync](docs/POSTS-SYNC.md) |
| Feedback | Local mock and provider-mocked tests; no public Worker or real private-message delivery claimed | [Feedback setup](docs/FEEDBACK-SETUP.md) |
| Brand derivatives | Local profile and original artwork generate static icons and a 1200 x 630 composition | `scripts/generate-brand.mjs` |

Run `node scripts/generate-brand.mjs` after an approved profile change; `npm run build` also runs it. The script updates the avatar badge and favicons while preserving illustration sources. Its native social-card typography uses installed Arial or a sans fallback, can vary by operating system, and does not redistribute system font files. The build also runs `scripts/generate-previews.mjs` to regenerate static delivery copies from the retained poster masters.

Read each service's status fields and setup guide. A usable cached output is not proof of a successful Telegram connection. No credentials, private chat IDs or sessions belong in the public snapshot. Research and external limitations are documented in [integration feasibility](docs/INTEGRATION-FEASIBILITY.md).

## Quality checks

Read the [measured website quality review](docs/QA.md) and [integration verification](docs/QA-INTEGRATIONS.md) for observed results, preview images and outstanding acceptance limits.

```sh
npm run check
npx playwright install chromium firefox webkit
npm run test:browsers
```

On Linux CI, install system dependencies with `npx playwright install --with-deps chromium firefox webkit`. Stop any development server on port 4322 before acceptance testing so Playwright starts the built preview. Browser tests require a successful build; `npm run check` includes one.

| Command | Scope |
| --- | --- |
| `npm run format` | Format the final site's Astro, CSS and TypeScript source plus its preference/config scripts |
| `npm run format:check` | Check that the same scoped source follows the pinned Prettier configuration |
| `npm run lint` | Formatting, source punctuation, basic secret patterns, JavaScript syntax and project invariants |
| `npm run typecheck` | Astro and TypeScript diagnostics |
| `npm run test:unit` | Feedback service and local mock tests |
| `npm run build` | Static preview and brand derivatives, static generation, HTML/metadata/assets/link checks |
| `npm run check` | Lint, typecheck, feedback unit tests and build |
| `npm test` | Chromium browser suite |
| `npm run test:browsers` | Chromium suite plus selected Firefox and WebKit smoke/interaction coverage |
| `npm run audit:performance` | Lighthouse on Home, Work, Posts and Feedback at the running built preview on port 4322 |

Browser coverage includes 320, 360, 390, 768, 1024 and 1440px layouts, both themes, navigation, motion, profile fallback, consent and feedback. Reports, screenshots and traces are written under ignored `artifacts/final/`. Test coverage is not a claim that every browser, assistive technology or legal accessibility requirement has been verified.

The profile service uses pinned Python dependencies in an isolated environment. After following [PROFILE-SYNC.md](docs/PROFILE-SYNC.md), run:

```sh
python -m unittest discover -s services/profile-sync -p 'test_*.py' -v
```

The posts updater uses Python's standard library and needs no package installation:

```sh
python -m unittest discover -s services/posts-sync -p 'test_*.py'
```

Its offline fixture and live configuration are documented in [POSTS-SYNC.md](docs/POSTS-SYNC.md). Identify mocks and fixtures in reports. For performance auditing, keep the built preview running on port 4322, then run `npm run audit:performance` in another terminal. Reports are written to `artifacts/lighthouse/`; set `CHROME_PATH` when Chrome cannot be discovered. Review measured results and outstanding issues before approval. This README does not assert a passing final score or complete QA.

## Local design studies

The three original concepts remain available for comparison:

```sh
npm run dev:concepts
```

Open `http://127.0.0.1:4321/concept-a/`, `/concept-b/` or `/concept-c/`. These non-indexable local studies are separate from the Astro build. `npm run test:concepts` and `npm run test:concept-interactions` exercise that earlier review material.

## Review, deployment and releases

Read [DEPLOYMENT.md](docs/DEPLOYMENT.md) before any operational change. Quality CI cannot deploy. The separate Pages workflow is manually triggered, restricted to `main`, and requires a confirmation input. These controls do not replace owner approval.

Do not merge, alter Pages settings, change DNS, deploy, create a tag or publish a release until the owner approves the corresponding action. A release follows approved deployment and live verification. Repository commands do not automatically activate sync schedules, provision a Worker or configure secrets.

## License and contact

New website source code and tooling are [MIT licensed](LICENSE). WizardLoop's name, branding, illustrations, avatar, animation media and personal content are outside that grant. Fonts and third-party assets retain their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the [asset inventory](docs/DESIGN-ASSET-INVENTORY.md).

Contributions follow [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

[Telegram](https://t.me/wizardloop) · [Channel](https://t.me/wizard_loop) · [Community](https://t.me/wizardloopchat) · [GitHub](https://github.com/WizardLoop)
