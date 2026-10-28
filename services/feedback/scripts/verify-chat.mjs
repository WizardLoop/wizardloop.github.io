/** Run interactively on a trusted machine. Nothing is written to disk. */
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

async function hiddenToken() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Use an interactive terminal. Tokens are never accepted as arguments.');
  process.stdout.write('Telegram bot token (hidden): ');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let input = '';
    const cleanup = () => { process.stdin.off('data', receive); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n'); };
    const receive = chunk => {
      for (const char of chunk.toString()) {
        if (char === '\u0003') { cleanup(); reject(new Error('Cancelled.')); return; }
        if (char === '\r' || char === '\n') { cleanup(); resolve(input.trim()); return; }
        if (char === '\u007f' || char === '\b') input = input.slice(0, -1);
        else if (char >= ' ' && input.length < 200) input += char;
      }
    };
    process.stdin.on('data', receive);
  });
}

let token = '';
try {
  if (process.argv.length !== 2) throw new Error('This helper accepts no command-line arguments.');
  token = await hiddenToken();
  if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('The token format is invalid.');
  async function api(method, body = {}) {
    let response, payload;
    try {
      response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000), redirect: 'error',
      });
      payload = await response.json();
    } catch { throw new Error('Telegram could not be reached. No credentials were saved.'); }
    if (!response.ok || payload.ok !== true) throw new Error('Telegram rejected the setup request. Check the bot and try again.');
    return payload.result;
  }
  const me = await api('getMe');
  const webhook = await api('getWebhookInfo');
  if (webhook.url) throw new Error('This bot has an active webhook. Use a dedicated feedback bot; this helper will not remove a webhook.');
  const challenge = `wizardloop-verify-${randomBytes(18).toString('base64url')}`;
  console.log(`Open https://t.me/${me.username} from your @wizardloop account and press Start.`);
  console.log('Send this one-time text in the private chat:');
  console.log(challenge);
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  await terminal.question('Press Enter after sending that text. ');
  terminal.close();
  const updates = await api('getUpdates', { limit: 100, timeout: 0, allowed_updates: ['message'] });
  const matches = updates.filter(update => {
    const message = update.message;
    return message?.chat?.type === 'private' && message?.from?.is_bot === false
      && message.from.id === message.chat.id && message.from.username?.toLowerCase() === 'wizardloop'
      && message.text === challenge;
  });
  if (matches.length !== 1) throw new Error('No unique matching private message was found. Check the account, send the exact text, and rerun.');
  const chatId = String(matches[0].message.chat.id);
  const chat = await api('getChat', { chat_id: chatId });
  if (chat.type !== 'private' || chat.username?.toLowerCase() !== 'wizardloop' || String(chat.id) !== chatId || !/^[1-9]\d{0,15}$/.test(chatId)) {
    throw new Error('The private chat identity could not be confirmed.');
  }
  console.log('Verified a private chat belonging to @wizardloop. No test message was sent.');
  console.log('Copy this value into the TELEGRAM_CHAT_ID secret using the platform secret manager:');
  console.log(chatId);
  console.log('Set TELEGRAM_CHAT_ID_VERIFIED=true after review. Actual send permission still needs an approved delivery test.');
  console.log('This helper wrote no files and did not change Telegram webhook or update offsets. Clear this terminal if it is shared.');
} catch (error) {
  // Only explicitly authored messages are printed; upstream errors may contain token-bearing URLs.
  console.error(error instanceof Error && !/https:\/\/api\.telegram/.test(error.message) ? error.message : 'Setup failed. No credentials were saved.');
  process.exitCode = 1;
} finally { token = ''; }
