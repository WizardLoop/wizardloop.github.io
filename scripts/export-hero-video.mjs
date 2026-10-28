/** Export the original portal illustration as two native H264 hero loops.
 * Run manually: node scripts/export-hero-video.mjs
 * Requires Playwright Chromium with native AVC WebCodecs support.
 * Optional CHROME_PATH selects an installed Chromium executable.
 * Originals are unchanged. Background colors are deliberately baked into each theme.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bitrate = 2000000;
const requestedCodec = 'avc1.42001F';
const output = path.join(root, 'public/media/hero');

// AVC-only ISO BMFF: one video track, no B-frames, one chunk.
// The moov index precedes mdat for progressive download. All samples last 1/30 second.
const u16 = (n) => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(n);
  return b;
};
const u32 = (n) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const zeros = (n) => Buffer.alloc(n);
const chars = (s) => Buffer.from(s, 'ascii');
const box = (type, ...parts) => {
  const payload = Buffer.concat(parts);
  return Buffer.concat([u32(payload.length + 8), chars(type), payload]);
};
const full = (type, version, flags, ...parts) =>
  box(
    type,
    Buffer.from([
      version,
      (flags >> 16) & 255,
      (flags >> 8) & 255,
      flags & 255,
    ]),
    ...parts,
  );
const matrix = Buffer.concat([
  u32(0x10000),
  u32(0),
  u32(0),
  u32(0),
  u32(0x10000),
  u32(0),
  u32(0),
  u32(0),
  u32(0x40000000),
]);
function mux(chunks, description, width, height) {
  const ftyp = box('ftyp', chars('isom'), u32(512), chars('isomiso2avc1mp41'));
  const duration = chunks.length * 1000;
  const avc1 = box(
    'avc1',
    zeros(6),
    u16(1),
    zeros(16),
    u16(width),
    u16(height),
    u32(0x480000),
    u32(0x480000),
    u32(0),
    u16(1),
    zeros(32),
    u16(24),
    u16(65535),
    box('avcC', description),
  );
  const makeMoov = (offset) =>
    box(
      'moov',
      full(
        'mvhd',
        0,
        0,
        u32(0),
        u32(0),
        u32(30000),
        u32(duration),
        u32(0x10000),
        u16(0x100),
        zeros(10),
        matrix,
        zeros(24),
        u32(2),
      ),
      box(
        'trak',
        full(
          'tkhd',
          0,
          7,
          u32(0),
          u32(0),
          u32(1),
          u32(0),
          u32(duration),
          zeros(8),
          u16(0),
          u16(0),
          u16(0),
          u16(0),
          matrix,
          u32(width * 65536),
          u32(height * 65536),
        ),
        box(
          'mdia',
          full(
            'mdhd',
            0,
            0,
            u32(0),
            u32(0),
            u32(30000),
            u32(duration),
            u16(0x55c4),
            u16(0),
          ),
          full(
            'hdlr',
            0,
            0,
            u32(0),
            chars('vide'),
            zeros(12),
            chars('WizardLoop video\0'),
          ),
          box(
            'minf',
            full('vmhd', 0, 1, u16(0), zeros(6)),
            box('dinf', full('dref', 0, 0, u32(1), full('url ', 0, 1))),
            box(
              'stbl',
              full('stsd', 0, 0, u32(1), avc1),
              full('stts', 0, 0, u32(1), u32(chunks.length), u32(1000)),
              full('stsc', 0, 0, u32(1), u32(1), u32(chunks.length), u32(1)),
              full(
                'stsz',
                0,
                0,
                u32(0),
                u32(chunks.length),
                ...chunks.map((chunk) => u32(chunk.bytes.length)),
              ),
              full('stco', 0, 0, u32(1), u32(offset)),
              full(
                'stss',
                0,
                0,
                u32(chunks.filter((chunk) => chunk.key).length),
                ...chunks.flatMap((chunk, index) =>
                  chunk.key ? [u32(index + 1)] : [],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  let moov = makeMoov(0);
  moov = makeMoov(ftyp.length + moov.length + 8);
  return Buffer.concat([
    ftyp,
    moov,
    box('mdat', ...chunks.map((chunk) => chunk.bytes)),
  ]);
}

const out = path.join(root, 'artifacts/hero-video-export');
await fs.mkdir(out, { recursive: true });
const source = JSON.parse(
  await fs.readFile(path.join(root, 'src/content/artworks.json'), 'utf8'),
).find((item) => item.slug === 'portal-alchemy');
const compressed = await fs.readFile(
  path.join(root, 'public/media/animations/portal-alchemy.tgs'),
);
const sourceSha256 = createHash('sha256').update(compressed).digest('hex');
if (sourceSha256 !== source.sha256)
  throw new Error(
    'Original artwork checksum changed. Review source provenance first.',
  );
const data = gunzipSync(compressed);
const timing = JSON.parse(data.toString('utf8'));
if (timing.fr !== 60 || timing.ip !== 0 || timing.op !== 144)
  throw new Error('Review changed source timing before export.');
const player = await fs.readFile(
  path.join(
    root,
    'node_modules/lottie-web/build/player/lottie_light_canvas.min.js',
  ),
);
const publicFiles = new Map();
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/player.js') {
    response.writeHead(200, { 'Content-Type': 'application/javascript' });
    response.end(player);
    return;
  }
  if (url.pathname === '/data.json') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(data);
    return;
  }
  if (publicFiles.has(url.pathname)) {
    const file = publicFiles.get(url.pathname),
      range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
    if (range) {
      const start = Number(range[1]),
        end = Math.min(Number(range[2] || file.length - 1), file.length - 1);
      if (start > end || start >= file.length) {
        response.writeHead(416, { 'Content-Range': `bytes */${file.length}` });
        response.end();
        return;
      }
      response.writeHead(206, {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${file.length}`,
        'Content-Length': end - start + 1,
      });
      response.end(file.subarray(start, end + 1));
    } else {
      response.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Content-Length': file.length,
      });
      response.end(file);
    }
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:768px;height:768px;background:transparent;overflow:hidden}#source{width:768px;height:768px;position:absolute;left:-1000px}#target,video{display:block;width:768px;height:768px}</style></head><body><div id="source"></div><canvas id="target" width="768" height="768"></canvas><script src="/player.js"></script><script>window.ready=(async()=>{const data=await fetch('/data.json').then(r=>r.json());window.animation=lottie.loadAnimation({container:document.querySelector('#source'),renderer:'canvas',autoplay:false,loop:false,animationData:data,rendererSettings:{dpr:1}});await new Promise(resolve=>animation.addEventListener('DOMLoaded',resolve));animation.setSubframe(false);return true})()</script></body></html>`,
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const results = [],
  errors = [],
  generated = [];
