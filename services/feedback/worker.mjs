/**
 * WizardLoop feedback gateway. MIT licensed source code.
 * No persistence and no application logging of visitor data or credentials.
 * Runtime: Cloudflare Workers standard Web APIs; tests: Node 22+.
 * @typedef {{limit(options:{key:string}):Promise<{success:boolean}>}} RateLimiter
 * @typedef {{MODE?:string, ALLOWED_ORIGINS?:string, TURNSTILE_HOSTNAMES?:string,
 * TURNSTILE_SECRET_KEY?:string, TELEGRAM_BOT_TOKEN?:string, TELEGRAM_CHAT_ID?:string,
 * TELEGRAM_CHAT_ID_VERIFIED?:string, RATE_LIMIT_SALT?:string, RATE_LIMITER?:RateLimiter}} Env
 */

const MAX_BODY_BYTES = 16_384;
const BODY_TIMEOUT_MS = 5_000;
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const commaList = value => (value || '').split(',').map(item => item.trim()).filter(Boolean);
const securityHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Frame-Options': 'DENY',
  Vary: 'Origin',
};

class PublicError extends Error {
  constructor(status, code, message, retryAfter) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function json(status, payload, origin, extra = {}) {
  return new Response(status === 204 ? null : JSON.stringify(payload), {
    status,
    headers: { ...securityHeaders, ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}), ...extra },
  });
}

function originDetails(request, env) {
  const origin = request.headers.get('Origin');
  let url;
  try { url = new URL(origin); } catch { throw new PublicError(403, 'origin', 'This request is not allowed.'); }
  if (origin !== url.origin || url.username || url.password || !['http:', 'https:'].includes(url.protocol)) {
    throw new PublicError(403, 'origin', 'This request is not allowed.');
  }
  const target = new URL(request.url);
  const localMock = env.MODE === 'mock' && LOCAL_HOSTS.has(url.hostname) && LOCAL_HOSTS.has(target.hostname);
  const origins = commaList(env.ALLOWED_ORIGINS);
  if (!origins.includes(origin) || (!localMock && (url.protocol !== 'https:' || target.protocol !== 'https:'))) {
    throw new PublicError(403, 'origin', 'This request is not allowed.');
  }
  // An accidentally uploaded mock configuration cannot run on a public Worker.
  if (env.MODE === 'mock' && !localMock) throw new PublicError(503, 'unavailable', 'Feedback is temporarily unavailable.');
  return { origin, hostname: url.hostname, localMock };
}

function validateConfig(env, hostname) {
  const goodSecret = value => typeof value === 'string' && value.length >= 20 && !/replace|placeholder/i.test(value);
  if (env.MODE !== 'production' || !commaList(env.TURNSTILE_HOSTNAMES).includes(hostname)
    || !goodSecret(env.TURNSTILE_SECRET_KEY) || /^[123]x0+/.test(env.TURNSTILE_SECRET_KEY)
    || !/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(env.TELEGRAM_BOT_TOKEN || '')
    || !/^[1-9]\d{0,15}$/.test(env.TELEGRAM_CHAT_ID || '') || env.TELEGRAM_CHAT_ID_VERIFIED !== 'true'
    || !goodSecret(env.RATE_LIMIT_SALT) || typeof env.RATE_LIMITER?.limit !== 'function') {
    throw new PublicError(503, 'unavailable', 'Feedback is temporarily unavailable.');
  }
}

async function readJson(request) {
  if ((request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new PublicError(415, 'content_type', 'Send this form as JSON.');
  }
  const declared = request.headers.get('Content-Length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
    throw new PublicError(413, 'too_large', 'This message is too large.');
  }
  if (!request.body) throw new PublicError(400, 'invalid_json', 'The submitted form is not valid.');
  const reader = request.body.getReader();
  const chunks = [];
  let bytes = 0, timer;
  const reading = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new PublicError(413, 'too_large', 'This message is too large.');
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(bytes);
    let at = 0;
    for (const chunk of chunks) { merged.set(chunk, at); at += chunk.byteLength; }
    try { return JSON.parse(decoder.decode(merged)); }
    catch { throw new PublicError(400, 'invalid_json', 'The submitted form is not valid.'); }
  })();
  try {
    return await Promise.race([reading, new Promise((_, reject) => {
      timer = setTimeout(() => {
        void reader.cancel().catch(() => {});
        reject(new PublicError(408, 'timeout', 'The request took too long. Please try again.'));
      }, BODY_TIMEOUT_MS);
    })]);
  } finally { clearTimeout(timer); }
}

