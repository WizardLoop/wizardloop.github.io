import http from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

// Manual asset-authoring command, never needed by the production build.
const name = process.argv[2];
const ratio = Number(process.argv[3] ?? 0.35);
if (
  !name ||
  !/^[a-z0-9-]+$/.test(name) ||
  !Number.isFinite(ratio) ||
  ratio < 0 ||
  ratio >= 1
)
  throw new Error(
    'Usage: npm run media:poster -- <asset-name> [frame-ratio from 0 to less than 1]',
  );
const original = await readFile(`public/media/animations/${name}.tgs`);
const data = JSON.parse(
  gunzipSync(original, { maxOutputLength: 8 * 1024 * 1024 }),
);
if (
  ![data.w, data.h, data.fr, data.ip, data.op].every(Number.isFinite) ||
  data.w < 1 ||
  data.h < 1 ||
  data.w > 1024 ||
  data.h > 1024 ||
  data.fr <= 0 ||
  data.op <= data.ip
)
  throw new Error('Unsupported animation dimensions or timing');
const player = await readFile(
  'node_modules/lottie-web/build/player/lottie_light_canvas.min.js',
);
const frame = Math.min(
  data.op - data.ip - 1,
  Math.round((data.op - data.ip) * ratio),
);
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/player.js') {
    response.writeHead(200, { 'Content-Type': 'application/javascript' });
    response.end(player);
  } else if (url.pathname === '/data.json') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(data));
  } else if (url.pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Local TGS poster renderer</title><style>html,body{margin:0;background:transparent;width:${data.w}px;height:${data.h}px}#art{width:100%;height:100%}canvas{display:block}</style><div id="art"></div><script src="/player.js"></script><script>
      window.ready = (async () => {
        const data = await fetch('/data.json').then(response => response.json());
        await new Promise((resolve, reject) => {
          const animation = lottie.loadAnimation({container:document.getElementById('art'),renderer:'canvas',autoplay:false,loop:false,animationData:data,rendererSettings:{dpr:1,clearCanvas:true}});
          animation.addEventListener('data_failed', () => reject(new Error('Animation failed')));
          animation.addEventListener('error', () => reject(new Error('Renderer failed')));
          animation.addEventListener('DOMLoaded', () => {animation.goToAndStop(${frame},true);resolve();});
        });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      })();
    </script></html>`);
  } else {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const windowsBrowser = path.join(
  homedir(),
  'AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
);
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
  (process.platform === 'win32' && existsSync(windowsBrowser)
    ? windowsBrowser
    : undefined);
let browser;
try {
  browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({
    viewport: { width: data.w, height: data.h },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', (route) =>
    route
      .request()
      .url()
      .startsWith(origin + '/')
      ? route.continue()
      : route.abort(),
  );
  await page.goto(origin);
  await page.evaluate(() =>
    Promise.race([
      window.ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Poster render timed out')), 15000),
      ),
    ]),
  );
  if (errors.length) throw new Error(errors.join('\n'));
  const png = await page.screenshot({ omitBackground: true });
  const raw = await sharp(png).ensureAlpha().raw().toBuffer();
  let min = 255,
    max = 0;
  for (let index = 3; index < raw.length; index += 4) {
    min = Math.min(min, raw[index]);
    max = Math.max(max, raw[index]);
  }
  if (min !== 0 || max === 0)
    throw new Error('Expected visible transparent artwork');
  const poster = await sharp(png)
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
  await mkdir('public/media/posters', { recursive: true });
  await mkdir('artifacts/asset-review', { recursive: true });
  await writeFile(`public/media/posters/${name}.webp`, poster);
  await writeFile(`artifacts/asset-review/${name}.png`, png);
  for (const fraction of [0, 0.15, 0.6, 0.85, 0.99]) {
    await page.evaluate(
      (frame) => lottie.getRegisteredAnimations()[0].goToAndStop(frame, true),
      Math.round((data.op - data.ip - 1) * fraction),
    );
    await page.screenshot({
      path: `artifacts/asset-review/${name}-${Math.round(fraction * 100)}.png`,
      omitBackground: true,
    });
  }
  const audit = {
    name,
    sourceSha256: createHash('sha256').update(original).digest('hex'),
    width: data.w,
    height: data.h,
    fps: data.fr,
    durationSeconds: (data.op - data.ip) / data.fr,
    frame,
    frameRatio: ratio,
    renderer: 'lottie light Canvas',
    encoding: 'lossless WebP',
    bytes: poster.length,
    alphaMin: min,
    alphaMax: max,
    pageErrors: errors,
  };
  await writeFile(
    `artifacts/asset-review/${name}.json`,
    JSON.stringify(audit, null, 2) + '\n',
  );
  console.log(JSON.stringify(audit));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
