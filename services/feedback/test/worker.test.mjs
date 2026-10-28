import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../worker.mjs';

const at = Date.UTC(2026, 9, 27, 12);
const base = { name: 'A visitor', message: 'Hello from the website.', email: '', website: '', turnstileToken: 'fresh-example-token', sourcePath: '/feedback/' };
const env = (overrides = {}) => ({
  MODE: 'production', ALLOWED_ORIGINS: 'https://wizardloop.com', TURNSTILE_HOSTNAMES: 'wizardloop.com',
  TURNSTILE_SECRET_KEY: 'unit-test-only-turnstile-secret', TELEGRAM_BOT_TOKEN: '123456:test_only_not_a_real_token_123456',
  TELEGRAM_CHAT_ID: '123456789', TELEGRAM_CHAT_ID_VERIFIED: 'true', RATE_LIMIT_SALT: 'unit-test-only-random-salt-value',
  RATE_LIMITER: { limit: async () => ({ success: true }) }, ...overrides,
});
const request = (body = base, { origin = 'https://wizardloop.com', headers = {}, method = 'POST', url = 'https://feedback.invalid/feedback' } = {}) => new Request(url, {
  method, headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...headers },
  ...(!['GET', 'HEAD', 'OPTIONS'].includes(method) ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
});
function transport({ verify, delivery, throwsAt, failVerificationOnce = false } = {}) {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const isVerify = url.includes('siteverify');
    if (throwsAt === (isVerify ? 'verify' : 'delivery')) throw new Error('Sensitive upstream error must never escape.');
    if (isVerify && failVerificationOnce && calls.filter(c => c.url.includes('siteverify')).length === 1) return Response.json({ 'error-codes': ['internal-error'] }, { status: 503 });
    return Response.json(isVerify ? (verify || { success: true, action: 'feedback', hostname: 'wizardloop.com' }) : (delivery || { ok: true, result: { message_id: 1 } }));
  };
  return { calls, fetch };
}
async function run(body = base, options = {}, environment = env(), upstream = transport()) {
  const worker = createWorker({ fetch: upstream.fetch, now: () => at });
  const response = await worker.fetch(request(body, options), environment);
  return { response, payload: await response.json(), calls: upstream.calls };
}

test('valid verified feedback sends one safely escaped private Telegram message', async () => {
  const { response, payload, calls } = await run({ ...base, name: '<b>Visitor</b>', message: '<a href="evil">hello</a> & goodbye', email: 'hello@example.invalid' });
  assert.equal(response.status, 200);
  assert.deepEqual(payload, { ok: true, mock: false, message: 'Your feedback was sent. Thank you.' });
  assert.equal(calls.length, 2);
  const sent = JSON.parse(calls[1].options.body);
  assert.equal(sent.chat_id, '123456789');
  assert.equal(sent.parse_mode, 'HTML');
  assert.match(sent.text, /&lt;b&gt;Visitor&lt;\/b&gt;/);
  assert.match(sent.text, /&lt;a href=&quot;evil&quot;&gt;/);
  assert.match(sent.text, /2026-10-27T12:00:00.000Z/);
  assert.match(sent.text, /https:\/\/wizardloop.com\/feedback\//);
  assert.doesNotMatch(sent.text, /192\.0\.2\.1/);
  assert.equal(sent.link_preview_options.is_disabled, true);
  assert.equal(calls[0].options.body.has('remoteip'), false);
});

test('required fields, length limits, malformed email and header injection reject before CAPTCHA', async () => {
  for (const body of [{ ...base, name: '' }, { ...base, message: '' }, { ...base, name: 'x'.repeat(81) }, { ...base, message: 'x'.repeat(2501) }, { ...base, email: 'bad\r\nBcc:someone' }, { ...base, name: 'A\nB' }, { ...base, message: '\u0000' }, { ...base, email: {} }]) {
    const result = await run(body);
    assert.equal(result.response.status, 422);
    assert.equal(result.calls.length, 0);
  }
});

test('honeypot, unsupported fields and attacker-controlled source URLs reject', async () => {
  for (const body of [{ ...base, website: 'spam' }, { ...base, chat_id: '999' }, { ...base, sourcePath: '//evil.invalid/' }, { ...base, sourcePath: 'https://evil.invalid/' }, { ...base, sourcePath: '/feedback/?email=visitor' }]) {
    const result = await run(body);
    assert.equal(result.response.status, 422);
    assert.equal(result.calls.length, 0);
  }
});

test('unknown, lookalike, null and noncanonical origins have no CORS response', async () => {
  for (const origin of ['https://wizardloop.com.evil.invalid', 'https://evil.invalid', 'null', 'https://wizardloop.com/', 'http://wizardloop.com']) {
    const result = await run(base, { origin });
    assert.equal(result.response.status, 403);
    assert.equal(result.response.headers.has('Access-Control-Allow-Origin'), false);
    assert.equal(result.calls.length, 0);
  }
});

test('a missing Origin cannot reach Telegram', async () => {
  const req = request(); req.headers.delete('Origin');
  const upstream = transport();
  const result = await createWorker({ fetch: upstream.fetch }).fetch(req, env());
  assert.equal(result.status, 403); assert.equal(upstream.calls.length, 0);
});

test('preflight restricts methods and headers, returning exact origin and no credentials wildcard', async () => {
  const worker = createWorker();
  const result = await worker.fetch(request(base, { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } }), env());
  assert.equal(result.status, 204);
  assert.equal(result.headers.get('Access-Control-Allow-Origin'), 'https://wizardloop.com');
  assert.equal(result.headers.get('Access-Control-Allow-Headers'), 'Content-Type');
  assert.equal(result.headers.has('Access-Control-Allow-Credentials'), false);
  const invalid = await worker.fetch(request(base, { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'DELETE' } }), env());
  assert.equal(invalid.status, 403);
});