function validateFields(input) {
  const invalid = message => { throw new PublicError(422, 'validation', message); };
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('The submitted form is not valid.');
  const allowed = new Set(['name', 'message', 'email', 'website', 'turnstileToken', 'sourcePath']);
  if (Object.keys(input).some(key => !allowed.has(key))) invalid('The submitted form contains unsupported fields.');
  if (input.website !== undefined && (typeof input.website !== 'string' || input.website !== '')) invalid('The submitted form is not valid.');
  const field = (key, max, required = false) => {
    const raw = input[key] ?? '';
    if (typeof raw !== 'string') invalid(`Please check the ${key} field.`);
    const value = raw.trim();
    if ((required && !value) || value.length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(value)) invalid(`Please check the ${key} field.`);
    return value;
  };
  const name = field('name', 80, true);
  const message = field('message', 2500, true);
  const email = field('email', 254);
  const turnstileToken = field('turnstileToken', 2048, true);
  if (/[\r\n\t]/.test(name) || (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[<>]/.test(email)))) invalid('Please check your name and email.');
  const sourcePath = field('sourcePath', 200) || '/feedback/';
  // Never pass URL queries, fragments, credentials, or arbitrary domains to Telegram.
  if (!/^\/(?:[A-Za-z0-9/_-]|%[A-Fa-f0-9]{2})*$/.test(sourcePath) || sourcePath.startsWith('//')) invalid('The source page is not valid.');
  return { name, message, email, turnstileToken, sourcePath };
}