try {
  browser = await chromium.launch(
    process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  );
  const page = await browser.newPage({
    viewport: { width: 768, height: 768 },
    deviceScaleFactor: 1,
  });
  await page.route('**/*', (route) =>
    route
      .request()
      .url()
      .startsWith(origin + '/')
      ? route.continue()
      : route.abort(),
  );
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await page.evaluate(() =>
    Promise.race([
      window.ready,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Animation preparation timed out')),
          30000,
        ),
      ),
    ]),
  );
  const support = await page.evaluate(
    async ({ bitrate, requestedCodec }) => ({
      secure: isSecureContext,
      encoder: typeof VideoEncoder,
      configs:
        typeof VideoEncoder === 'undefined'
          ? []
          : await Promise.all(
              [requestedCodec, 'avc1.640028'].map((codec) =>
                VideoEncoder.isConfigSupported({
                  codec,
                  width: 768,
                  height: 768,
                  bitrate,
                  framerate: 30,
                  latencyMode: 'realtime',
                  avc: { format: 'avc' },
                }),
              ),
            ),
    }),
    { bitrate, requestedCodec },
  );
  console.log(JSON.stringify({ support }));
  if (support.encoder === 'undefined' || !support.configs[0]?.supported)
    throw new Error('Native AVC WebCodecs unavailable');
  for (const [theme, color] of [
    ['light', '#e4dcf7'],
    ['dark', '#34244e'],
  ]) {
    const start = Date.now();
    const encoded = await page.evaluate(
      async ({ color, bitrate, requestedCodec }) => {
        const chunks = [],
          canvas = document.querySelector('#target'),
          context = canvas.getContext('2d', { alpha: false });
        let description, error;
        const encoder = new VideoEncoder({
          output: (chunk, metadata) => {
            const bytes = new Uint8Array(chunk.byteLength);
            chunk.copyTo(bytes);
            let binary = '';
            for (const byte of bytes) binary += String.fromCharCode(byte);
            chunks.push({
              data: btoa(binary),
              key: chunk.type === 'key',
              timestamp: chunk.timestamp,
            });
            if (metadata.decoderConfig?.description)
              description = Array.from(
                new Uint8Array(metadata.decoderConfig.description),
              );
          },
          error: (e) => {
            error = e.message;
          },
        });
        encoder.configure({
          codec: requestedCodec,
          width: 768,
          height: 768,
          bitrate,
          framerate: 30,
          latencyMode: 'realtime',
          avc: { format: 'avc' },
        });
        for (let i = 0; i < 72; i++) {
          animation.goToAndStop(i * 2, true);
          context.fillStyle = color;
          context.fillRect(0, 0, 768, 768);
          context.drawImage(document.querySelector('#source canvas'), 0, 0);
          const frame = new VideoFrame(canvas, {
            timestamp: Math.round((i * 1000000) / 30),
            duration:
              Math.round(((i + 1) * 1000000) / 30) -
              Math.round((i * 1000000) / 30),
          });
          encoder.encode(frame, { keyFrame: i === 0 });
          frame.close();
          if (encoder.encodeQueueSize > 6) await encoder.flush();
        }
        await encoder.flush();
        encoder.close();
        if (error) throw Error(error);
        if (!description) throw Error('No AVC configuration');
        animation.goToAndStop(50, true);
        context.fillStyle = color;
        context.fillRect(0, 0, 768, 768);
        context.drawImage(document.querySelector('#source canvas'), 0, 0);
        return { chunks, description };
      },
      { color, bitrate, requestedCodec },
    );
    await page
      .locator('#target')
      .screenshot({ path: path.join(out, `portal-${theme}-source.png`) });
    const chunks = encoded.chunks.map((chunk) => ({
      ...chunk,
      bytes: Buffer.from(chunk.data, 'base64'),
    }));
    if (
      chunks.length !== 72 ||
      chunks.some(
        (chunk, index) =>
          Math.abs(chunk.timestamp - (index * 1000000) / 30) > 1,
      )
    )
      throw Error('Unexpected AVC frame ordering');
    const avcConfiguration = Buffer.from(encoded.description);
    if (avcConfiguration.length < 4 || avcConfiguration[0] !== 1)
      throw new Error('Invalid AVC decoder configuration.');
    // The encoder may choose a different level from the requested configuration.
    // Report the profile, compatibility flags and level actually stored in avcC.
    const codec =
      'avc1.' + avcConfiguration.subarray(1, 4).toString('hex').toUpperCase();
    const mp4 = mux(chunks, avcConfiguration, 768, 768);
    const name = `portal-${theme}.mp4`;
    await fs.writeFile(path.join(out, name), mp4);
    publicFiles.set('/' + name, mp4);
    const playback = await page.evaluate(async (name) => {
      const target = document.querySelector('#target');
      target.style.display = 'none';
      const video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.src = '/' + name;
      document.body.append(video);
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(Error('MP4 metadata failed'));
      });
      const duration = video.duration;
      if (video.readyState < 4)
        await new Promise((resolve) => (video.oncanplaythrough = resolve));
      await new Promise((resolve) => {
        video.onseeked = resolve;
        video.currentTime = 25 / 30;
      });
      return {
        width: video.videoWidth,
        height: video.videoHeight,
        duration,
        readyState: video.readyState,
        currentTime: video.currentTime,
        seekable: video.seekable.length ? video.seekable.end(0) : 0,
      };
    }, name);
    await page
      .locator('video')
      .screenshot({ path: path.join(out, `portal-${theme}-decoded.png`) });
    const motion = await page.evaluate(async () => {
      const v = document.querySelector('video');
      await v.play();
      await new Promise((r) => setTimeout(r, 350));
      const state = {
        paused: v.paused,
        time: v.currentTime,
        decodedFrames: v.getVideoPlaybackQuality().totalVideoFrames,
        droppedFrames: v.getVideoPlaybackQuality().droppedVideoFrames,
      };
      v.pause();
      v.remove();
      document.querySelector('#target').style.display = 'block';
      return state;
    });
    if (
      playback.width !== 768 ||
      playback.height !== 768 ||
      Math.abs(playback.duration - 2.4) > 0.00001 ||
      Math.abs(playback.currentTime - 25 / 30) > 0.001
    )
      throw new Error('Encoded video metadata or seeking failed.');
    generated.push({ name, bytes: mp4, codec });
    const result = {
      theme,
      color,
      bitrate,
      codec,
      requestedCodec,
      width: 768,
      height: 768,
      fps: 30,
      frames: 72,
      bytes: mp4.length,
      elapsedMs: Date.now() - start,
      ...playback,
      motion,
    };
    results.push(result);
    console.log(JSON.stringify(result));
  }
  if (errors.length) throw new Error('Browser rendering failed.');
  if (new Set(generated.map((file) => file.codec)).size !== 1)
    throw new Error('Theme variants have different AVC configurations.');
  await fs.writeFile(
    path.join(out, 'report.json'),
    JSON.stringify({ support, results, errors }, null, 2) + '\n',
  );
  await fs.mkdir(output, { recursive: true });
  for (const file of generated) {
    await fs.writeFile(path.join(output, file.name + '.pending'), file.bytes);
    await fs.rename(
      path.join(output, file.name + '.pending'),
      path.join(output, file.name),
    );
  }
  const manifest = {
    source: source.source,
    sourceFile: '/media/animations/portal-alchemy.tgs',
    sourceSha256,
    rights:
      'WizardLoop media rights reserved; outside the source-code MIT grant.',
    renderer: 'lottie-web 5.13.0 light Canvas',
    encoder: 'Chromium WebCodecs AVC',
    browser: browser.version(),
    codec: generated[0].codec,
    requestedCodec,
    fps: 30,
    frames: 72,
    durationMs: 2400,
    width: 768,
    height: 768,
    targetBitrate: bitrate,
    fastStart: true,
    alpha: false,
    files: generated.map((file, index) => ({
      file: '/media/hero/' + file.name,
      theme: results[index].theme,
      background: results[index].color,
      bytes: file.bytes.length,
      sha256: createHash('sha256').update(file.bytes).digest('hex'),
    })),
  };
  await fs.writeFile(
    path.join(output, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