test('invalid JSON, wrong content type and byte limits fail safely', async () => {
  for (const [body, headers, status] of [['{', {}, 400], ['[]', {}, 422], [base, { 'Content-Type': 'text/plain' }, 415], ['x'.repeat(16385), {}, 413], [base, { 'Content-Length': '16385' }, 413], [{ ...base, message: 'א'.repeat(8500) }, {}, 413]]) {
    const result = await run(body, { headers });
    assert.equal(result.response.status, status); assert.equal(result.calls.length, 0);
  }
});

test('missing rate limiter, secrets, verification flag and test CAPTCHA keys fail closed', async () => {
  for (const override of [{ RATE_LIMITER: undefined }, { TURNSTILE_SECRET_KEY: '' }, { TELEGRAM_CHAT_ID: '@wizardloop' }, { TELEGRAM_CHAT_ID: '-1234' }, { TELEGRAM_CHAT_ID_VERIFIED: 'false' }, { RATE_LIMIT_SALT: '' }, { MODE: undefined }, { TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' }]) {
    const result = await run(base, {}, env(override));
    assert.equal(result.response.status, 503); assert.equal(result.calls.length, 0);
  }
});

test('rate limit rejects before Siteverify and sends a Retry-After header', async () => {
  const result = await run(base, {}, env({ RATE_LIMITER: { limit: async () => ({ success: false }) } }));
  assert.equal(result.response.status, 429); assert.equal(result.response.headers.get('Retry-After'), '60'); assert.equal(result.calls.length, 0);
});

test('rate-limit infrastructure failures do not bypass protection', async () => {
  const result = await run(base, {}, env({ RATE_LIMITER: { limit: async () => { throw new Error('internal details'); } } }));
  assert.equal(result.response.status, 503); assert.equal(result.calls.length, 0); assert.doesNotMatch(JSON.stringify(result.payload), /internal details/);
});

test('rate keys do not expose raw IP and change after daily rotation', async () => {
  const keys = [];
  const e = env({ RATE_LIMITER: { limit: async ({ key }) => { keys.push(key); return { success: false }; } } });
  for (const time of [at, at, at + 86_400_000]) await createWorker({ now: () => time }).fetch(request(), e);
  assert.match(keys[0], /^feedback:[a-f0-9]{64}$/); assert.equal(keys[0], keys[1]); assert.notEqual(keys[0], keys[2]); assert.doesNotMatch(keys[0], /192\.0\.2/);
});

test('invalid CAPTCHA, replay, wrong action and wrong hostname never send', async () => {
  for (const verify of [{ success: false }, { success: false, 'error-codes': ['timeout-or-duplicate'] }, { success: true, action: 'login', hostname: 'wizardloop.com' }, { success: true, action: 'feedback', hostname: 'sub.wizardloop.com' }]) {
    const result = await run(base, {}, env(), transport({ verify }));
    assert.equal(result.response.status, 422); assert.equal(result.payload.code, 'captcha'); assert.equal(result.calls.length, 1);
  }
});

test('verification transient retry reuses one idempotency key and then sends once', async () => {
  const result = await run(base, {}, env(), transport({ failVerificationOnce: true }));
  assert.equal(result.response.status, 200); assert.equal(result.calls.length, 3);
  assert.equal(result.calls[0].options.body.get('idempotency_key'), result.calls[1].options.body.get('idempotency_key'));
});

test('CAPTCHA network failure is bounded and does not leak upstream details', async () => {
  const result = await run(base, {}, env(), transport({ throwsAt: 'verify' }));
  assert.equal(result.response.status, 503); assert.equal(result.calls.length, 2); assert.equal(result.payload.code, 'verification_unavailable'); assert.doesNotMatch(JSON.stringify(result.payload), /Sensitive/);
});

test('upstream timeout aborts requests without an unbounded wait', async () => {
  let calls = 0;
  const worker = createWorker({ timeoutMs: 5, fetch: async (_url, { signal }) => new Promise((_, reject) => { calls += 1; signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))); }) });
  const response = await worker.fetch(request(), env());
  assert.equal(response.status, 503); assert.equal(calls, 2);
});

