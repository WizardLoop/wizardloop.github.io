import { chromium } from '@playwright/test';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = 'http://127.0.0.1:4321';
const output = path.resolve('artifacts');
await mkdir(output, { recursive: true });
await mkdir(path.join(output, 'recordings'), { recursive: true });
const linksOnly = process.argv.includes('--links-only');
let report = {
  date: '2026-10-27',
  scope: 'Phase 1 local concept interaction checks',
  browser: 'Chromium 1228, explicit installed executable',
  results: [], failures: [], observations: [], recordings: [], externalLinks: [],
  limits: [
    'These checks cover local concept interactions and a local image fallback, not production sync, feedback delivery or Telegram media integration.',
    'Text resize is simulated by doubling computed font sizes on all existing elements. This is not browser zoom and does not prove native 200% browser zoom conformance.',
    'Profile request failures are intentionally injected. Expected net::ERR_FAILED request events for that image are separated from unexpected runtime errors.',
    'External URL checks use one HEAD request per unique known URL. A blocked or unsupported HEAD response does not establish that a public page is broken.'
  ]
};
const check = (condition, name, details = {}) => {
  report.results.push({ name, passed: Boolean(condition), ...details });
  if (!condition) report.failures.push(name);
};
if (linksOnly) {
  report = JSON.parse(await readFile(path.join(output, 'interaction-results.json'), 'utf8'));
  report.results = report.results.filter(item => !item.name.startsWith('External link is a known HTTPS destination:'));
  report.failures = report.failures.filter(item => !item.startsWith('External link is a known HTTPS destination:'));
  report.limits = report.limits.map(item => item.replace('console entries', 'request events'));
}
const priorLinks = new Map(report.externalLinks.map(item => [item.url, item]));
report.externalLinks = [];
const browser = linksOnly ? null : await chromium.launch({
  executablePath: 'C:/Users/ADMIN/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
  headless: true,
});
const routeFor = concept => `${base}/concept-${concept}/`;
const getLoops = page => page.evaluate(() => document.getAnimations().filter(a => a.effect?.getTiming().iterations === Infinity).map(a => ({ name: a.animationName || 'animation', state: a.playState, time: a.currentTime })));
const urls = new Set(linksOnly ? priorLinks.keys() : []);

async function demonstrate(page, concept) {
  if (concept === 'a') {
    const bounds = await page.locator('[data-pointer]').boundingBox();
    const y = Math.min(610, bounds.y + bounds.height * 0.65);
    await page.mouse.move(bounds.x + bounds.width * 0.25, y);
    await page.mouse.move(bounds.x + bounds.width * 0.78, y - 80, { steps: 22 });
    await page.mouse.move(bounds.x + bounds.width * 0.4, y + 40, { steps: 18 });
  } else if (concept === 'b') {
    await page.locator('[data-redraw]').click();
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  } else {
    await page.locator('#phase').focus();
    for (let i = 0; i < 24; i++) await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowLeft');
  }
}

