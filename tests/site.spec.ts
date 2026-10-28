import {
  test,
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const routes = [
  ['home', '/'],
  ['about', '/about/'],
  ['work', '/work/'],
  ['projects', '/projects/'],
  ['posts', '/posts/'],
  ['community', '/community/'],
  ['feedback', '/feedback/'],
  ['privacy', '/privacy/'],
  ['cookies', '/cookies/'],
  ['security', '/security/'],
  ['accessibility', '/accessibility/'],
  ['404', '/404.html'],
] as const;
const widths = [320, 360, 390, 768, 1024, 1440];
const themes = ['light', 'dark'] as const;
const screenshotDirectory = resolve('artifacts/final');

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    document.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
      image.loading = 'eager';
    });
  });
  await expect
    .poll(
      () =>
        page
          .locator('img')
          .evaluateAll((images) =>
            images.every(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
          ),
      { message: 'Every image should resolve to a valid asset or fallback.' },
    )
    .toBe(true);
}

async function theme(page: Page, desired: 'light' | 'dark') {
  if ((await page.locator('html').getAttribute('data-theme')) !== desired)
    await page.locator('[data-theme-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', desired);
}

async function noOverflow(page: Page, label: string) {
  const size = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(size.document, `${label}: document overflow`).toBeLessThanOrEqual(
    size.viewport + 1,
  );
  expect(size.body, `${label}: body overflow`).toBeLessThanOrEqual(
    size.viewport + 1,
  );
}

async function canvasFrame(canvas: Locator) {
  return canvas.evaluate((element) => {
    const bitmap = element as HTMLCanvasElement;
    const pixels = bitmap
      .getContext('2d')!
      .getImageData(0, 0, bitmap.width, bitmap.height).data;
    let hash = 2166136261;
    for (let index = 0; index < pixels.length; index += 13)
      hash = Math.imul(hash ^ pixels[index], 16777619) >>> 0;
    return `${bitmap.width}x${bitmap.height}:${hash}`;
  });
}

async function waitForPaint(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done())),
      ),
  );
}

