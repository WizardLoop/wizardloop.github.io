import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('local HTTP adapter returns an explicit mock result and refuses remote origins', { timeout: 15_000 }, async () => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/mock-server.mjs', import.meta.url))], {
    env: { ...process.env, MOCK_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let text = '';
      child.stdout.on('data', chunk => { text += chunk; const found = text.match(/http:\/\/127\.0\.0\.1:\d+\/feedback/); if (found) resolve(found[0]); });
      child.on('error', reject);
      child.on('exit', code => reject(new Error(`Local mock exited before startup (${code}).`)));
    });
    const send = origin => fetch(endpoint, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Local test', message: 'Offline mock smoke test.', turnstileToken: 'local-mock-token' }),
    });
    const success = await send('http://localhost:4321');
    assert.equal(success.status, 200);
    assert.equal((await success.json()).mock, true);
    assert.equal(success.headers.get('Access-Control-Allow-Origin'), 'http://localhost:4321');
    const denied = await send('https://wizardloop.com');
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.has('Access-Control-Allow-Origin'), false);
  } finally {
    child.kill();
    await new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
  }
});
