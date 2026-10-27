import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
const errors = [];
const routes = ['', 'about', 'work', 'projects', 'posts', 'community', 'feedback', 'privacy', 'cookies', 'security', 'accessibility'];
const titles = new Set();
for (const route of routes) {
  const file = path.join('dist', route, 'index.html');
  let html;
  try { html = await readFile(file, 'utf8'); } catch { errors.push(`Missing HTML: ${route}`); continue; }
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
  if (!title || titles.has(title)) errors.push(`Missing/duplicate title: ${route}`);
  titles.add(title);
  if (!html.includes(`https://wizardloop.com/${route ? route + '/' : ''}`)) errors.push(`Canonical missing: ${route}`);
  for (const required of ['name="description"', 'property="og:image"', 'name="twitter:card"', 'application/ld+json', 'lang="en"', 'id="main"']) if (!html.includes(required)) errors.push(`Missing ${required}: ${route}`);
  if ((html.match(/<h1\b/g) || []).length !== 1) errors.push(`Expected one h1: ${route}`);
  if (html.includes(String.fromCodePoint(0x2014))) errors.push(`Forbidden punctuation: ${file}`);
  for (const [, value] of html.matchAll(/(?:src|href)="(\/(?!\/)[^"?#]+)(?:[?#][^"]*)?"/g)) {
    if (value.startsWith('/concept-')) { errors.push(`Concept link in production: ${value}`); continue; }
    let target = path.join('dist', value);
    try { const info = await stat(target); if (info.isDirectory()) target = path.join(target, 'index.html'); await stat(target); } catch { errors.push(`Missing build target ${value} in ${route}`); }
  }
}
for (const file of ['CNAME', 'robots.txt', 'sitemap-index.xml', '404.html', 'social-preview.png', 'favicon.svg', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'media/hero/portal-light.mp4', 'media/hero/portal-dark.mp4']) {
  try { const value = await stat(path.join('dist', file)); if (!value.size) errors.push(`Empty asset ${file}`); } catch { errors.push(`Missing build asset ${file}`); }
}
if ((await readFile('dist/CNAME', 'utf8')).trim() !== 'wizardloop.com') errors.push('Build CNAME changed');
for (const file of await readdir('dist')) if (/^(?:concept-|\.env|services|node_modules)/.test(file)) errors.push(`Private or preview directory included: ${file}`);
async function scan(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, item.name);
    if (item.isDirectory()) await scan(file);
    else if (/\.(?:html|js|json|css|txt)$/.test(item.name)) {
      const content = await readFile(file, 'utf8');
      if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content) || /\b\d{8,12}:[A-Za-z0-9_-]{35}\b/.test(content)) errors.push(`Potential secret in build: ${file}`);
    }
  }
}
await scan('dist');
if (errors.length) { console.error([...new Set(errors)].join('\n')); process.exitCode = 1; }
else console.log(`PASS: ${routes.length} static pages, local links/assets, SEO without JavaScript, profile assets, CNAME and basic secret patterns.`);
