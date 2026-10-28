import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import worker from '../worker.mjs';

const host = '127.0.0.1';
const port = process.env.MOCK_PORT === undefined ? 8787 : Number(process.env.MOCK_PORT);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('MOCK_PORT must be a valid local port.');
const env = {
  MODE: 'mock',
  ALLOWED_ORIGINS: 'http://127.0.0.1:4321,http://localhost:4321,http://127.0.0.1:4322,http://localhost:4322',
};

const server = createServer(async (incoming, outgoing) => {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
    const request = new Request(`http://${host}:${port}${incoming.url || '/'}`, {
      method: incoming.method,
      headers,
      ...(!['GET', 'HEAD'].includes(incoming.method || '') ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}),
    });
    const response = await worker.fetch(request, env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(await response.text());
  } catch {
    outgoing.writeHead(400, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    outgoing.end('{"ok":false,"code":"invalid_request"}');
  }
});
server.listen(port, host, () => {
  console.log(`Local feedback mock: http://${host}:${server.address().port}/feedback`);
  console.log('Explicit local mock only. No CAPTCHA verification or Telegram messages are sent.');
});
