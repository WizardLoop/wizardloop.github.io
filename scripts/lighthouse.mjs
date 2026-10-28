import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
const output = process.env.LIGHTHOUSE_OUTPUT || 'artifacts/lighthouse';
await mkdir(output, { recursive: true });
const windowsChrome = join(homedir(), 'AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe');
const chrome = await launch({ chromePath: process.env.CHROME_PATH || (process.platform === 'win32' && existsSync(windowsChrome) ? windowsChrome : undefined), chromeFlags: ['--headless', '--no-sandbox', '--disable-dev-shm-usage'] });
const results = [];
try {
  for (const page of ['home', 'work', 'posts', 'feedback']) {
    const result = await lighthouse(`http://127.0.0.1:4322/${page === 'home' ? '' : page + '/'}`, { port: chrome.port, output: ['html', 'json'], logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] });
    await writeFile(`${output}/page-${page}.html`, result.report[0]);
    await writeFile(`${output}/page-${page}.json`, result.report[1]);
    const lhr = result.lhr;
    const summary = { page, version: lhr.lighthouseVersion, fetchTime: lhr.fetchTime, formFactor: lhr.configSettings.formFactor, throttling: lhr.configSettings.throttlingMethod, scores: Object.fromEntries(Object.entries(lhr.categories).map(([name, value]) => [name, Math.round(value.score * 100)])), metrics: Object.fromEntries(['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index', 'total-byte-weight'].map(id => [id, { numericValue: lhr.audits[id]?.numericValue, displayValue: lhr.audits[id]?.displayValue }])), failedAudits: Object.entries(lhr.audits).filter(([, audit]) => audit.score !== null && audit.score < 1).map(([id, audit]) => ({ id, score: audit.score, title: audit.title })), error: lhr.runtimeError || null };
    results.push(summary);
    console.log(JSON.stringify(summary));
  }
} finally { await chrome.kill(); }
await writeFile(`${output}/summary.json`, JSON.stringify(results, null, 2));
