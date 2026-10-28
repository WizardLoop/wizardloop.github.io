# Licenses and media provenance

I release my newly authored website source code and tooling under the root MIT license. That license does not grant rights to my name, branding, profile artwork, personal content or third-party assets. Those retain their respective rights. No permission to reuse my profile artwork is implied.

## Existing code

The original `assets/css/style.css` remains unchanged and includes its PaperMod attribution: PaperMod v8+, MIT, Copyright (c) 2020 nanxiaobei and adityatelange; Copyright (c) 2021-2025 adityatelange. Its license reference is https://github.com/adityatelange/hugo-PaperMod/blob/master/LICENSE. The concepts do not import or copy this stylesheet. Existing copyright notices must be preserved if that code is reused later.

## Self-hosted fonts

The legacy stylesheet is also copied unchanged to `public/assets/css/style.css` to preserve its existing public asset URL after the static migration. The current upstream full MIT permission notice is retained in `public/media/licenses/PAPERMOD-LICENSE.txt`; the older copyright dates in the original stylesheet header remain untouched. My current portfolio does not import the legacy stylesheet.

Font files are unmodified Latin subsets from these pinned Fontsource variable packages, all under SIL Open Font License 1.1. They are hosted locally and make no font-provider requests in the browser. Original license/copyright notices are included alongside them.

| Font | Package version | Local license |
| --- | --- | --- |
| Manrope | `@fontsource-variable/manrope@5.3.0` | `concepts/assets/fonts/MANROPE-LICENSE.txt` |
| Cormorant | `@fontsource-variable/cormorant@5.3.0` | `concepts/assets/fonts/CORMORANT-LICENSE.txt` |
| Space Grotesk | `@fontsource-variable/space-grotesk@5.3.0` | `concepts/assets/fonts/SPACE-GROTESK-LICENSE.txt` |

## Profile and artwork

`concepts/assets/profile-telegram.jpg` is the public still exposed by https://t.me/wizardloop, downloaded on 2026-10-27 for my website. It is 320 x 320 pixels. It is not an authenticated original-resolution primary profile download and is not a claimed video. Provenance and checksum are documented in `docs/INTEGRATION-FEASIBILITY.md`. Keep this image outside the source-code MIT grant.

The orbital diagrams, journal drawings, circuit sculpture, icons, fallback monogram and project illustrations were authored for these concepts. Project illustrations are clearly labeled concept artwork, not real product screenshots or invented client work. SVG/CSS implementation code is MIT; my resulting brand identity and commissioned visual assets retain my brand/media rights.

I supplied the local design collection for my website. The 30 original TGS animations from `WizardLoop_Infinity_Atelier_30_TGS.zip` are copied unchanged into `public/media/animations/`. Their titles, original archive members, byte sizes and SHA-256 hashes are recorded in `src/content/artworks.json`. Corresponding transparent WebP posters in `public/media/posters/` are lossless raster renders of those vector assets at 35% of the animation duration. My illustrations and derived posters are reserved media, outside the website source-code MIT license. No additional license grant was found inside the source archive.

I separately supplied `WizardLoop_Silver_Grimoire.tgs` on 2026-10-28. Its 512 x 512 vector animation runs for three seconds at 60 fps. The served `silver-grimoire.tgs` changes only the internal root `nm` title's U+2014 character to an ASCII hyphen; geometry, timing and all other decoded JSON bytes are unchanged. The supplied source is untouched. `src/content/artworks.json` records both original and served byte sizes and SHA-256 hashes, plus the normalization note. This asset is distinct from the 30 unchanged Infinity Atelier originals.

Silver Grimoire contains no expression strings, external media references, fonts, effects, masks or 3D layers. Its verified poster is a transparent 512 x 512 lossless WebP Canvas render at frame 63, 35% of the three-second loop. It is 64,110 bytes, has alpha values from 0 to 255, and rendered without errors. The reviewed frame depicts my silver infinity emblem with engraved details and glinting highlights; this check does not establish complete loop playback or overall website quality. No independent license grant accompanies the source. My new artwork and any derived poster remain reserved media outside the source-code MIT license; existing Lottie player licensing still applies.

Six flag animations from `WizardLoop_Country_Flags_001_050.zip` are included: Israel, United States, United Kingdom, France, Japan and Brazil. `src/content/flags.json` records their exact source members and checksums. The supplied flag-source notice is preserved in full in `public/media/licenses/FLAGS-NOTICES.txt`; it lists the larger original collection as well as the six used here. The source collection identifies the underlying flag designs as public domain, with country-flags/Wikimedia attribution. The animation treatment and posters are not covered by the code MIT grant. National-symbol usage restrictions can apply independently of copyright. No third-party app logos or Belize flag artwork are included in this selection.

The Home hero uses two native 768 x 768 H.264 MP4 derivatives of `portal-alchemy`, one for each theme, retaining the original 2.4-second loop duration. Other original TGS media use the locally bundled light Canvas build of `lottie-web`, version 5.13.0, under MIT, Copyright (c) 2015 Bodymovin. At most three visible Canvas scenes play, with drawing capped at 24 frames per second while preserving the source loop duration. The player's original license is preserved at `public/media/licenses/LOTTIE-LICENSE.txt` and remains applicable to bundled player code. These animations contain no expression scripts or references to external images.

WebP assets are static previews. The quality-94 delivery copies in `public/media/previews/` retain the masters' dimensions and alpha channel; the existing lossless masters in `public/media/posters/`, 30 Infinity Atelier TGS files and six flag TGS files are unchanged. The additional Silver Grimoire file has only the metadata normalization documented above. The MP4 and WebP derivatives inherit the underlying rights to my media and are outside the source-code MIT grant. Full provenance, rendering checks and source-license links are documented in `docs/DESIGN-ASSET-INVENTORY.md`.

## Interface icons

The local interface icon set adapts familiar Feather geometry for GitHub, mail and common controls, with my custom symbols and Telegram/community treatments. Feather is MIT licensed, Copyright (c) 2013-2023 Cole Bemis. Its full notice is preserved in `public/media/licenses/FEATHER-LICENSE.txt`; source: https://github.com/feathericons/feather/blob/main/LICENSE. No icon CDN is loaded. Social marks identify their respective services and do not imply endorsement.

My site's self-hosted font notices are also present in `public/fonts/`. The removed synchronization services and their Python dependencies are not part of this revision. Their earlier code and licensing records remain in Git history.

## Development tooling

Playwright, axe-core, Lighthouse, Prettier and the Prettier Astro plugin are development-only dependencies. Their upstream licenses remain in the installed packages. They are not served to website visitors or included as production scripts. `package-lock.json` records exact dependency versions. Lottie is a runtime dependency because its Canvas player is bundled into my site's lazy-loaded animation module.
