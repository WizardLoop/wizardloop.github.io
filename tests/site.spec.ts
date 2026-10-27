import { test, expect, type Page, type TestInfo } from '@playwright/test';
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
const provider = (url: string) =>
  /(^|\.)(telegram\.org|t\.me|telegram-cdn\.org|telesco\.pe|cloudflare\.com)$/.test(
    new URL(url).hostname,
  );
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
  });

  test(`${name}: six widths in light and dark @matrix`, async ({
    page,
  }, info) => {
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
}) => {
  const requests: string[] = [];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/');
  await settle(page);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForLoadState('networkidle');
  await page.goto('/work/');
  await page.locator('[data-animation]').first().scrollIntoViewIfNeeded();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'paused');
  expect(
    requests.filter((url) =>
      /\/media\/hero\/[^/]+\.mp4|\.tgs(?:\?|$)|lottie[_./-]/i.test(url),
    ),
    'Reduced motion must avoid hero video, TGS and the Lottie player',
  ).toEqual([]);
  expect(
    requests.filter(provider),
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

test('native hero video plays, pauses, resumes and follows the selected theme @motion', async ({
  page,
  browserName,
  request,
}) => {
  test.skip(
    browserName === 'webkit' && process.platform === 'win32',
    'Windows WebKit Media Foundation stops native looping after one cycle, reproduced with a minimal video element. Its dedicated real-media test verifies the graceful still fallback; uninterrupted looping is not verified on this platform.',
  );
  const supportsH264 = await page.evaluate(() =>
    document
      .createElement('video')
      .canPlayType('video/mp4; codecs="avc1.42E01E"'),
  );
  test.skip(
    !supportsH264,
    'This browser installation does not advertise H.264 playback.',
  );
  await page.goto('/');
  const art = page.locator('[data-native-hero]');
  const video = art.locator('[data-hero-video]');
  await expect(art).toHaveAttribute('data-state', 'ready', { timeout: 25_000 });
  await expect(art).toHaveAttribute('data-playing', 'true');
  await expect(video).toHaveAttribute('src', '/media/hero/portal-light.mp4');
  const manifestResponse = await request.get('/media/hero/manifest.json');
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
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

test('Work progressively reveals original artwork with focus and deferred assets @keyboard', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const requested: string[] = [];
  page.on('request', (request) => requested.push(request.url()));
  await page.goto('/work/');
  const figures = page.locator('.collection-grid > figure');
  await expect(figures).toHaveCount(30);
  await expect(page.locator('.collection-grid > figure:visible')).toHaveCount(
    9,
  );
  await expect(page.locator('.extra-artwork[hidden]')).toHaveCount(21);
  await expect(page.locator('[data-show-collection]')).toBeVisible();
  await page.waitForLoadState('networkidle');
  const deferredPosters = await page
    .locator('.extra-artwork img')
    .evaluateAll((images) =>
      images.map((image) => (image as HTMLImageElement).src),
    );
  expect(
    requested.filter((url) => deferredPosters.includes(url)),
    'Initially hidden gallery posters should not download.',
  ).toEqual([]);
  await page.locator('[data-show-collection]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.collection-grid > figure:visible')).toHaveCount(
    30,
  );
  await expect(
    page.locator('.extra-artwork').first().locator('h3'),
  ).toBeFocused();
  await expect(page.locator('[data-show-collection]')).toBeHidden();
  await noOverflow(page, 'Expanded original artwork gallery');
});

test('Work retains every original artwork when JavaScript is unavailable @smoke', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  });
  try {
    const page = await context.newPage();
    await page.goto('/work/');
    await expect(page.locator('.collection-grid > figure:visible')).toHaveCount(
      30,
    );
    await expect(page.locator('[data-show-collection]')).toBeHidden();
    await expect(page.locator('.art-player canvas')).toHaveCount(0);
    await expect(page.locator('.collection-grid h3')).toHaveCount(30);
    await noOverflow(page, 'Artwork collection without JavaScript');
  } finally {
    await context.close();
  }
});