try {
  for (const concept of linksOnly ? [] : ['a', 'b', 'c']) {
    const videoContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference', recordVideo: { dir: path.join(output, 'recordings'), size: { width: 1280, height: 800 } } });
    const videoPage = await videoContext.newPage();
    await videoPage.goto(routeFor(concept), { waitUntil: 'networkidle' });
    await videoPage.evaluate(() => document.fonts.ready);
    const demonstrationStart = Date.now();
    await demonstrate(videoPage, concept);
    await videoPage.waitForTimeout(Math.max(0, 4000 - (Date.now() - demonstrationStart)));
    const video = videoPage.video();
    await videoContext.close();
    const recording = path.join(output, `concept-${concept}-motion.webm`);
    await rename(await video.path(), recording);
    report.recordings.push({ concept, path: `artifacts/concept-${concept}-motion.webm`, viewport: '1280x800', demonstrationDurationMs: 4000, note: 'Recording includes initial page load in addition to the 4 second interaction demonstration.' });
    console.log(`Recorded concept ${concept}`);

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(routeFor(concept), { waitUntil: 'networkidle' });
    (await page.locator('a[href]').evaluateAll(anchors => anchors.map(a => a.href).filter(h => /^https?:/.test(h) && !h.startsWith(location.origin)))).forEach(url => urls.add(url));
    if (concept === 'a') {
      const zone = page.locator('[data-pointer]');
      const bounds = await zone.boundingBox();
      await page.mouse.move(bounds.x + bounds.width * 0.25, 500);
      const before = await zone.evaluate(el => [el.style.getPropertyValue('--px'), el.style.getPropertyValue('--py')]);
      await page.mouse.move(bounds.x + bounds.width * 0.8, 600, { steps: 5 });
      const after = await zone.evaluate(el => [el.style.getPropertyValue('--px'), el.style.getPropertyValue('--py')]);
      check(before[0] !== after[0] && before[1] !== after[1], 'a: pointer updates orbital CSS variables', { before, after });
    } else if (concept === 'b') {
      await page.locator('[data-redraw]').click();
      check(await page.locator('.ink-drawing').evaluate(el => el.classList.contains('is-drawing')), 'b: redraw activates drawing class');
      await page.waitForFunction(() => !document.querySelector('.ink-drawing').classList.contains('is-drawing'), { timeout: 4000 });
      check(true, 'b: redraw class clears after the drawing animation');
    } else {
      await page.locator('#phase').focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      const phase = await page.locator('#phase').inputValue();
      const outputText = await page.locator('#phase-output').textContent();
      const transform = await page.locator('.loop-body').evaluate(el => el.style.transform);
      check(phase === '2' && outputText === '2°' && transform === 'rotate(2deg)', 'c: phase range responds to keyboard and updates sculpture', { phase, outputText, transform });
    }
    const running = await getLoops(page);
    check(running.length > 0 && running.every(loop => loop.state === 'running'), `${concept}: automatic loops run before pause`, { loops: running });
    await page.locator('[data-motion-toggle]').click();
    await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.ready)); });
    const paused = await getLoops(page);
    await page.waitForTimeout(250);
    const stillPaused = await getLoops(page);
    check(await page.locator('html').getAttribute('data-motion') === 'paused' && paused.length > 0 && paused.every(loop => loop.state === 'paused') && stillPaused.every((loop, i) => Math.abs(loop.time - paused[i].time) < 2), `${concept}: pause freezes all continuous loops`, { paused, after250ms: stillPaused });
    if (concept === 'a') {
      const zone = page.locator('[data-pointer]');
      const before = await zone.evaluate(el => el.style.getPropertyValue('--px'));
      await page.mouse.move(1000, 500);
      const after = await zone.evaluate(el => el.style.getPropertyValue('--px'));
      const transform = await page.locator('.pointer-art').evaluate(el => getComputedStyle(el).transform);
      check(transform === 'none', 'a: paused pointer motion is suppressed', { beforeVariable: before, afterVariable: after, transform, note: 'Pointer leave may reset variables to zero; the actual artwork transform must stay none.' });
    }
    await page.reload({ waitUntil: 'networkidle' });
    check(await page.locator('html').getAttribute('data-motion') === 'paused', `${concept}: pause preference survives reload`);
    await page.locator('[data-motion-toggle]').click();
    check((await getLoops(page)).every(loop => loop.state === 'running'), `${concept}: resume restarts continuous loops`);
    check(errors.length === 0, `${concept}: interaction run has no page errors`, { errors });
    await context.close();

    const reducedContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const reduced = await reducedContext.newPage();
    await reduced.goto(routeFor(concept), { waitUntil: 'networkidle' });
    check(await reduced.locator('html').getAttribute('data-motion') === 'paused' && (await getLoops(reduced)).length === 0, `${concept}: reduced motion disables continuous loops`);
    if (concept === 'a') {
      const before = await reduced.locator('[data-pointer]').evaluate(el => el.style.getPropertyValue('--px'));
      await reduced.mouse.move(1100, 600);
      const after = await reduced.locator('[data-pointer]').evaluate(el => el.style.getPropertyValue('--px'));
      check(before === after, 'a: reduced motion suppresses pointer parallax');
    } else if (concept === 'b') {
      await reduced.locator('[data-redraw]').click();
      const animations = await reduced.evaluate(() => document.getAnimations().map(a => ({ name: a.animationName, state: a.playState })));
      check(animations.length === 0, 'b: reduced motion keeps redraw illustration static', { animations });
    } else {
      await reduced.locator('#phase').focus();
      await reduced.keyboard.press('ArrowRight');
      check(await reduced.locator('#phase-output').textContent() === '1°' && (await getLoops(reduced)).length === 0, 'c: reduced motion permits explicit keyboard phase change without loops');
    }
    await reducedContext.close();

    const fallbackContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const fallback = await fallbackContext.newPage();
    const expectedFailures = [], fallbackErrors = [];
    fallback.on('requestfailed', request => {
      const detail = { url: request.url(), error: request.failure()?.errorText };
      if (request.url().endsWith('/assets/profile-telegram.jpg')) expectedFailures.push(detail);
      else fallbackErrors.push(detail);
    });
    fallback.on('pageerror', error => fallbackErrors.push({ error: error.message }));
    await fallback.route('**/assets/profile-telegram.jpg', route => route.abort('failed'));
    await fallback.goto(routeFor(concept), { waitUntil: 'networkidle' });
    const avatar = fallback.locator('img[data-profile], .profile-stamp img').first();
    await avatar.evaluate(img => { img.loading = 'eager'; });
    await avatar.scrollIntoViewIfNeeded();
    let loadedFallback = false;
    try { await fallback.waitForFunction(() => { const img = document.querySelector('img[data-profile], .profile-stamp img'); return img?.src.endsWith('/profile-fallback.svg') && img.complete && img.naturalWidth > 0; }, null, { timeout: 5000 }); loadedFallback = true; } catch {}
    const fallbackInfo = await avatar.evaluate(img => ({ source: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0, width: img.naturalWidth }));
    const fallbackLabel = await fallback.locator('[data-profile-source],.profile-caption').first().textContent();
    check(loadedFallback && expectedFailures.length === 1 && fallbackErrors.length === 0 && /fallback/i.test(fallbackLabel), `${concept}: unavailable Telegram still uses a visibly labelled local fallback`, { image: fallbackInfo, label: fallbackLabel, expectedFailures, unexpectedErrors: fallbackErrors });
    await fallback.screenshot({ path: path.join(output, `concept-${concept}-profile-fallback.png`) });
    await fallbackContext.close();

    const resizedContext = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    const resized = await resizedContext.newPage();
    await resized.goto(routeFor(concept), { waitUntil: 'networkidle' });
    const resizeStats = await resized.evaluate(() => {
      const entries = [...document.querySelectorAll('body *')].filter(el => !(el instanceof SVGElement)).map(el => [el, parseFloat(getComputedStyle(el).fontSize)]);
      const h1Before = getComputedStyle(document.querySelector('h1')).fontSize;
      for (const [element, size] of entries) if (Number.isFinite(size)) element.style.setProperty('font-size', `${size * 2}px`, 'important');
      return { elements: entries.length, h1Before, h1After: getComputedStyle(document.querySelector('h1')).fontSize, documentWidth: document.documentElement.scrollWidth, viewport: innerWidth };
    });
    await resized.screenshot({ path: path.join(output, `concept-${concept}-text-resize-200.png`), fullPage: true });
    report.observations.push({ name: `${concept}: simulated doubled text stress test`, horizontalOverflow: resizeStats.documentWidth - resizeStats.viewport, method: 'Double each element computed font size, not browser zoom', ...resizeStats });
    await resizedContext.close();
    console.log(`Checked concept ${concept}`);
  }

  const known = new Set([
    'https://github.com/WizardLoop', 'https://github.com/WizardLoop?tab=repositories', 'https://github.com/WizardLoop/wizardloop.github.io',
    'https://github.com/WizardLoop/MagicLottie', 'https://github.com/WizardLoop/shabbat', 'https://github.com/WizardLoop/CreationDate',
    'https://t.me/wizardloop', 'https://t.me/wizard_loop', 'https://t.me/wizardloopchat', 'https://t.me/s/wizard_loop',
    'https://wizardloop.com', 'https://wizardloop.com/'
  ]);
  for (const url of [...urls].sort()) {
    const item = { url, known: known.has(url), protocol: new URL(url).protocol };
    check(item.known && item.protocol === 'https:', 'External link is a known HTTPS destination: ' + url);
    if (item.known) {
      const prior = priorLinks.get(url);
      if (prior?.known && prior.status === 200) {
        Object.assign(item, prior, { reusedResult: true });
        report.externalLinks.push(item);
        continue;
      }
      try {
        const response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) });
        item.status = response.status; item.finalUrl = response.url;
        item.reachableByHead = response.ok;
      } catch (error) { item.requestError = error.name + ': ' + error.message; }
    }
    report.externalLinks.push(item);
  }
} catch (error) {
  report.failures.push('QA script exception: ' + error.message);
  report.exception = error.stack;
} finally {
  await browser?.close();
  report.passed = report.failures.length === 0;
  report.checks = report.results.length;
  await writeFile(path.join(output, 'interaction-results.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ checks: report.checks, failures: report.failures, recordings: report.recordings.map(item => item.path), externalLinks: report.externalLinks }, null, 2));
process.exitCode = report.passed ? 0 : 1;