export function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function rateKey(request, env, now) {
  // CF-Connecting-IP is set by Cloudflare. Do not trust X-Forwarded-For.
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip || ip.length > 64 || !/^[0-9a-fA-F:.]+$/.test(ip)) throw new PublicError(503, 'unavailable', 'Feedback is temporarily unavailable.');
  const key = await crypto.subtle.importKey('raw', encoder.encode(env.RATE_LIMIT_SALT), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(`${Math.floor(now / 86_400_000)}:${ip}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Dependency injection is for offline tests; production export uses native fetch. */
export function createWorker({ fetch: transport = globalThis.fetch, now = Date.now, timeoutMs = 5000 } = {}) {
  const mockLimits = new Map();

  async function upstream(url, init) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await transport(url, { ...init, redirect: 'error', signal: controller.signal });
      const payload = await response.json();
      return { response, payload };
    } finally { clearTimeout(timer); }
  }

  async function verify(token, env, hostname) {
    const idempotencyKey = crypto.randomUUID();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let result;
      try {
        result = await upstream(SITEVERIFY, {
          method: 'POST',
          body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, idempotency_key: idempotencyKey }),
        });
      } catch {
        if (attempt === 0) continue;
        throw new PublicError(503, 'verification_unavailable', 'Verification is unavailable. Please retry the challenge.');
      }
      const { response, payload } = result;
      if (!response.ok || payload?.['error-codes']?.includes('internal-error')) {
        if (attempt === 0) continue;
        throw new PublicError(503, 'verification_unavailable', 'Verification is unavailable. Please retry the challenge.');
      }
      if (payload?.success !== true || payload.hostname !== hostname || payload.action !== 'feedback'
        || (Array.isArray(payload['error-codes']) && payload['error-codes'].length > 0)) {
        throw new PublicError(422, 'captcha', 'Please complete a new verification challenge.');
      }
      return;
    }
  }

  return {
    /** @param {Request} request @param {Env} env */
    async fetch(request, env) {
      let allowedOrigin;
      try {
        if (new URL(request.url).pathname !== '/feedback') return json(404, { ok: false, code: 'not_found', message: 'Not found.' });
        const { origin, hostname, localMock } = originDetails(request, env);
        allowedOrigin = origin;
        if (!localMock) validateConfig(env, hostname);
        if (request.method === 'OPTIONS') {
          const requestedHeaders = commaList(request.headers.get('Access-Control-Request-Headers')).map(value => value.toLowerCase());
          if (request.headers.get('Access-Control-Request-Method') !== 'POST' || requestedHeaders.some(value => value !== 'content-type')) {
            throw new PublicError(403, 'preflight', 'This request is not allowed.');
          }
          return json(204, null, origin, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
        }
        if (request.method !== 'POST') return json(405, { ok: false, code: 'method', message: 'Use POST for this endpoint.' }, origin, { Allow: 'POST, OPTIONS' });
        if (localMock) {
          const window = Math.floor(now() / 60_000);
          // Only the explicitly local mock uses process-local counters.
          if (mockLimits.get('window') !== window) { mockLimits.clear(); mockLimits.set('window', window); }
          const count = (mockLimits.get(origin) || 0) + 1;
          mockLimits.set(origin, count);
          if (count > 5) throw new PublicError(429, 'rate_limited', 'Please wait a minute before trying again.', 60);
        } else {
          let limit;
          try { limit = await env.RATE_LIMITER.limit({ key: `feedback:${await rateKey(request, env, now())}` }); }
          catch { throw new PublicError(503, 'unavailable', 'Feedback is temporarily unavailable.'); }
          if (limit?.success !== true) throw new PublicError(429, 'rate_limited', 'Please wait a minute before trying again.', 60);
        }
        const fields = validateFields(await readJson(request));
        if (localMock) {
          if (fields.turnstileToken !== 'local-mock-token') throw new PublicError(422, 'captcha', 'Use the explicit local mock verification control.');
          return json(200, { ok: true, mock: true, message: 'Local test complete. No message was sent to Telegram.' }, origin);
        }
        await verify(fields.turnstileToken, env, hostname);
        const source = origin + fields.sourcePath;
        const text = [
          '<b>WizardLoop website feedback</b>',
          '',
          `<b>Name:</b> ${escapeHtml(fields.name)}`,
          ...(fields.email ? [`<b>Email:</b> ${escapeHtml(fields.email)}`] : []),
          `<b>Received:</b> ${new Date(now()).toISOString()}`,
          `<b>Source:</b> <a href="${escapeHtml(source)}">${escapeHtml(source)}</a>`,
          '',
          escapeHtml(fields.message),
        ].join('\n');
        let delivered;
        try {
          delivered = await upstream(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, protect_content: true }),
          });
        } catch {
          // No automatic sendMessage retry: a timeout may occur after successful delivery.
          return json(503, { ok: false, code: 'delivery_unconfirmed', mayHaveBeenDelivered: true, message: 'Delivery could not be confirmed. Please wait before retrying with a new verification.' }, origin);
        }
        if (!delivered.response.ok || delivered.payload?.ok !== true) {
          const retryAfter = delivered.payload?.error_code === 429 ? Math.min(3600, Math.max(1, Number(delivered.payload?.parameters?.retry_after) || 60)) : undefined;
          throw new PublicError(503, 'delivery_unavailable', 'Your feedback could not be confirmed. Please retry later with a new verification.', retryAfter);
        }
        return json(200, { ok: true, mock: false, message: 'Your feedback was sent. Thank you.' }, origin);
      } catch (error) {
        if (error instanceof PublicError) return json(error.status, { ok: false, code: error.code, message: error.message }, allowedOrigin, error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {});
        return json(503, { ok: false, code: 'unavailable', message: 'Feedback is temporarily unavailable.' }, allowedOrigin);
      }
    },
  };
}

export default createWorker();