test('original Canvas animation changes, freezes on pause and bounds active artwork @motion', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (resource) => requests.push(resource.url()));
  await page.goto('/work/');
  const art = page.locator('.collection-grid [data-animation]').first();
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
  await page.goto('/work/');
  await page.locator('.collection-grid').scrollIntoViewIfNeeded();
  await expect
    .poll(() => page.locator('[data-animation][data-playing="true"]').count())
    .toBeGreaterThan(0);
  await page.waitForLoadState('networkidle');
  expect(
    await page.locator('[data-animation][data-playing="true"]').count(),
    'The long collection must bound concurrent artwork playback.',
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
  await page.goto('/work/');
  const art = page.locator('.collection-grid [data-animation]').first();
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

test('video pause/resume and reduced motion using a local canvas-stream fixture @motion', async ({
  page,
}) => {
  await page.goto('/about/');
  const supported = await page.evaluate(
    () => typeof HTMLCanvasElement.prototype.captureStream === 'function',
  );
  test.skip(
    !supported,
    'This browser does not support the local canvas media fixture; real Telegram video remains an integration test.',
  );
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#7751d4';
    context.fillRect(0, 0, 16, 16);
    const video = document.createElement('video');
    video.id = 'qa-profile-video-fixture';
    video.dataset.profileVideo = '';
    video.muted = true;
    video.playsInline = true;
    video.width = 16;
    video.height = 16;
    video.setAttribute('aria-label', 'Local QA media fixture');
    video.srcObject = canvas.captureStream(1);
    document.querySelector('main')!.append(video);
    await video.play();
  });
  const video = page.locator('#qa-profile-video-fixture');
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).paused),
    )
    .toBe(false);
  await page.locator('[data-motion-toggle]').click();
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).paused),
    )
    .toBe(true);
  await page.locator('[data-motion-toggle]').click();
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).paused),
    )
    .toBe(false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).paused),
    )
    .toBe(true);
});

async function fixtureTelegram(page: Page) {
  await page.route('https://telegram.org/js/telegram-widget.js*', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `(() => { const script = document.currentScript; if (!script) return; const frame = document.createElement('iframe'); frame.src = 'https://t.me/' + script.dataset.telegramPost + '?embed=1'; frame.dataset.qaFixture = 'true'; frame.style.width = '100%'; frame.style.height = '180px'; frame.style.border = '0'; script.parentElement.append(frame); })();`,
    }),
  );
  await page.route('https://t.me/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Telegram QA fixture</title></head><body><p>Deterministic test fixture. This is not a live Telegram post.</p><svg width="40" height="40" aria-label="Fixture motion"><circle cx="20" cy="20" r="12" fill="#7751d4"/></svg></body></html>',
    }),
  );
}

test('Telegram requests wait for consent; pause and revoke remove embedded frames @privacy', async ({
  page,
}) => {
  const requests: string[] = [];
  await fixtureTelegram(page);
  page.on('request', (request) => {
    if (provider(request.url())) requests.push(request.url());
  });
  await page.goto('/posts/');
  await page.waitForLoadState('networkidle');
  expect(requests).toEqual([]);
  await expect(page.locator('[data-telegram-slot] iframe')).toHaveCount(0);
  const count = Math.min(6, await page.locator('[data-telegram-slot]').count());
  expect(count).toBeGreaterThan(0);
  await page.locator('[data-telegram-load]').click();
  await expect(page.locator('[data-telegram-slot] iframe')).toHaveCount(count);
  await expect(
    page.locator('[data-telegram-slot] iframe').first(),
  ).toHaveAttribute('title', /Original Telegram post/);
  expect(
    await page.evaluate(() =>
      localStorage.getItem('wizardloop-telegram-consent'),
    ),
  ).toBe('yes');
  expect(requests.length).toBeGreaterThan(0);
  await page.locator('[data-motion-toggle]').click();
  await expect(page.locator('[data-telegram-slot] iframe')).toHaveCount(0);
  await expect(page.locator('[data-telegram-status]')).toContainText(
    'motion is paused',
  );
  await page.locator('[data-motion-toggle]').click();
  await expect(page.locator('[data-telegram-slot] iframe')).toHaveCount(count);
  await page.locator('[data-telegram-reset]').click();
  await expect(page.locator('[data-telegram-slot] iframe')).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      localStorage.getItem('wizardloop-telegram-consent'),
    ),
  ).toBe('no');
  requests.length = 0;
  await page.reload();
  await page.waitForLoadState('networkidle');
  expect(requests).toEqual([]);
});

test('privacy preferences dialog can grant and withdraw Telegram permission @privacy @keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixtureTelegram(page);
  await page.goto('/posts/');
  await page.waitForLoadState('networkidle');
  const opener = page.locator('[data-privacy-open]').first();
  await opener.click();
  const dialog = page.locator('#privacy-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#telegram-consent')).not.toBeChecked();
  await page.locator('#telegram-consent').check();
  await page.locator('[data-privacy-save]').click();
  await expect(dialog).not.toBeVisible();
  await expect(opener).toBeFocused();
  await expect(
    page.locator('[data-telegram-slot] iframe').first(),
  ).toBeAttached();
  await opener.click();
  await page.locator('#telegram-consent').uncheck();
  await page.locator('[data-privacy-save]').click();
  await expect(page.locator('[data-telegram-slot] iframe')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('Telegram failure leaves original links and a working retry path @privacy', async ({
  page,
}) => {
  await page.route('https://telegram.org/js/telegram-widget.js*', (route) =>
    route.abort('failed'),
  );
  await page.goto('/posts/');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-telegram-load]').click();
  await expect(page.locator('[data-telegram-slot]').first()).toContainText(
    'could not load',
  );
  expect(
    await page.locator('.telegram-card a[href^="https://t.me/"]').count(),
  ).toBeGreaterThan(0);
  await page.unroute('https://telegram.org/js/telegram-widget.js*');
  await fixtureTelegram(page);
  await page.locator('[data-telegram-retry]').click();
  await expect(
    page.locator('[data-telegram-slot] iframe').first(),
  ).toBeAttached();
});