async function screenshot(page: Page, name: string, info: TestInfo) {
  await mkdir(screenshotDirectory, { recursive: true });
  const path = resolve(screenshotDirectory, `${info.project.name}-${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
}

for (const [name, path] of routes) {
  test(`${name}: direct route, assets, semantics and sticky header @smoke`, async ({
    page,
    baseURL,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    const missing: string[] = [];
    const outbound: string[] = [];
    const origin = new URL(baseURL!).origin;
    await page.route('**/*', async (route) => {
      if (new URL(route.request().url()).origin !== origin) {
        outbound.push(route.request().url());
        await route.abort('blockedbyclient');
      } else await route.continue();
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (
        response.status() >= 400 &&
        response.url().startsWith(baseURL!) &&
        !(name === '404' && response.request().isNavigationRequest())
      )
        missing.push(`${response.status()} ${response.url()}`);
    });
    const response = await page.goto(path);
    expect(response).not.toBeNull();
    expect([200, ...(name === '404' ? [404] : [])]).toContain(
      response!.status(),
    );
    await expect(page.locator('main#main')).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).not.toBeEmpty();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('.site-header .brand')).toHaveAttribute(
      'href',
      '/',
    );
    await expect(page.locator('[data-theme-toggle]')).toBeVisible();
    await expect(page.locator('[data-motion-toggle]')).toBeVisible();
    await expect(
      page.locator(
        'form, iframe, [data-feedback-form], [data-telegram-feed], [data-profile-video], #privacy-dialog, [data-privacy-open]',
      ),
    ).toHaveCount(0);
    await settle(page);
    expect(await page.locator('body').innerText()).not.toContain(
      String.fromCharCode(0x2014),
    );
    await page.evaluate(() =>
      scrollTo(0, document.documentElement.scrollHeight),
    );
    const header = await page.locator('.site-header').boundingBox();
    expect(header).not.toBeNull();
    expect(header!.y).toBeGreaterThanOrEqual(0);
    expect(header!.y).toBeLessThan(50);
    expect(errors, 'Uncaught browser errors').toEqual([]);
    expect(missing, 'Missing local resources').toEqual([]);
    expect(
      outbound,
      'Every route must load without any third-party request.',
    ).toEqual([]);
    const scriptSources = await page
      .locator('script[src]')
      .evaluateAll((scripts) =>
        scripts.map((script) => (script as HTMLScriptElement).src),
      );
    expect(
      scriptSources.every((source) => new URL(source).origin === origin),
      'Executable scripts must be served locally.',
    ).toBe(true);
  });

  test(`${name}: six widths in light and dark @matrix`, async ({
    page,
  }, info) => {
    // This case includes 12 viewport checks and four full-page captures.
    // Keep individual action deadlines while allowing the complete matrix to finish.
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    await settle(page);
    for (const currentTheme of themes) {
      await theme(page, currentTheme);
      for (const width of widths) {
        await test.step(`${width}px ${currentTheme}`, async () => {
          await page.setViewportSize({
            width,
            height: width < 768 ? 844 : 1000,
          });
          await page.evaluate(() => scrollTo(0, 0));
          await noOverflow(page, `${path} ${width}px ${currentTheme}`);
          await expect(page.locator('[data-theme-toggle]')).toBeVisible();
          await expect(page.locator('[data-motion-toggle]')).toBeVisible();
          if (width <= 768)
            await expect(page.locator('[data-menu-toggle]')).toBeVisible();
          else await expect(page.locator('.desktop-nav')).toBeVisible();
          const controls = await page.locator('.header-controls').boundingBox();
          const brand = await page.locator('.site-header .brand').boundingBox();
          expect(controls).not.toBeNull();
          expect(brand).not.toBeNull();
          expect(
            brand!.x + brand!.width,
            'Header identity must not overlap controls',
          ).toBeLessThanOrEqual(controls!.x + 1);
          expect(controls!.x + controls!.width).toBeLessThanOrEqual(width + 1);
          if (width === 390 || width === 1440)
            await screenshot(page, `${name}-${currentTheme}-${width}`, info);
        });
      }
    }
  });
}

test('all pages expose unique SEO and direct social assets without JavaScript @seo', async ({
  browser,
  request,
  baseURL,
}, info) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  try {
    for (const [name, path] of routes) {
      await page.goto(path);
      const title = await page.title();
      expect(title).toMatch(/WizardLoop/);
      expect(titles.has(title), `Unique title for ${path}`).toBe(false);
      titles.add(title);
      const description = await page
        .locator('meta[name="description"]')
        .getAttribute('content');
      expect(description?.length).toBeGreaterThan(30);
      expect(
        descriptions.has(description!),
        `Unique description for ${path}`,
      ).toBe(false);
      descriptions.add(description!);
      const canonical = new URL(
        (await page.locator('link[rel="canonical"]').getAttribute('href'))!,
      );
      expect(canonical.origin).toBe('https://wizardloop.com');
      if (name !== '404') expect(canonical.pathname).toBe(path);
      else
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
          'content',
          /noindex/,
        );
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
        'content',
        'https://wizardloop.com/social-preview.png',
      );
      await expect(
        page.locator('meta[property="og:image:width"]'),
      ).toHaveAttribute('content', '1200');
      await expect(
        page.locator('meta[property="og:image:height"]'),
      ).toHaveAttribute('content', '630');
      await expect(
        page.locator('meta[property="og:image:alt"]'),
      ).toHaveAttribute('content', /WizardLoop/);
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
        'content',
        'summary_large_image',
      );
      const schemas = await page
        .locator('script[type="application/ld+json"]')
        .allTextContents();
      expect(schemas.length).toBeGreaterThan(0);
      for (const schema of schemas)
        expect(() => JSON.parse(schema)).not.toThrow();
      const graph = JSON.parse(schemas[0])['@graph'];
      expect(
        graph.some((item: { '@type': string }) => item['@type'] === 'WebSite'),
      ).toBe(true);
      expect(
        graph.some((item: { '@type': string }) => item['@type'] === 'Person'),
      ).toBe(true);
      if (name === 'home' || name === 'about')
        expect(
          graph.some(
            (item: { '@type': string }) => item['@type'] === 'ProfilePage',
          ),
        ).toBe(true);
      await expect(page.locator('h1')).toBeVisible();
      expect(
        (await page.locator('head').innerHTML()) +
          (await page.locator('body').innerText()),
      ).not.toContain(String.fromCharCode(0x2014));
    }
    for (const [path, width, height] of [
      ['/social-preview.png', 1200, 630],
      ['/favicon-16.png', 16, 16],
      ['/favicon-32.png', 32, 32],
      ['/apple-touch-icon.png', 180, 180],
    ] as const) {
      const result = await request.get(path);
      expect(result.ok(), `Direct download ${path}`).toBe(true);
      expect(result.headers()['content-type']).toMatch(/image\/png/);
      const bytes = await result.body();
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect(bytes.readUInt32BE(16)).toBe(width);
      expect(bytes.readUInt32BE(20)).toBe(height);
    }
    expect(
      (await readFile(resolve('dist/CNAME'), 'utf8')).trim(),
      'GitHub Pages domain file in the actual build',
    ).toBe('wizardloop.com');
    let cname = await request.get('/CNAME');
    // Astro preview applies trailingSlash to extensionless assets. GitHub Pages reads dist/CNAME itself.
    if (cname.status() === 404) cname = await request.get('/CNAME/');
    expect(cname.ok()).toBe(true);
    expect((await cname.text()).trim()).toBe('wizardloop.com');
    const favicon = await request.get('/favicon.svg');
    expect(favicon.ok()).toBe(true);
    expect(await favicon.text()).toMatch(/<svg/);
    await info.attach('seo-pages', {
      body: JSON.stringify(
        {
          pages: routes.map((item) => item[1]),
          uniqueTitles: [...titles],
          uniqueDescriptions: [...descriptions],
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });
  } finally {
    await context.close();
  }
});

test('internal navigation links and local fragment targets resolve @links', async ({
  page,
  request,
  baseURL,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const checked = new Set<string>();
  for (const [name, path] of routes) {
    if (name === '404') continue;
    await page.goto(path);
    const links = await page
      .locator('a[href]')
      .evaluateAll((anchors) =>
        anchors.map((anchor) => (anchor as HTMLAnchorElement).href),
      );
    for (const link of links) {
      const target = new URL(link);
      if (target.origin !== new URL(baseURL!).origin) continue;
      if (target.pathname === path && target.hash)
        expect(
          await page
            .locator(
              `[id=${JSON.stringify(decodeURIComponent(target.hash.slice(1)))}]`,
            )
            .count(),
          `Fragment ${link}`,
        ).toBeGreaterThan(0);
      const normalized = target.origin + target.pathname;
      if (checked.has(normalized)) continue;
      checked.add(normalized);
      const response = await request.get(normalized);
      expect(response.ok(), `Internal link ${normalized}`).toBe(true);
    }
  }
});

test('mobile menu has native modal focus, an explicit Tab loop, Escape and scroll restoration @keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/about/');
  await page.evaluate(() => scrollTo(0, 400));
  const trigger = page.locator('[data-menu-toggle]');
  await trigger.click();
  const dialog = page.locator('#mobile-nav');
  await expect(dialog).toBeVisible();
  expect(
    await dialog.evaluate(
      (element) =>
        element instanceof HTMLDialogElement &&
        element.open &&
        element.matches(':modal'),
    ),
  ).toBe(true);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  const controls = dialog.locator(
    'button,a,input,select,textarea,[tabindex="0"]',
  );
  const count = await controls.count();
  expect(count).toBeGreaterThan(8);
  await expect(controls.first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(controls.last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(controls.first()).toBeFocused();
  for (let i = 0; i < count; i += 1) {
    await page.keyboard.press('Tab');
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  await expect(controls.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(
    await page
      .locator('body')
      .evaluate((element) => getComputedStyle(element).overflow),
  ).not.toBe('hidden');
  await trigger.click();
  await dialog.locator('a[href="/posts/"]').click();
  await expect(page).toHaveURL(/\/posts\/$/);
  await expect(page.locator('#mobile-nav')).not.toBeVisible();
});

test('manually paused motion keeps the mobile menu visible and keyboard usable @keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/about/');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'running');
  await page.locator('[data-motion-toggle]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
  const trigger = page.locator('[data-menu-toggle]');
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('#mobile-nav');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('opacity', '1');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
  const controls = dialog.locator(
    'button,a,input,select,textarea,[tabindex="0"]',
  );
  await expect(controls.first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(controls.last()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(controls.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('short mobile navigation keeps the current page distinct and close control reachable after scrolling @keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 320 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/about/');
  const trigger = page.locator('[data-menu-toggle]');
  await trigger.click();
  const dialog = page.locator('#mobile-nav');
  const current = dialog.locator('a[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute('href', '/about/');
  await expect(current).toBeInViewport();
  const colors = await current.evaluate((element) => ({
    current: getComputedStyle(element).backgroundColor,
    adjacent: getComputedStyle(
      element.parentElement!.querySelector('a:not([aria-current])')!,
    ).backgroundColor,
    cue: getComputedStyle(element).boxShadow,
  }));
  expect(colors.current).not.toBe(colors.adjacent);
  expect(colors.cue).not.toBe('none');
  const overflow = await dialog.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollHeight > element.clientHeight;
  });
  expect(
    overflow,
    'The short-viewport check must exercise a genuinely scrolling menu.',
  ).toBe(true);
  await expect
    .poll(() => dialog.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  const close = dialog.locator('[data-menu-close]');
  await expect(close).toBeInViewport();
  const buttonBox = await close.boundingBox();
  const dialogBox = await dialog.boundingBox();
  expect(buttonBox).not.toBeNull();
  expect(dialogBox).not.toBeNull();
  expect(buttonBox!.y).toBeGreaterThanOrEqual(dialogBox!.y);
  expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(
    dialogBox!.y + dialogBox!.height,
  );
  await close.click();
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(
    await page
      .locator('body')
      .evaluate((element) => getComputedStyle(element).overflow),
  ).not.toBe('hidden');
});

test('desktop tooltips stay hoverable, dismiss with Escape and reset after leaving focus @keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/about/');
  const trigger = page.locator('[data-theme-toggle]');
  const popupOpacity = () =>
    trigger.evaluate((element) => getComputedStyle(element, '::after').opacity);
  await trigger.hover();
  await expect.poll(popupOpacity).toBe('1');
  const bounds = await trigger.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height + 17,
    { steps: 8 },
  );
  expect(
    await trigger.evaluate((element) => element.matches(':hover')),
    'Moving across the transparent bridge into the tooltip must keep its trigger hovered.',
  ).toBe(true);
  await expect.poll(popupOpacity).toBe('1');
  await trigger.focus();
  await page.keyboard.press('Escape');
  await expect.poll(popupOpacity).toBe('0');
  await expect(trigger).toBeFocused();
  await page.mouse.move(0, 0);
  await expect.poll(popupOpacity).toBe('0');
  await expect(trigger).toHaveAttribute('data-tooltip-dismissed');
  await page.keyboard.press('Tab');
  await expect(trigger).not.toBeFocused();
  await expect(trigger).not.toHaveAttribute('data-tooltip-dismissed');
  await trigger.hover();
  await expect.poll(popupOpacity).toBe('1');
});

test('keyboard entry exposes a focus indicator and skips to main @keyboard', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.locator('.skip-link');
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  expect(
    await skip.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('theme and motion choices persist between reloads and pages @preferences', async ({
  page,
}) => {
  await page.goto('/');
  await theme(page, 'dark');
  expect(
    await page.evaluate(() => localStorage.getItem('wizardloop-theme')),
  ).toBe('dark');
  await page.locator('[data-motion-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
  await expect(page.locator('[data-motion-toggle]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(
    await page.evaluate(() => localStorage.getItem('wizardloop-motion')),
  ).toBe('paused');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
  await page.goto('/about/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
  await theme(page, 'light');
  await page.locator('[data-motion-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'running');
});

test('reduced motion avoids animation payloads and external providers @motion', async ({
  page,
  baseURL,
}) => {
  const requests: string[] = [];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await settle(page);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForLoadState('networkidle');
  await page.goto('/about/');
  await page.locator('[data-animation]').first().scrollIntoViewIfNeeded();
  await page.waitForLoadState('networkidle');
  await page.goto('/posts/');
  await page.locator('.dispatch-grimoire').scrollIntoViewIfNeeded();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
  expect(
    requests.filter((url) =>
      /\/media\/hero\/[^/]+\.mp4|\.tgs(?:\?|$)|lottie[_./-]/i.test(url),
    ),
    'Reduced motion must avoid hero video, TGS and the Lottie player',
  ).toEqual([]);
  expect(
    requests.filter((url) => new URL(url).origin !== new URL(baseURL!).origin),
    'No external content is needed for the initial page',
  ).toEqual([]);
  const activeMedia = await page
    .locator('video')
    .evaluateAll(
      (videos) =>
        videos.filter((video) => !(video as HTMLVideoElement).paused).length,
    );
  expect(activeMedia).toBe(0);
});

test('native hero verifies loop support, controls and real fallback @motion', async ({
  page,
  browserName,
  request,
  baseURL,
}, info) => {
  const manifestResponse = await request.get('/media/hero/manifest.json');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  const supportsH264 = await page.evaluate(
    (codec) =>
      document
        .createElement('video')
        .canPlayType(`video/mp4; codecs="${codec}"`),
    manifest.codec,
  );
  if (!supportsH264) {
    info.annotations.push({
      type: 'platform',
      description:
        'This browser does not advertise the supplied H.264 codec; verify the real still fallback instead of claiming native playback.',
    });
    await page.goto('/');
    const art = page.locator('[data-native-hero]');
    await expect(art).toHaveAttribute('data-state', 'unavailable', {
      timeout: 15_000,
    });
    await expect(art).toHaveAttribute('data-playing', 'false');
    await expect(art).toHaveAttribute('aria-label', /Motion unavailable/);
    await expect(art.locator('video')).toBeHidden();
    await expect(art.locator('.art-poster')).toBeVisible();
    return;
  }

  // Probe the real clip without site code before deciding whether this native
  // media backend can sustain its loop. A decoded first frame is insufficient.
  await page.route('**/__qa_native_loop_probe__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><body><video id="native-loop-probe" width="256" height="256" muted loop playsinline></video></body></html>',
    }),
  );
  await page.goto('/__qa_native_loop_probe__');
  await page.evaluate((source) => {
    const video = document.querySelector<HTMLVideoElement>('video')!;
    const samples: {
      at: number;
      time: number;
      paused: boolean;
      readyState: number;
      error: number | null;
    }[] = [];
    const probe = {
      samples,
      firstProgressAt: 0,
      lastProgressAt: 0,
      lastTime: 0,
      playError: '',
      startedAt: performance.now(),
    };
    (window as Window & { qaNativeProbe?: typeof probe }).qaNativeProbe = probe;
    video.muted = true;
    video.src = source;
    window.setInterval(() => {
      const at = performance.now();
      const time = video.currentTime;
      if (Math.abs(time - probe.lastTime) > 0.01) {
        if (!probe.firstProgressAt && time > 0.05) probe.firstProgressAt = at;
        probe.lastProgressAt = at;
        probe.lastTime = time;
      }
      samples.push({
        at,
        time,
        paused: video.paused,
        readyState: video.readyState,
        error: video.error?.code || null,
      });
      if (samples.length > 200) samples.shift();
    }, 100);
    void video.play().catch((error: DOMException) => {
      probe.playError = error.name;
    });
  }, new URL('/media/hero/portal-light.mp4', baseURL).href);
  const probeVideo = page.locator('#native-loop-probe');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as Window & { qaNativeProbe?: { firstProgressAt: number } })
              .qaNativeProbe?.firstProgressAt || 0,
        ),
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
  const probeDuration = await probeVideo.evaluate(
    (video) => (video as HTMLVideoElement).duration,
  );
  expect(probeDuration).toBeCloseTo(2.4, 1);
  await page.waitForTimeout(probeDuration * 1000 + 1200);
  const capability = await page.evaluate(() => {
    const video = document.querySelector<HTMLVideoElement>('video')!;
    const probe = (
      window as Window & {
        qaNativeProbe?: {
          samples: {
            at: number;
            time: number;
            paused: boolean;
            readyState: number;
            error: number | null;
          }[];
          firstProgressAt: number;
          lastProgressAt: number;
          playError: string;
          startedAt: number;
        };
      }
    ).qaNativeProbe!;
    return {
      ...probe,
      observedAt: performance.now(),
      paused: video.paused,
      currentTime: video.currentTime,
      readyState: video.readyState,
      duration: video.duration,
      error: video.error?.code || null,
    };
  });
  await info.attach('bare-native-loop-capability', {
    body: JSON.stringify(capability, null, 2),
    contentType: 'application/json',
  });
  expect(capability.playError).toBe('');
  expect(capability.error).toBeNull();
  expect(capability.observedAt - capability.firstProgressAt).toBeGreaterThan(
    probeDuration * 1000,
  );
  const loopingSupported =
    !capability.paused &&
    capability.observedAt - capability.lastProgressAt < 900;

  await page.goto('/');
  const art = page.locator('[data-native-hero]');
  const video = art.locator('[data-hero-video]');
  if (!loopingSupported) {
    info.annotations.push({
      type: 'platform',
      description: `${browserName} on ${process.platform}: the bare local MP4 decoded and advanced, then ${capability.paused ? 'paused' : 'stalled while unpaused'} across its first loop. This case verifies the real application still fallback; uninterrupted native looping is unsupported in this measured environment.`,
    });
    await expect(art).toHaveAttribute('data-state', 'unavailable', {
      timeout: 15_000,
    });
    await expect(art).toHaveAttribute('data-playing', 'false');
    await expect(art).toHaveAttribute('aria-label', /Motion unavailable/);
    await expect(video).toBeHidden();
    await expect(art.locator('.art-poster')).toBeVisible();
    return;
  }
  await expect(art).toHaveAttribute('data-state', 'ready', { timeout: 25_000 });
  await expect(art).toHaveAttribute('data-playing', 'true');
  await expect(video).toHaveAttribute('src', '/media/hero/portal-light.mp4');
  expect(manifest.width).toBe(768);
  expect(manifest.height).toBe(768);
  const properties = await video.evaluate((element) => {
    const media = element as HTMLVideoElement;
    return {
      muted: media.muted,
      loop: media.loop,
      duration: media.duration,
      width: media.videoWidth,
      height: media.videoHeight,
    };
  });
  expect(properties.muted).toBe(true);
  expect(properties.loop).toBe(true);
  await expect(video).toHaveAttribute('playsinline');
  expect(properties.duration).toBeCloseTo(2.4, 1);
  expect(properties.width).toBe(768);
  expect(properties.height).toBe(768);
  const time = () =>
    video.evaluate((element) => (element as HTMLVideoElement).currentTime);
  const initial = await time();
  await expect
    .poll(async () => Math.abs((await time()) - initial))
    .toBeGreaterThan(0.05);
  await page.waitForTimeout(properties.duration * 1000 + 400);
  await expect(video).toHaveJSProperty('paused', false);
  await expect(art).toHaveAttribute('data-playing', 'true');
  const afterLoopBoundary = await time();
  await expect
    .poll(async () => Math.abs((await time()) - afterLoopBoundary))
    .toBeGreaterThan(0.05);
  await page.locator('[data-motion-toggle]').click();
  await expect(art).toHaveAttribute('data-playing', 'false');
  await expect(video).toHaveJSProperty('paused', true);
  const frozen = await time();
  await page.waitForTimeout(250);
  expect(await time()).toBe(frozen);
  await theme(page, 'dark');
  await expect(art).toHaveAttribute('data-state', 'poster');
  await expect(video).not.toHaveAttribute('src');
  await expect(art).toHaveAttribute('data-playing', 'false');
  await page.locator('[data-motion-toggle]').click();
  await expect(video).toHaveAttribute('src', '/media/hero/portal-dark.mp4');
  await expect(art).toHaveAttribute('data-state', 'ready', { timeout: 25_000 });
  await expect(art).toHaveAttribute('data-playing', 'true');
  await expect(art).not.toHaveAttribute('aria-label', /unavailable/);
  const resumed = await time();
  await expect
    .poll(async () => Math.abs((await time()) - resumed))
    .toBeGreaterThan(0.05);
  await page.locator('footer').scrollIntoViewIfNeeded();
  await expect(art).toHaveAttribute('data-playing', 'false');
  await expect(video).toHaveJSProperty('paused', true);
});

test('unexpected native playback pause retains a clear still fallback @motion', async ({
  page,
}) => {
  await page.goto('/');
  const art = page.locator('[data-native-hero]');
  const video = art.locator('[data-hero-video]');
  await expect(art).toHaveAttribute('data-state', 'ready', { timeout: 25_000 });
  const stalePause = await video.evaluate((element) => {
    element.dispatchEvent(new Event('pause'));
    return {
      paused: (element as HTMLVideoElement).paused,
      state: element.parentElement?.dataset.state,
      playing: element.parentElement?.dataset.playing,
    };
  });
  expect(stalePause).toEqual({
    paused: false,
    state: 'ready',
    playing: 'true',
  });
  await video.evaluate((element) => (element as HTMLVideoElement).pause());
  await expect(art).toHaveAttribute('data-state', 'unavailable');
  await expect(art).toHaveAttribute('data-playing', 'false');
  await expect(art).toHaveAttribute('aria-label', /Motion unavailable/);
  await expect(video).toBeHidden();
  await expect(art.locator('.art-poster')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'running');
});

test('hero stall monitor preserves intentional pause and detects an unpaused frozen timeline @motion', async ({
  page,
}) => {
  await page.clock.install();
  await page.addInitScript(() => {
    let phase = 'initial';
    document.addEventListener(
      'playing',
      (event) => {
        const media = event.target;
        if (
          !(media instanceof HTMLVideoElement) ||
          !media.hasAttribute('data-hero-video')
        )
          return;
        if (phase === 'initial') phase = 'pausing';
        else if (
          phase === 'paused' &&
          document.documentElement.dataset.motion === 'running'
        )
          phase = 'freezing';
        else return;
        const action = phase;
        // Run after the application's playing handler, before the known short
        // Windows native loop can stop. Browser-driver latency must not decide
        // whether this fixture is a user pause or a decoder failure.
        window.setTimeout(() => {
          if (action === 'pausing') {
            document
              .querySelector<HTMLButtonElement>('[data-motion-toggle]')!
              .click();
            phase = 'paused';
          } else if (action === 'freezing') {
            const frozen = media.currentTime;
            Object.defineProperty(media, 'paused', {
              configurable: true,
              get: () => false,
            });
            Object.defineProperty(media, 'currentTime', {
              configurable: true,
              get: () => frozen,
            });
            media.pause();
            media.dataset.qaTimelineFrozen = 'true';
            phase = 'frozen';
          }
        }, 0);
      },
      true,
    );
  });
  await page.goto('/');
  const art = page.locator('[data-native-hero]');
  const video = art.locator('[data-hero-video]');
  await expect(art).toHaveAttribute('data-state', 'ready', { timeout: 25_000 });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
  await expect(video).toHaveJSProperty('paused', true);
  await page.clock.runFor(5000);
  await expect(art).toHaveAttribute('data-state', 'ready');
  await expect(art).toHaveAttribute('data-playing', 'false');
  await expect(art).not.toHaveAttribute('aria-label', /unavailable/);
  await page.locator('[data-motion-toggle]').click();
  await expect(art).toHaveAttribute('data-playing', 'true');
  // The second playing event injects a frozen timeline with paused=false,
  // matching the observable decoder failure seen in Linux CI.
  await expect(video).toHaveAttribute('data-qa-timeline-frozen', 'true');
  await expect(video).toHaveJSProperty('paused', false);
  // A single delayed callback must reset observation, not declare a stall.
  await page.clock.fastForward(5000);
  await expect(art).toHaveAttribute('data-state', 'ready');
  await page.clock.runFor(4500);
  await expect(art).toHaveAttribute('data-state', 'unavailable', {
    timeout: 8000,
  });
  await expect(art).toHaveAttribute('data-playing', 'false');
  await expect(art).toHaveAttribute('aria-label', /Motion unavailable/);
  await expect(video).toBeHidden();
  await expect(art.locator('.art-poster')).toBeVisible();
});

if (process.platform === 'win32') {
  test('Windows WebKit native loop stop exposes the still fallback @motion @windows-native', async ({
    page,
  }, info) => {
    info.annotations.push({
      type: 'platform',
      description:
        'Windows WebKit Media Foundation stops this real native MP4 after its first loop. This test verifies graceful fallback, not successful uninterrupted looping. The same stop was reproduced on a minimal video without application code.',
    });
    await page.addInitScript(() => {
      const events: { name: string; currentTime: number; paused: boolean }[] =
        [];
      (
        window as Window & { nativeMediaEvents?: typeof events }
      ).nativeMediaEvents = events;
      for (const name of ['playing', 'pause']) {
        document.addEventListener(
          name,
          (event) => {
            if (!(event.target instanceof HTMLVideoElement)) return;
            events.push({
              name,
              currentTime: event.target.currentTime,
              paused: event.target.paused,
            });
          },
          true,
        );
      }
    });
    await page.goto('/');
    const art = page.locator('[data-native-hero]');
    const video = art.locator('[data-hero-video]');
    await expect(art).toHaveAttribute('data-state', 'unavailable', {
      timeout: 25_000,
    });
    await expect(art).toHaveAttribute('data-playing', 'false');
    await expect(art).toHaveAttribute('aria-label', /Motion unavailable/);
    await expect(video).toBeHidden();
    await expect(art.locator('.art-poster')).toBeVisible();
    const events = await page.evaluate(
      () =>
        (
          window as Window & {
            nativeMediaEvents?: {
              name: string;
              currentTime: number;
              paused: boolean;
            }[];
          }
        ).nativeMediaEvents || [],
    );
    expect(events.some((event) => event.name === 'playing')).toBe(true);
    expect(events.some((event) => event.name === 'pause' && event.paused)).toBe(
      true,
    );
    await info.attach('windows-webkit-native-loop-events', {
      body: JSON.stringify(events),
      contentType: 'application/json',
    });
  });
}

test('failed native hero media retains its poster across theme retries @motion', async ({
  page,
  request,
}) => {
  // The Windows WebKit native media loader bypasses route interception. Change
  // only the served asset-path fixture so every engine gets a real server404.
  let fixtureApplied = false;
  for (const mode of ['light', 'dark']) {
    const response = await request.get(
      `/media/hero/qa-missing-portal-${mode}.mp4`,
    );
    expect(response.status()).toBe(404);
  }
  await page.route('**/_astro/*.js', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    if (source.includes('/media/hero/portal-')) {
      fixtureApplied = true;
      await route.fulfill({
        response,
        body: source.replaceAll(
          '/media/hero/portal-',
          '/media/hero/qa-missing-portal-',
        ),
      });
    } else await route.fulfill({ response });
  });
  await page.goto('/');
  const art = page.locator('[data-native-hero]');
  const video = art.locator('[data-hero-video]');
  await expect(art).toHaveAttribute('data-state', 'unavailable');
  expect(fixtureApplied).toBe(true);
  await expect(video).toHaveAttribute(
    'src',
    '/media/hero/qa-missing-portal-light.mp4',
  );
  await expect(art).toHaveAttribute(
    'aria-label',
    /Motion unavailable; showing a still preview/,
  );
  await expect(art).toHaveAttribute('data-playing', 'false');
  await expect(video).toBeHidden();
  await expect(art.locator('.art-poster')).toBeVisible();
  await expect(art.locator('.art-poster')).toHaveCSS('opacity', '1');
  await expect
    .poll(() =>
      art
        .locator('.art-poster')
        .evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await theme(page, 'dark');
  await expect(video).toHaveAttribute(
    'src',
    '/media/hero/qa-missing-portal-dark.mp4',
  );
  await expect(art).toHaveAttribute('data-state', 'unavailable');
  await theme(page, 'light');
  await expect(art).toHaveAttribute('data-state', 'unavailable');
  await expect(art).toHaveAttribute(
    'aria-label',
    /Motion unavailable; showing a still preview/,
  );
  await expect(video).not.toHaveAttribute('src');
  await expect(video).toBeHidden();
});

test('native spark marks keep mobile identity clear without emoji or extra accessible names @keyboard', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  const headerBrand = page.locator('.site-header .brand');
  const footerBrand = page.locator('.footer-identity .brand');
  await expect(headerBrand).toHaveAccessibleName('WizardLoop home');
  await expect(footerBrand).toHaveAccessibleName('WizardLoop');
  for (const selector of [
    '.site-header .brand-spark',
    '.footer-identity .brand-spark',
    '.drawn-star',
    '.cta-spark',
  ]) {
    const mark = page.locator(selector);
    await expect(mark).toHaveCount(1);
    await expect(mark).toHaveAttribute('viewBox', '0 0 64 64');
    await expect(mark).toHaveAttribute('aria-hidden', 'true');
    await expect(mark).toHaveAttribute('focusable', 'false');
    expect(await mark.evaluate((node) => node instanceof SVGSVGElement)).toBe(
      true,
    );
    expect(Number(await mark.getAttribute('width'))).toBeGreaterThan(0);
    expect(Number(await mark.getAttribute('height'))).toBeGreaterThan(0);
    expect(await mark.textContent()).not.toMatch(/[\u2733\uFE0F]/u);
  }
  expect(await page.locator('body').innerText()).not.toMatch(/[\u2733\uFE0F]/u);
  for (const currentTheme of themes) {
    await theme(page, currentTheme);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => scrollTo(0, 0));
      const mark = await page
        .locator('.site-header .brand-spark')
        .boundingBox();
      const brand = await headerBrand.boundingBox();
      const controls = await page.locator('.header-controls').boundingBox();
      expect(mark).not.toBeNull();
      expect(brand).not.toBeNull();
      expect(controls).not.toBeNull();
      expect(mark!.width).toBeGreaterThanOrEqual(12);
      expect(Math.abs(mark!.width - mark!.height)).toBeLessThan(1);
      expect(mark!.x).toBeGreaterThanOrEqual(brand!.x);
      expect(mark!.x + mark!.width).toBeLessThanOrEqual(
        brand!.x + brand!.width + 1,
      );
      expect(brand!.x + brand!.width).toBeLessThanOrEqual(controls!.x + 1);
      await noOverflow(page, `SVG identity at ${width}px in ${currentTheme}`);
      await page.locator('[data-menu-toggle]').click();
      await expect(page.locator('#mobile-nav')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('[data-menu-toggle]')).toBeFocused();
    }
  }
});

test('the silver grimoire renders original moving pixels without shifting the three editorial layouts @motion', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, selector] of [
    ['/', '.post-comic [data-animation]'],
    ['/about/', '.about-profile [data-animation]'],
    ['/posts/', '.dispatch-grimoire'],
  ] as const) {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      '**/media/animations/silver-grimoire.tgs',
      async (route) => {
        await held;
        await route.continue();
      },
    );
    await page.goto(path);
    const art = page.locator(selector);
    await expect(art).toHaveAttribute('data-animation', 'silver-grimoire');
    await page.evaluate(() => document.fonts.ready);
    await art.scrollIntoViewIfNeeded();
    const poster = art.locator('.art-poster');
    await expect
      .poll(() =>
        poster.evaluate((node) => (node as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await expect(art).toHaveAttribute('data-state', 'poster');
    const before = await art.boundingBox();
    const pageHeight = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    release();
    await expect(art).toHaveAttribute('data-state', 'ready', {
      timeout: 25_000,
    });
    const canvas = art.locator('.art-player canvas');
    await expect(canvas).toHaveCount(1);
    const initial = await canvasFrame(canvas);
    await expect.poll(() => canvasFrame(canvas)).not.toBe(initial);
    const after = await art.boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    for (const key of ['x', 'y', 'width', 'height'] as const)
      expect(
        Math.abs(after![key] - before![key]),
        `${path}: ${key} stays stable when motion replaces its poster`,
      ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(
        (await page.evaluate(() => document.documentElement.scrollHeight)) -
          pageHeight,
      ),
    ).toBeLessThanOrEqual(1);
    await page.locator('[data-motion-toggle]').click();
    await expect(art).toHaveAttribute('data-playing', 'false');
    await waitForPaint(page);
    const frozen = await canvasFrame(canvas);
    await page.waitForTimeout(180);
    expect(await canvasFrame(canvas)).toBe(frozen);
    await noOverflow(page, `${path}: the grimoire at 390px`);
    await page.locator('[data-motion-toggle]').click();
    await page.unroute('**/media/animations/silver-grimoire.tgs');
  }
});

test('pausing while the grimoire is downloading keeps its poster until motion is resumed @motion', async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route('**/media/animations/silver-grimoire.tgs', async (route) => {
    requests += 1;
    await held;
    await route.continue();
  });
  await page.goto('/about/');
  const art = page.locator('.about-profile [data-animation]');
  await art.scrollIntoViewIfNeeded();
  await expect.poll(() => requests).toBe(1);
  await page.locator('[data-motion-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
  const response = page.waitForResponse(
    '**/media/animations/silver-grimoire.tgs',
  );
  release();
  await (await response).finished();
  await page.waitForTimeout(300);
  await expect(art).toHaveAttribute('data-state', 'poster');
  await expect(art.locator('canvas')).toHaveCount(0);
  await expect(art.locator('.art-poster')).toHaveCSS('opacity', '1');
  await page.locator('[data-motion-toggle]').click();
  await expect(art).toHaveAttribute('data-state', 'ready', { timeout: 25_000 });
  await expect(art.locator('canvas')).toHaveCount(1);
  const first = await canvasFrame(art.locator('canvas'));
  await expect.poll(() => canvasFrame(art.locator('canvas'))).not.toBe(first);
  expect(
    requests,
    'Resuming should reuse the successfully downloaded original.',
  ).toBe(1);
});

test('repeated grimoire instances share a download while keeping independent canvases and a real playback limit @motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  // Duplicate complete SSR components before the normal site module collects
  // artwork. The real renderer, data, intersections and pixels remain in use.
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const original = document.querySelector<HTMLElement>(
        '.about-profile [data-animation="silver-grimoire"]',
      );
      if (
        !original?.querySelector('.art-player') ||
        !original.querySelector('.art-poster') ||
        !document.body
      )
        return;
      observer.disconnect();
      const fixture = document.createElement('section');
      fixture.dataset.motionFixture = '';
      fixture.style.cssText =
        'position:fixed;left:40px;top:150px;display:flex;gap:24px;z-index:10;';
      const copies = [
        original,
        ...Array.from(
          { length: 3 },
          () => original.cloneNode(true) as HTMLElement,
        ),
      ];
      copies.forEach((node, index) => {
        node.dataset.fixtureArt = String(index);
        node.style.cssText = 'width:160px;height:160px;flex:none;';
        fixture.append(node);
      });
      document.body.append(fixture);
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  let requests = 0;
  await page.route('**/media/animations/silver-grimoire.tgs', async (route) => {
    requests += 1;
    await route.continue();
  });
  await page.goto('/about/');
  const copies = page.locator('[data-fixture-art]');
  await expect(copies).toHaveCount(4);
  await expect(
    page.locator('[data-fixture-art][data-playing="true"]'),
  ).toHaveCount(3, { timeout: 25_000 });
  await expect(page.locator('[data-fixture-art="3"] canvas')).toHaveCount(0);
  expect(
    requests,
    'Simultaneous instances should fetch and decode their shared source once.',
  ).toBe(1);
  for (let index = 0; index < 3; index += 1) {
    const canvas = copies.nth(index).locator('canvas');
    await expect(canvas).toHaveCount(1);
    const first = await canvasFrame(canvas);
    await expect
      .poll(() => canvasFrame(canvas), {
        message: `Instance ${index} renders changing pixels independently.`,
      })
      .not.toBe(first);
  }
  const firstArt = copies.nth(0);
  await firstArt.evaluate((node) => {
    node.style.transform = 'translateY(2000px)';
  });
  await expect(firstArt).toHaveAttribute('data-playing', 'false');
  await expect(copies.nth(3)).toHaveAttribute('data-playing', 'true');
  await expect(copies.nth(3).locator('canvas')).toHaveCount(1);
  await waitForPaint(page);
  const frozen = await canvasFrame(firstArt.locator('canvas'));
  const sibling = copies.nth(1).locator('canvas');
  const siblingFrame = await canvasFrame(sibling);
  await expect.poll(() => canvasFrame(sibling)).not.toBe(siblingFrame);
  expect(
    await canvasFrame(firstArt.locator('canvas')),
    'Offscreen instance freezes while its sibling continues.',
  ).toBe(frozen);
  await firstArt.evaluate((node) => {
    node.style.transform = '';
  });
  await copies.nth(1).evaluate((node) => {
    node.style.transform = 'translateY(2000px)';
  });
  await expect(firstArt).toHaveAttribute('data-playing', 'true');
  await expect
    .poll(() => canvasFrame(firstArt.locator('canvas')))
    .not.toBe(frozen);
  await expect(
    page.locator('[data-fixture-art][data-playing="true"]'),
  ).toHaveCount(3);
  await expect(page.locator('[data-fixture-art] canvas')).toHaveCount(4);
  expect(requests).toBe(1);
  await page.locator('[data-motion-toggle]').click();
  await expect(
    page.locator('[data-fixture-art][data-playing="true"]'),
  ).toHaveCount(0);
});

test('an offscreen pending grimoire defers its canvas and resumes cleanly after leaving and restoring the page @motion', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 600 });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route('**/media/animations/silver-grimoire.tgs', async (route) => {
    requests += 1;
    await held;
    await route.continue();
  });
  await page.goto('/about/');
  const art = page.locator('.about-profile [data-animation]');
  await art.scrollIntoViewIfNeeded();
  await expect.poll(() => requests).toBe(1);
  await page.locator('.site-footer').scrollIntoViewIfNeeded();
  await expect
    .poll(() => art.evaluate((node) => node.getBoundingClientRect().bottom))
    .toBeLessThan(0);
  await waitForPaint(page);
  const response = page.waitForResponse(
    '**/media/animations/silver-grimoire.tgs',
  );
  release();
  await (await response).finished();
  await page.waitForTimeout(300);
  await expect(art).toHaveAttribute('data-state', 'poster');
  await expect(art.locator('canvas')).toHaveCount(0);
  await art.scrollIntoViewIfNeeded();
  await expect(art).toHaveAttribute('data-playing', 'true', {
    timeout: 25_000,
  });
  await expect(art.locator('canvas')).toHaveCount(1);
  expect(requests).toBe(1);
  // Exercise the registered lifecycle handlers deterministically. This is
  // synthetic page-cache restoration, not a claim about browser BFCache policy.
  await page.evaluate(() =>
    dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
  );
  await expect(art).toHaveAttribute('data-state', 'poster');
  await expect(art.locator('canvas')).toHaveCount(0);
  await page.evaluate(() =>
    dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(art).toHaveAttribute('data-playing', 'true', {
    timeout: 25_000,
  });
  await expect(art.locator('canvas')).toHaveCount(1);
  const restored = await canvasFrame(art.locator('canvas'));
  await expect
    .poll(() => canvasFrame(art.locator('canvas')))
    .not.toBe(restored);
  expect(
    requests,
    'Restoring a page reuses its local parsed source and does not duplicate a request.',
  ).toBe(1);
});

test('original Canvas animation changes, freezes on pause and bounds active artwork @motion', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (resource) => requests.push(resource.url()));
  await page.goto('/about/');
  const art = page.locator('[data-animation]').first();
  await art.scrollIntoViewIfNeeded();
  await expect(art).toHaveAttribute('data-state', 'ready', { timeout: 25_000 });
  await expect(art).toHaveAttribute('data-playing', 'true');
  const canvas = art.locator('.art-player canvas');
  await expect(canvas).toBeVisible();
  const frame = () =>
    canvas.evaluate((element) => {
      const bitmap = element as HTMLCanvasElement;
      const pixels = bitmap
        .getContext('2d')!
        .getImageData(0, 0, bitmap.width, bitmap.height).data;
      let hash = 2166136261;
      for (let index = 0; index < pixels.length; index += 13)
        hash = Math.imul(hash ^ pixels[index], 16777619) >>> 0;
      return `${bitmap.width}x${bitmap.height}:${hash}`;
    });
  const initial = await frame();
  await expect
    .poll(frame, {
      message:
        'The actual rendered Canvas pixels must change while animation is running.',
    })
    .not.toBe(initial);
  expect(
    requests.some((url) => /\/media\/animations\/[^/]+\.tgs(?:\?|$)/.test(url)),
  ).toBe(true);
  await page.locator('[data-motion-toggle]').click();
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
  await expect(art).toHaveAttribute('data-playing', 'false');
  const frozen = await frame();
  await page.waitForTimeout(250);
  expect(await frame(), 'Pausing freezes the actual Canvas pixels.').toBe(
    frozen,
  );
  await page.locator('[data-motion-toggle]').click();
  await expect(art).toHaveAttribute('data-playing', 'true');
  await expect
    .poll(frame, { message: 'Resuming advances the rendered animation again.' })
    .not.toBe(frozen);
  const desktopWidth = await canvas.evaluate(
    (element) => (element as HTMLCanvasElement).width,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await art.scrollIntoViewIfNeeded();
  await expect
    .poll(
      () => canvas.evaluate((element) => (element as HTMLCanvasElement).width),
      { message: 'The Canvas backing bitmap must resize with the artwork.' },
    )
    .not.toBe(desktopWidth);
  const dimensions = await canvas.evaluate((element) => {
    const bitmap = element as HTMLCanvasElement;
    const bounds = bitmap.getBoundingClientRect();
    return {
      width: bitmap.width,
      height: bitmap.height,
      cssWidth: bounds.width,
      cssHeight: bounds.height,
      left: bounds.left,
      right: bounds.right,
    };
  });
  expect(dimensions.width).toBeGreaterThan(0);
  expect(dimensions.height).toBeGreaterThan(0);
  expect(
    Math.abs(
      dimensions.width / dimensions.height -
        dimensions.cssWidth / dimensions.cssHeight,
    ),
    'Backing and displayed aspect ratios must agree after resizing.',
  ).toBeLessThan(0.02);
  expect(dimensions.left).toBeGreaterThanOrEqual(-1);
  expect(dimensions.right).toBeLessThanOrEqual(391);
  await noOverflow(page, 'Resized active Canvas artwork');
  await page.setViewportSize({ width: 1440, height: 2000 });
  await page.goto('/about/');
  await page.locator('[data-animation]').first().scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.locator('[data-animation][data-playing="true"]').count())
    .toBeGreaterThan(0);
  await page.waitForLoadState('networkidle');
  expect(
    await page.locator('[data-animation][data-playing="true"]').count(),
    'Visible original artwork must respect the concurrent playback limit.',
  ).toBeLessThanOrEqual(3);
  await page.locator('[data-motion-toggle]').click();
  await expect(
    page.locator('[data-animation][data-playing="true"]'),
  ).toHaveCount(0);
});

test('failed original animation keeps its poster and readable status @motion', async ({
  page,
}) => {
  await page.route('**/media/animations/*.tgs', (route) =>
    route.abort('failed'),
  );
  await page.goto('/about/');
  const art = page.locator('[data-animation]').first();
  await art.scrollIntoViewIfNeeded();
  await expect(art).toHaveAttribute('data-state', 'unavailable');
  await expect(art).toHaveAttribute(
    'aria-label',
    /Motion unavailable; showing a still preview/,
  );
  await expect(art.locator('.art-player canvas')).toHaveCount(0);
  await expect(art.locator('.art-poster')).toBeVisible();
  await expect(art.locator('.art-poster')).toHaveCSS('opacity', '1');
  await expect
    .poll(() =>
      art
        .locator('.art-poster')
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
});

for (const [path, destination] of [
  ['/work/', 'https://t.me/wizard_loop'],
  ['/projects/', 'https://github.com/WizardLoop?tab=repositories'],
  ['/posts/', 'https://t.me/s/wizard_loop'],
] as const) {
  test(`${path} offers the requested direct destination without a local collection @smoke @links`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    const links = page.locator(`main a[href="${destination}"]`);
    expect(await links.count()).toBeGreaterThan(0);
    await expect(links.first()).toBeVisible();
    await expect(links.first()).toHaveAccessibleName(/\S/);
    await expect(
      page.locator(
        'main form, main iframe, .collection-grid, [data-show-collection], [data-post-id], [data-telegram-feed]',
      ),
    ).toHaveCount(0);
    if (path === '/work/') {
      await expect(
        page.locator('main [data-animation], main figure'),
      ).toHaveCount(0);
    }
    if (path === '/projects/') {
      await expect(
        page.locator('main a[href^="https://github.com/WizardLoop/"]'),
      ).toHaveCount(0);
    }
  });
}

test('contact keeps the verified Telegram and email links keyboard accessible without collecting fields @privacy @keyboard', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/feedback/');
  await page.keyboard.press('Tab');
  for (const href of [
    'https://t.me/wizardloop',
    'mailto:wizard@wizardloop.com',
  ]) {
    const link = page.locator(`main a[href="${href}"]`).first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAccessibleName(/\S/);
    await link.focus();
    await expect(link).toBeFocused();
    expect(
      await link.evaluate((element) => getComputedStyle(element).outlineStyle),
    ).not.toBe('none');
  }
  await expect(
    page.locator(
      'form, input, textarea, select, iframe, [data-feedback-submit], [data-verify-start]',
    ),
  ).toHaveCount(0);
  expect(
    new URL(page.url()).search,
    'Contact details must not be entered into a local submission URL.',
  ).toBe('');
});

test('direct contact and gateway links work without JavaScript @smoke @privacy', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  });
  try {
    const page = await context.newPage();
    for (const [path, hrefs] of [
      [
        '/feedback/',
        ['https://t.me/wizardloop', 'mailto:wizard@wizardloop.com'],
      ],
      ['/work/', ['https://t.me/wizard_loop']],
      ['/projects/', ['https://github.com/WizardLoop?tab=repositories']],
      ['/posts/', ['https://t.me/s/wizard_loop']],
    ] as const) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      for (const href of hrefs)
        await expect(
          page.locator(`main a[href="${href}"]`).first(),
        ).toBeVisible();
      await expect(page.locator('form, iframe')).toHaveCount(0);
      if (path === '/feedback/')
        await expect(page.locator('[data-copy-email]')).toBeHidden();
    }
  } finally {
    await context.close();
  }
});

for (const outcome of ['success', 'denied'] as const) {
  test(`copy email ${outcome} preserves focus, prevents duplicate writes and keeps the narrow layout stable @privacy @keyboard`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      const fixture = {
        calls: [] as string[],
        finish: (_success: boolean) => {},
      };
      (window as Window & { qaClipboard?: typeof fixture }).qaClipboard =
        fixture;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText(address: string) {
            fixture.calls.push(address);
            return new Promise<void>((resolve, reject) => {
              fixture.finish = (success) =>
                success
                  ? resolve()
                  : reject(
                      new DOMException(
                        'Local permission-denied fixture',
                        'NotAllowedError',
                      ),
                    );
            });
          },
        },
      });
    });
    await page.goto('/feedback/');
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    const button = page.locator('[data-copy-email]');
    const status = page.locator('[data-copy-status]');
    const help = page.locator('.destination-contact-help').first();
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute(
      'data-copy-email',
      'wizard@wizardloop.com',
    );
    await expect(status).toHaveAttribute('role', 'status');
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await page.keyboard.press('Tab');
    await button.focus();
    const helpPosition = () =>
      help.evaluate(
        (element) => element.getBoundingClientRect().top + window.scrollY,
      );
    const before = await helpPosition();
    await page.keyboard.press('Enter');
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await expect(button).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Enter');
    expect(
      await page.evaluate(
        () =>
          (window as Window & { qaClipboard?: { calls: string[] } })
            .qaClipboard!.calls,
      ),
    ).toEqual(['wizard@wizardloop.com']);
    await page.evaluate((success) => {
      (
        window as Window & {
          qaClipboard?: { finish: (success: boolean) => void };
        }
      ).qaClipboard!.finish(success);
    }, outcome === 'success');
    await expect(status).toHaveText(
      outcome === 'success'
        ? 'Email address copied. Paste it into your message.'
        : 'Copy unavailable. Select: wizard@wizardloop.com',
    );
    await expect(button).toBeFocused();
    await expect(button).not.toHaveAttribute('aria-busy');
    await expect(button).not.toHaveAttribute('aria-disabled');
    await expect(button).toBeEnabled();
    expect(
      Math.abs((await helpPosition()) - before),
      'The reserved status area must not shift the following help text at 320px.',
    ).toBeLessThanOrEqual(1);
    await expect(
      page.locator('main a[href="mailto:wizard@wizardloop.com"]'),
    ).toBeVisible();
    await noOverflow(page, `Copy email ${outcome} at 320px`);
  });
}

test('copy email stays hidden when the Clipboard API is unavailable @privacy', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/feedback/');
  await expect(page.locator('[data-copy-email]')).toBeHidden();
  await expect(page.locator('[data-copy-status]')).toBeEmpty();
  await expect(
    page.locator('main a[href="mailto:wizard@wizardloop.com"]'),
  ).toBeVisible();
});

test('the profile is a dimensioned local still with no provider or synchronization dependency @profile', async ({
  page,
  baseURL,
}) => {
  const outbound: string[] = [];
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== new URL(baseURL!).origin) {
      outbound.push(route.request().url());
      await route.abort('blockedbyclient');
    } else await route.continue();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/about/');
  const image = page.locator('img[data-profile-image]');
  await expect(image).toHaveAttribute('src', '/media/profile/avatar.jpg');
  await expect(image).toHaveAttribute('width', '96');
  await expect(image).toHaveAttribute('height', '96');
  await expect(image).toHaveAttribute('alt', 'My public profile artwork');
  await expect(
    page.locator('[data-profile-video], [data-profile-source]'),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      image.evaluate((element) => {
        const photo = element as HTMLImageElement;
        return photo.complete && photo.naturalWidth > 0;
      }),
    )
    .toBe(true);
  expect(outbound).toEqual([]);
});

test('a missing local profile image uses the local artwork fallback @profile', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await page.route('**/media/profile/avatar.jpg', (route) =>
    route.abort('failed'),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/about/');
  const image = page.locator('img[data-profile-image]');
  await expect(image).toHaveAttribute('src', '/media/profile/fallback.svg');
  await expect(image).toHaveAttribute('width', '96');
  await expect(image).toHaveAttribute('height', '96');
  await expect
    .poll(() =>
      image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  expect(
    requested.filter((url) =>
      /github\.com|githubusercontent\.com|t\.me|telegram\.org/.test(
        new URL(url).hostname,
      ),
    ),
  ).toEqual([]);
});

test('Home introduces the creator without listing individual projects or collections @smoke', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('[data-native-hero]')).toBeVisible();
  await expect(
    page.locator(
      'main .collection-grid, main .project-row, main .project-feature, main a[href^="https://github.com/WizardLoop/"]',
    ),
  ).toHaveCount(0);
  for (const href of ['/about/', '/work/', '/projects/', '/posts/']) {
    expect(await page.locator(`a[href="${href}"]`).count()).toBeGreaterThan(0);
  }
});

for (const path of [
  '/',
  '/about/',
  '/work/',
  '/projects/',
  '/posts/',
  '/feedback/',
]) {
  for (const currentTheme of themes) {
    for (const width of [390, 1440]) {
      test(`axe ${path} ${currentTheme} ${width}px @axe`, async ({
        page,
      }, info) => {
        await page.setViewportSize({
          width,
          height: width === 390 ? 844 : 1000,
        });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(path);
        await theme(page, currentTheme);
        await settle(page);
        await page.addScriptTag({
          content: await readFile(
            resolve('node_modules/axe-core/axe.min.js'),
            'utf8',
          ),
        });
        const results = await page.evaluate(async () => {
          const axe = (
            window as unknown as {
              axe: {
                run: (
                  node: Document,
                  options: object,
                ) => Promise<{
                  violations: Array<{
                    id: string;
                    impact: string;
                    description: string;
                    nodes: Array<{ target: string[]; failureSummary: string }>;
                  }>;
                }>;
              };
            }
          ).axe;
          return await axe.run(document, {
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'],
            },
          });
        });
        const violations = results.violations.map((item) => ({
          id: item.id,
          impact: item.impact,
          description: item.description,
          nodes: item.nodes.map((node) => ({
            target: node.target,
            failure: node.failureSummary,
          })),
        }));
        await info.attach('axe-results', {
          body: JSON.stringify(
            { path, theme: currentTheme, width, violations },
            null,
            2,
          ),
          contentType: 'application/json',
        });
        expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
      });
    }
  }
}
