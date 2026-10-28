import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
const errors = [];
const routes = [
  '',
  'about',
  'work',
  'projects',
  'posts',
  'community',
  'feedback',
  'privacy',
  'cookies',
  'security',
  'accessibility',
  '404.html',
];
const titles = new Set();
const descriptions = new Set();
const pages = new Map();
for (const route of routes) {
  const file =
    route === '404.html'
      ? path.join('dist', route)
      : path.join('dist', route, 'index.html');
  let html;
  try {
    html = await readFile(file, 'utf8');
  } catch {
    errors.push(`Missing HTML: ${route}`);
    continue;
  }
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
  if (!title || titles.has(title))
    errors.push(`Missing/duplicate title: ${route}`);
  titles.add(title);
  pages.set(route, html);
  const canonical = html.match(
    /<link\b(?=[^>]*\brel="canonical")[^>]*\bhref="([^"]+)"[^>]*>/,
  )?.[1];
  const expectedCanonical = `https://wizardloop.com/${route === '404.html' ? '404/' : route ? route + '/' : ''}`;
  if (canonical !== expectedCanonical)
    errors.push(`Canonical missing or incorrect: ${route}`);
  const description = html.match(
    /<meta\b(?=[^>]*\bname="description")[^>]*\bcontent="([^"]+)"[^>]*>/,
  )?.[1];
  if (!description || descriptions.has(description))
    errors.push(`Missing/duplicate description: ${route}`);
  descriptions.add(description);
  for (const required of [
    'name="description"',
    'property="og:image"',
    'name="twitter:card"',
    'application/ld+json',
    'lang="en"',
    'id="main"',
  ])
    if (!html.includes(required)) errors.push(`Missing ${required}: ${route}`);
  if ((html.match(/<h1\b/g) || []).length !== 1)
    errors.push(`Expected one h1: ${route}`);
  if (html.includes(String.fromCodePoint(0x2014)))
    errors.push(`Forbidden punctuation: ${file}`);
  if (
    /<(?:form|iframe)\b|\bdata-(?:feedback-form|telegram-feed|profile-video|privacy-open)\b|\bid="privacy-dialog"/i.test(
      html,
    )
  )
    errors.push(`Removed interactive service remains: ${route}`);
  if (
    route === '404.html' &&
    !/<meta\b(?=[^>]*\bname="robots")(?=[^>]*\bcontent="[^"]*noindex)[^>]*>/.test(
      html,
    )
  )
    errors.push('404 must remain noindex');
  for (const [, resource] of html.matchAll(
    /<(?:script|img|video|source|audio)\b[^>]*\b(?:src|poster)="([^"]+)"/g,
  )) {
    if (/^(?:https?:)?\/\//i.test(resource))
      errors.push(`Non-local loaded resource ${resource} in ${route}`);
  }
  for (const [, resource] of html.matchAll(
    /<link\b(?=[^>]*\brel="(?:stylesheet|preload|modulepreload|preconnect|dns-prefetch)")[^>]*\bhref="([^"]+)"/g,
  )) {
    if (/^(?:https?:)?\/\//i.test(resource))
      errors.push(`Non-local resource hint ${resource} in ${route}`);
  }
  for (const [, value] of html.matchAll(
    /(?:src|href)="(\/(?!\/)[^"?#]+)(?:[?#][^"]*)?"/g,
  )) {
    if (value.startsWith('/concept-')) {
      errors.push(`Concept link in production: ${value}`);
      continue;
    }
    let target = path.join('dist', value);
    try {
      const info = await stat(target);
      if (info.isDirectory()) target = path.join(target, 'index.html');
      await stat(target);
    } catch {
      errors.push(`Missing build target ${value} in ${route}`);
    }
  }
}
for (const [route, destinations] of [
  ['work', ['https://t.me/wizard_loop']],
  ['projects', ['https://github.com/WizardLoop?tab=repositories']],
  ['posts', ['https://t.me/s/wizard_loop']],
  ['feedback', ['https://t.me/wizardloop', 'mailto:wizard@wizardloop.com']],
]) {
  const main =
    pages.get(route)?.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] || '';
  for (const href of destinations)
    if (!main.includes(`href="${href}"`))
      errors.push(`Missing direct link ${href} on ${route}`);
}
if (
  /\bdata-animation\b|\bcollection-grid\b|\bdata-show-collection\b/.test(
    pages.get('work') || '',
  )
)
  errors.push(
    'Work must remain a direct channel gateway without a local collection',
  );
for (const route of ['', 'projects']) {
  const main =
    pages.get(route)?.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] || '';
  if (
    /href="https:\/\/github\.com\/WizardLoop\/|\bcollection-grid\b|\bproject-row\b/.test(
      main,
    )
  )
    errors.push(
      `Individual project or collection listing remains on ${route || 'home'}`,
    );
}
for (const file of [
  'CNAME',
  'robots.txt',
  'sitemap-index.xml',
  '404.html',
  'social-preview.png',
  'favicon.svg',
  'favicon-16.png',
  'favicon-32.png',
  'apple-touch-icon.png',
  'media/hero/portal-light.mp4',
  'media/hero/portal-dark.mp4',
]) {
  try {
    const value = await stat(path.join('dist', file));
    if (!value.size) errors.push(`Empty asset ${file}`);
  } catch {
    errors.push(`Missing build asset ${file}`);
  }
}
if ((await readFile('dist/CNAME', 'utf8')).trim() !== 'wizardloop.com')
  errors.push('Build CNAME changed');
for (const file of await readdir('dist'))
  if (/^(?:concept-|\.env|services|node_modules)/.test(file))
    errors.push(`Private or preview directory included: ${file}`);
async function scan(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) await scan(file);
    else if (/\.(?:html|js|json|css|txt)$/.test(item.name)) {
      const content = await readFile(file, 'utf8');
      if (
        /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content) ||
        /\b\d{8,12}:[A-Za-z0-9_-]{35}\b/.test(content)
      )
        errors.push(`Potential secret in build: ${file}`);
      if (
        file.replaceAll('\\', '/').startsWith('dist/_astro/') &&
        /telegram-widget|challenges\.cloudflare\.com|api\.telegram\.org|turnstile|data-feedback-form|data-telegram-feed/i.test(
          content,
        )
      )
        errors.push(`Removed service code in built browser assets: ${file}`);
    }
  }
}
await scan('dist');
if (errors.length) {
  console.error([...new Set(errors)].join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `PASS: ${routes.length} static pages, direct contact/gateway links, local resources, removed-service checks, SEO without JavaScript, CNAME and basic secret patterns.`,
  );