test('Telegram rejection is generic and a later user retry can succeed with a fresh CAPTCHA', async () => {
  const failed = await run(base, {}, env(), transport({ delivery: { ok: false, error_code: 429, parameters: { retry_after: 30 }, description: 'sensitive upstream detail' } }));
  assert.equal(failed.response.status, 503); assert.equal(failed.response.headers.get('Retry-After'), '30'); assert.equal(failed.calls.length, 2); assert.doesNotMatch(JSON.stringify(failed.payload), /sensitive/);
  const retry = await run({ ...base, turnstileToken: 'new-token-after-reset' });
  assert.equal(retry.response.status, 200); assert.equal(retry.calls.length, 2);
});

test('ambiguous Telegram timeout is not automatically retried or reported as successful', async () => {
  const result = await run(base, {}, env(), transport({ throwsAt: 'delivery' }));
  assert.equal(result.response.status, 503); assert.equal(result.calls.length, 2); assert.equal(result.payload.mayHaveBeenDelivered, true); assert.equal(result.payload.ok, false);
});

test('security headers apply to failures and success', async () => {
  for (const result of [await run(), await run({ ...base, message: '' })]) {
    assert.equal(result.response.headers.get('Cache-Control'), 'no-store');
    assert.equal(result.response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(result.response.headers.get('Referrer-Policy'), 'no-referrer');
    assert.match(result.response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  }
});

test('mock requires explicit mode, a loopback target and allowed loopback origin', async () => {
  const upstream = transport(); const worker = createWorker({ fetch: upstream.fetch, now: () => at });
  const localEnv = { MODE: 'mock', ALLOWED_ORIGINS: 'http://localhost:4321,https://wizardloop.com' };
  const localRequest = body => request(body, { origin: 'http://localhost:4321', url: 'http://127.0.0.1:8787/feedback' });
  const okay = await worker.fetch(localRequest({ ...base, turnstileToken: 'local-mock-token' }), localEnv);
  assert.equal(okay.status, 200); assert.equal((await okay.json()).mock, true); assert.equal(upstream.calls.length, 0);
  const badToken = await worker.fetch(localRequest(base), localEnv); assert.equal(badToken.status, 422);
  const publicTarget = await worker.fetch(request({ ...base, turnstileToken: 'local-mock-token' }), localEnv); assert.equal(publicTarget.status, 503);
  const noMode = await worker.fetch(localRequest(base), { ...localEnv, MODE: undefined }); assert.notEqual(noMode.status, 200);
});

test('local mock is rate limited and window expires', async () => {
  let clock = at; const worker = createWorker({ now: () => clock }); const localEnv = { MODE: 'mock', ALLOWED_ORIGINS: 'http://localhost:4321' };
  const send = () => worker.fetch(request({ ...base, turnstileToken: 'local-mock-token' }, { origin: 'http://localhost:4321', url: 'http://127.0.0.1:8787/feedback' }), localEnv);
  for (let i = 0; i < 5; i += 1) assert.equal((await send()).status, 200);
  assert.equal((await send()).status, 429); clock += 60_000; assert.equal((await send()).status, 200);
});

test('unknown routes and unsupported methods cannot submit', async () => {
  const upstream = transport(); const worker = createWorker({ fetch: upstream.fetch });
  assert.equal((await worker.fetch(request(base, { url: 'https://feedback.invalid/other' }), env())).status, 404);
  assert.equal((await worker.fetch(request(base, { method: 'GET' }), env())).status, 405);
  assert.equal(upstream.calls.length, 0);
});