test('long-feed fixture reveals six posts at a time without restarting existing embeds @privacy @keyboard', async ({
  page,
}) => {
  await fixtureTelegram(page);
  await page.route('**/posts/', async (route) => {
    const response = await route.fetch();
    let html = await response.text();
    const articles =
      html.match(/<article class="telegram-card"[^>]*>[\s\S]*?<\/article>/g) ||
      [];
    expect(
      articles.length,
      'The fixture extends the real static post markup.',
    ).toBeGreaterThan(0);
    const original = articles[0];
    const fixtureArticles = Array.from({ length: 13 }, (_, index) =>
      original
        .replace(/wizard_loop\/\d+/gi, `wizard_loop/${7000 + index}`)
        .replace(
          /<h2[^>]*>[\s\S]*?<\/h2>/,
          `<h2 dir="auto">Local QA post fixture ${index + 1}</h2>`,
        ),
    ).join('');
    let inserted = false;
    html = html.replace(
      /<article class="telegram-card"[^>]*>[\s\S]*?<\/article>/g,
      () => {
        if (inserted) return '';
        inserted = true;
        return fixtureArticles;
      },
    );
    await route.fulfill({ response, body: html });
  });
  await page.goto('/posts/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.telegram-card:visible')).toHaveCount(6);
  await expect(page.locator('[data-telegram-slot] iframe')).toHaveCount(0);
  await page.locator('[data-telegram-load]').click();
  await expect(page.locator('[data-telegram-slot] iframe')).toHaveCount(6);
  await page.locator('[data-telegram-slot] iframe').evaluateAll((frames) =>
    frames.forEach((frame) => {
      (frame as HTMLElement).dataset.qaOriginalFrame = 'true';
    }),
  );
  const more = page.locator('[data-posts-more]');
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.telegram-card:visible')).toHaveCount(12);
  await expect(
    page.locator('.telegram-card').nth(6).locator('h2'),
  ).toBeFocused();
  await expect(page.locator('[data-telegram-slot] iframe')).toHaveCount(12);
  await expect(
    page.locator('iframe[data-qa-original-frame]'),
    'Already-loaded frames retain their DOM identity.',
  ).toHaveCount(6);
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.telegram-card:visible')).toHaveCount(13);
  await expect(
    page.locator('.telegram-card').nth(12).locator('h2'),
  ).toBeFocused();
  await expect(more).toBeHidden();
  await expect(page.locator('[data-telegram-slot] iframe')).toHaveCount(13);
  await expect(page.locator('iframe[data-qa-original-frame]')).toHaveCount(6);
});

test('profile falls back from Telegram to GitHub while retaining dimensions @profile', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/media/profile/avatar.jpg', (route) =>
    route.abort('failed'),
  );
  await page.goto('/about/');
  const image = page.locator('img[data-profile-image]');
  await expect(image).toHaveAttribute('src', '/media/profile/github.jpg');
  await expect(page.locator('[data-profile-source]')).toContainText('GitHub');
  await expect
    .poll(() =>
      image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(image).toHaveAttribute('width', '96');
  await expect(image).toHaveAttribute('height', '96');
});

test('both profile providers can fail without losing the local fallback @profile', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/media/profile/avatar.jpg', (route) =>
    route.abort('failed'),
  );
  await page.route('**/media/profile/github.jpg', (route) =>
    route.abort('failed'),
  );
  await page.goto('/about/');
  const image = page.locator('img[data-profile-image]');
  await expect(image).toHaveAttribute('src', '/media/profile/fallback.svg');
  await expect(page.locator('[data-profile-source]')).toContainText('Local');
  await expect
    .poll(() =>
      image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
});

