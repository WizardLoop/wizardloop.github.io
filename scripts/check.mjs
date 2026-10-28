import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const errors = [];
async function walk(dir) {
  const list = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (
      [
        'node_modules',
        '.git',
        'artifacts',
        '.astro',
        '.venv',
        '.deps',
        '__pycache__',
        'test-output',
        'dist',
        'test-results',
        'playwright-report',
        '.wrangler',
      ].includes(entry.name)
    )
      continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) list.push(...(await walk(file)));
    else list.push(file);
  }
  return list;
}
const files = await walk('.');
for (const removed of [
  'services/feedback',
  'services/profile-sync',
  'services/posts-sync',
  'src/scripts/feedback.ts',
  'src/scripts/posts.ts',
]) {
  try {
    await access(removed);
    errors.push(`Removed service implementation remains: ${removed}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
for (const file of files) {
  if (
    !/\.(html|astro|css|js|mjs|ts|py|json|jsonc|md|ya?ml|txt|svg)$/.test(
      file,
    ) ||
    file.endsWith('package-lock.json')
  )
    continue;
  if (file.replaceAll('\\', '/').startsWith('public/media/licenses/')) continue;
  const data = await readFile(file, 'utf8');
  if (data.includes(String.fromCodePoint(0x2014)))
    errors.push(`Forbidden punctuation: ${file}`);
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(data) ||
    /\b\d{8,12}:[A-Za-z0-9_-]{35}\b/.test(data)
  )
    errors.push(`Potential secret in source: ${file}`);
  if (file.endsWith('.mjs') || file.endsWith('.js')) {
    const result = spawnSync(process.execPath, ['--check', file], {
      encoding: 'utf8',
    });
    if (result.status)
      errors.push(`JavaScript syntax: ${file}\n${result.stderr}`);
  }
  if (file.startsWith('concepts') && file.endsWith('.html')) {
    if (!/<meta name="robots" content="noindex/.test(data))
      errors.push(`Missing noindex: ${file}`);
    const ids = [...data.matchAll(/\bid="([^"]+)"/g)].map((x) => x[1]);
    if (new Set(ids).size !== ids.length) errors.push(`Duplicate IDs: ${file}`);
    for (const [, target] of data.matchAll(/href="#([^"]+)"/g))
      if (!ids.includes(target))
        errors.push(`Missing section #${target}: ${file}`);
    for (const [, asset] of data.matchAll(
      /(?:src|href)="(\/assets\/[^"?]+)"/g,
    )) {
      try {
        await access(path.join('concepts', asset));
      } catch {
        errors.push(`Missing asset ${asset}: ${file}`);
      }
    }
    if (/<script[^>]+src="https?:/.test(data))
      errors.push(`Unexpected remote script: ${file}`);
  }
}
if ((await readFile('CNAME', 'utf8')).trim() !== 'wizardloop.com')
  errors.push('CNAME changed');
const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
if (/deploy-pages|pages: write|id-token: write/.test(workflow))
  errors.push('Preview CI must not deploy');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `PASS: ${files.length} files inspected. Punctuation, syntax, local assets, section links, noindex, CNAME and non-deploying CI checks passed.`,
  );
