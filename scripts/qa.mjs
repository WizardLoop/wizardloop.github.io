import { chromium, firefox, webkit } from '@playwright/test';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const base = 'http://127.0.0.1:4321';
const artifactDir = 'artifacts';
await mkdir(artifactDir, { recursive: true });
let server;
try { await fetch(base); } catch {
  server = spawn(process.execPath, ['scripts/preview.mjs'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(base); break; } catch { await new Promise(r => setTimeout(r, 100)); } }
}
const report = { date: '2026-10-27', scope: 'Phase 1 local concepts only', results: [], failures: [], unavailable: [] };
const assert = (condition, label) => { if (!condition) report.failures.push(label); };
const browsers = process.argv.includes('--all-browsers') ? { chromium, firefox, webkit } : { chromium };
try {
  for (const [browserName, launcher] of Object.entries(browsers)) {
    let browser;
    try {
      const options = { headless: true };
      const localChrome = 'C:/Users/ADMIN/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe';
      if (browserName === 'chromium' && process.platform === 'win32') { try { await access(localChrome); options.executablePath = localChrome; } catch {} }
      browser = await launcher.launch(options);
    } catch (error) { report.unavailable.push({ browser: browserName, reason: error.message.split('\n')[0] }); continue; }
    for (const concept of ['a', 'b', 'c']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      for (const theme of ['light', 'dark']) {
        for (const width of [320, 360, 390, 768, 1024, 1440]) {
          const height = width < 768 ? 844 : 1000;
          await page.setViewportSize({ width, height });
          const response = await page.goto(`${base}/concept-${concept}/?theme=${theme}`, { waitUntil: 'networkidle' });
          await page.evaluate(() => document.fonts.ready);
          const prefix = `${browserName}/${concept}/${theme}/${width}`;
          assert(response.status() === 200, `${prefix}: direct route`);
          assert(await page.locator('h1').count() === 1, `${prefix}: single h1`);
          const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
          assert(dimensions.scroll <= dimensions.width, `${prefix}: horizontal overflow ${dimensions.scroll}`);
          assert(await page.locator('html').getAttribute('data-theme') === theme, `${prefix}: theme`);
          await page.locator('img').evaluateAll(imgs => Promise.all(imgs.map(async img => { img.loading = 'eager'; try { await img.decode(); } catch {} })));
          const missing = await page.locator('img').evaluateAll(imgs => imgs.filter(img => !img.complete || img.naturalWidth === 0).map(img => img.src));
          assert(missing.length === 0, `${prefix}: missing images ${missing}`);
          if (browserName === 'chromium' && [390, 1440].includes(width)) {
            await page.locator('html').evaluate(el => { el.dataset.motion = 'paused'; });
            await page.screenshot({ path: `${artifactDir}/concept-${concept}-${theme}-${width}.png`, fullPage: true });
            await page.screenshot({ path: `${artifactDir}/concept-${concept}-${theme}-${width}-hero.png` });
            await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
            const axe = await page.evaluate(async () => {
              const results = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
              return results.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }));
            });
            assert(axe.length === 0, `${prefix}: axe ${JSON.stringify(axe)}`);
            report.results.push({ browser: browserName, concept, theme, width, axeViolations: axe.length, overflow: dimensions.scroll - dimensions.width });
          } else report.results.push({ browser: browserName, concept, theme, width, overflow: dimensions.scroll - dimensions.width });
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${base}/concept-${concept}/`);
      const trigger = page.locator('[data-menu-toggle]');
      await trigger.click();
      assert(await page.locator('#mobile-nav').isVisible(), `${concept}: menu visible`);
      assert(await page.evaluate(() => document.body.style.overflow) === 'hidden', `${concept}: menu scroll lock`);
      const menuBox = await page.locator('#mobile-nav').boundingBox();
      assert(menuBox.x >= 0 && menuBox.y >= 0 && menuBox.x + menuBox.width <= 391 && menuBox.y + menuBox.height <= 845, `${concept}: menu in viewport`);
      for (let i = 0; i < 18; i++) { await page.keyboard.press('Tab'); assert(await page.evaluate(() => document.querySelector('#mobile-nav').contains(document.activeElement)), `${concept}: Tab trap ${i}`); }
      await page.keyboard.press('Shift+Tab');
      assert(await page.evaluate(() => document.querySelector('#mobile-nav').contains(document.activeElement)), `${concept}: reverse Tab trap`);
      await page.keyboard.press('Escape');
      assert(await trigger.evaluate(el => el === document.activeElement), `${concept}: focus restoration`);
      assert(await page.locator('#mobile-nav').isHidden(), `${concept}: menu escape`);
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
      const headerBox = await page.locator('.site-header').boundingBox();
      assert(headerBox.y >= 0 && headerBox.y < 60, `${concept}: fixed header at deep scroll`);
      await page.locator('[data-theme-toggle]').click();
      const chosenTheme = await page.locator('html').getAttribute('data-theme');
      await page.reload();
      assert(await page.locator('html').getAttribute('data-theme') === chosenTheme, `${concept}: theme persistence`);
      await page.locator('[data-motion-toggle]').click();
      const motion = await page.locator('html').getAttribute('data-motion');
      await page.reload();
      assert(await page.locator('html').getAttribute('data-motion') === motion, `${concept}: motion persistence`);
      await page.evaluate(() => { document.documentElement.dataset.motion = 'paused'; });
      assert(await page.evaluate(() => document.getAnimations().every(a => a.playState !== 'running' || a.effect.getTiming().iterations !== Infinity)), `${concept}: recurring motion pauses`);
      assert(errors.length === 0, `${browserName}/${concept}: console or asset errors ${errors.join('; ')}`);
      await context.close();
      const reduced = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
      const reducedPage = await reduced.newPage();
      await reducedPage.goto(`${base}/concept-${concept}/`);
      assert(await reducedPage.locator('html').getAttribute('data-motion') === 'paused', `${concept}: reduced motion default`);
      assert(await reducedPage.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length) === 0, `${concept}: reduced motion animations`);
      await reduced.close();
      const noJs = await browser.newContext({ javaScriptEnabled: false });
      const noJsPage = await noJs.newPage();
      await noJsPage.goto(`${base}/concept-${concept}/`);
      assert(await noJsPage.locator('h1').isVisible(), `${concept}: HTML without JavaScript`);
      assert((await noJsPage.locator('meta[name=robots]').getAttribute('content')).includes('noindex'), `${concept}: noindex without JavaScript`);
      await noJs.close();
    }
    await browser.close();
  }
} finally { server?.kill(); }
await writeFile(`${artifactDir}/qa-results.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ cases: report.results.length, failures: report.failures, unavailable: report.unavailable }, null, 2));
if (report.failures.length || !report.results.length) process.exitCode = 1;