test('unavailable profile video fixture retains a usable image and respects reduced motion @profile @motion', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/about/', async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace(
      /<img\b(?=[^>]*data-profile-image)[^>]*>/,
      (image) =>
        `<video id="qa-unavailable-profile-video" data-profile-video muted loop playsinline preload="none" width="96" height="96" aria-label="Local unavailable-media fixture"></video>${image.replace('<img', '<img hidden')}`,
    );
    await route.fulfill({ response, body: html });
  });
  await page.route('**/media/profile/qa-unavailable.mp4', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'text/plain',
      body: 'Local QA missing-media fixture.',
    }),
  );
  await page.goto('/about/');
  await page.waitForLoadState('networkidle');
  const video = page.locator('#qa-unavailable-profile-video');
  await expect(video).not.toHaveAttribute('autoplay');
  expect(
    await video.evaluate((element) => (element as HTMLVideoElement).paused),
  ).toBe(true);
  await video.evaluate((element) => {
    const media = element as HTMLVideoElement;
    media.src = '/media/profile/qa-unavailable.mp4';
    media.load();
  });
  await expect(video).toBeHidden();
  const image = page.locator('img[data-profile-image]');
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
});

test('mocked Turnstile retry resets the existing widget without duplicate renders @privacy', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (
      /challenges\.cloudflare\.com|feedback-fixture\.invalid/.test(
        request.url(),
      )
    )
      externalRequests.push(request.url());
  });
  await page.route('**/feedback/', async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace(
      /<form\b[^>]*data-feedback-form[^>]*>/,
      (form) =>
        form
          .replace(
            /data-endpoint(?:="[^"]*")?/,
            'data-endpoint="https://feedback-fixture.invalid/feedback"',
          )
          .replace(
            /data-sitekey(?:="[^"]*")?/,
            'data-sitekey="qa-turnstile-fixture"',
          ),
    );
    await route.fulfill({ response, body: html });
  });
  await page.route('https://feedback-fixture.invalid/**', (route) =>
    route.abort('blockedbyclient'),
  );
  await page.route('https://challenges.cloudflare.com/turnstile/**', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `(() => {
    const state = window.__qaTurnstile = { renders: 0, resets: 0, ids: [] };
    let callbacks;
    window.turnstile = {
      render(target, options) { state.renders++; callbacks = options; setTimeout(() => callbacks['error-callback']('local-fixture-error'), 0); return 'qa-widget-1'; },
      reset(id) { state.resets++; state.ids.push(id); setTimeout(() => callbacks.callback('local-fixture-token'), 0); }
    };
  })();`,
    }),
  );
  await page.goto('/feedback/');
  await page.waitForLoadState('networkidle');
  expect(externalRequests).toEqual([]);
  await expect(page.locator('[data-local-demo]')).toBeHidden();
  const verify = page.locator('[data-verify-start]');
  await verify.click();
  await expect(page.locator('[data-verification-state]')).toContainText(
    'could not complete',
  );
  await expect(verify).toBeEnabled();
  await verify.click();
  await expect(page.locator('[data-verification-state]')).toContainText(
    'Verification complete',
  );
  const state = await page.evaluate(
    () =>
      (
        window as unknown as {
          __qaTurnstile: { renders: number; resets: number; ids: string[] };
        }
      ).__qaTurnstile,
  );
  expect(state).toEqual({ renders: 1, resets: 1, ids: ['qa-widget-1'] });
  expect(
    externalRequests.filter((url) => url.includes('challenges.cloudflare.com')),
  ).toHaveLength(1);
  expect(
    externalRequests.filter((url) => url.includes('feedback-fixture.invalid')),
  ).toEqual([]);
});

test('feedback cannot submit personal fields through a URL when JavaScript is unavailable @privacy', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    baseURL,
  });
  const page = await context.newPage();
  try {
    await page.goto('/feedback/');
    await expect(page.locator('[data-feedback-controls]')).toHaveAttribute(
      'disabled',
    );
    await expect(page.locator('[data-feedback-submit]')).toBeDisabled();
    await expect(page.locator('[data-verify-start]')).toBeDisabled();
    for (const id of ['feedback-name', 'feedback-message', 'feedback-email'])
      await expect(page.locator(`#${id}`)).toBeDisabled();
    await expect(page.locator('[data-feedback-form]')).toHaveAttribute(
      'method',
      /post/i,
    );
    const notice = page.locator('noscript .notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(
      'The form needs JavaScript for verification.',
    );
    expect(
      new URL(page.url()).search,
      'Form content must never enter URL query parameters.',
    ).toBe('');
    await expect(
      page.locator('noscript a[href="mailto:wizard@wizardloop.com"]'),
    ).toBeVisible();
    await expect(
      page.locator('noscript a[href="https://t.me/wizardloop"]'),
    ).toBeVisible();
  } finally {
    await context.close();
  }
});

for (const path of ['/', '/about/', '/work/', '/posts/', '/feedback/']) {
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
