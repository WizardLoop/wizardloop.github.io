export {};
interface TurnstileAPI {
  render: (target: string, options: Record<string, unknown>) => string;
  reset: (id?: string) => void;
}
declare global {
  interface Window {
    turnstile?: TurnstileAPI;
  }
}
const form = document.querySelector<HTMLFormElement>('[data-feedback-form]')!;
const controls = form.querySelector<HTMLFieldSetElement>(
  '[data-feedback-controls]',
)!;
const submit = form.querySelector<HTMLButtonElement>('[data-feedback-submit]')!;
const verificationButton = form.querySelector<HTMLButtonElement>(
  '[data-verify-start]',
)!;
const verificationState = form.querySelector<HTMLElement>(
  '[data-verification-state]',
)!;
const status = form.querySelector<HTMLElement>('[data-feedback-status]')!;
const local = ['127.0.0.1', 'localhost'].includes(location.hostname);
const endpoint =
  form.dataset.endpoint || (local ? 'http://127.0.0.1:8787/feedback' : '');
const sitekey = form.dataset.sitekey || '';
const mock = local && !form.dataset.endpoint;
let ready = mock;
try {
  const target = new URL(endpoint);
  const localTarget =
    local &&
    ['127.0.0.1', 'localhost'].includes(target.hostname) &&
    target.protocol === 'http:';
  ready ||=
    (target.protocol === 'https:' || localTarget) &&
    !target.username &&
    !target.password &&
    !target.hash &&
    !target.search &&
    /^[A-Za-z0-9_-]{1,200}$/.test(sitekey);
} catch {
  /* The static disabled form remains safe when configuration is invalid. */
}
let token = '',
  widget: string | undefined,
  busy = false;
function setStatus(message: string, alert = false) {
  status.hidden = false;
  status.setAttribute('role', alert ? 'alert' : 'status');
  status.textContent = message;
}
if (mock) {
  form.querySelector<HTMLElement>('[data-local-demo]')!.hidden = false;
  form.querySelector<HTMLElement>('[data-captcha-description]')!.textContent =
    'Explicit local verification for testing only. This does not run a real CAPTCHA or send a message.';
  verificationButton.textContent = 'Use local mock verification';
} else if (!ready) {
  form.querySelector<HTMLElement>('[data-feedback-unavailable]')!.hidden =
    false;
  submit.disabled = true;
  verificationButton.disabled = true;
}
verificationButton.addEventListener('click', async () => {
  if (!ready) return;
  if (mock) {
    token = 'local-mock-token';
    verificationState.textContent =
      'Local mock verification ready. Nothing will be sent.';
    return;
  }
  verificationButton.disabled = true;
  verificationState.textContent = 'Loading secure verification...';
  try {
    if (widget !== undefined && window.turnstile) {
      window.turnstile.reset(widget);
      verificationState.textContent =
        'Complete the Cloudflare verification below.';
      return;
    }
    if (!window.turnstile)
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src =
          'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        const cleanup = () => {
          window.clearTimeout(timeout);
          script.onload = null;
          script.onerror = null;
        };
        const fail = (message: string) => {
          cleanup();
          script.remove();
          reject(new Error(message));
        };
        const timeout = window.setTimeout(
          () => fail('Verification timeout'),
          12000,
        );
        script.onload = () => {
          cleanup();
          resolve();
        };
        script.onerror = () => fail('Verification unavailable');
        document.head.append(script);
      });
    widget = window.turnstile!.render('#turnstile-container', {
      sitekey,
      action: 'feedback',
      theme: document.documentElement.dataset.theme,
      'refresh-expired': 'auto',
      callback: (value: string) => {
        token = value;
        verificationState.textContent =
          'Verification complete. You can send your feedback.';
      },
      'expired-callback': () => {
        token = '';
        verificationState.textContent =
          'Verification expired. Please verify again.';
      },
      'error-callback': () => {
        token = '';
        verificationState.textContent =
          'Verification could not complete. Please retry or contact me on Telegram.';
        verificationButton.disabled = false;
      },
    });
    verificationState.textContent =
      'Complete the Cloudflare verification below.';
  } catch {
    verificationState.textContent =
      'Verification could not load. Retry or use the Telegram or email link.';
    verificationButton.disabled = false;
  }
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy || !ready) return;
  const fields = {
    name: form.elements.namedItem('name') as HTMLInputElement,
    message: form.elements.namedItem('message') as HTMLTextAreaElement,
    email: form.elements.namedItem('email') as HTMLInputElement,
  };
  let firstInvalid: HTMLInputElement | HTMLTextAreaElement | null = null;
  for (const [name, field] of Object.entries(fields)) {
    const value = field.value.trim();
    const message =
      name !== 'email' && !value
        ? `Please enter ${name === 'name' ? 'your name' : 'a message'}.`
        : name === 'email' && value && !field.validity.valid
          ? 'Please enter a valid email address, or leave this field blank.'
          : value.length > field.maxLength
            ? `Please keep this field within ${field.maxLength} characters.`
            : '';
    field.setAttribute('aria-invalid', String(Boolean(message)));
    form.querySelector(`#${name}-error`)!.textContent = message;
    if (message && !firstInvalid) firstInvalid = field;
  }
  if (firstInvalid) {
    firstInvalid.focus();
    setStatus('Please review the highlighted fields.', true);
    return;
  }
  if (!token) {
    setStatus('Please complete verification before sending.', true);
    verificationButton.focus();
    return;
  }
  busy = true;
  submit.disabled = true;
  submit.textContent = mock ? 'Testing locally...' : 'Sending...';
  form.setAttribute('aria-busy', 'true');
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      body: JSON.stringify({
        name: fields.name.value.trim(),
        message: fields.message.value.trim(),
        email: fields.email.value.trim(),
        website: (form.elements.namedItem('website') as HTMLInputElement).value,
        turnstileToken: token,
        sourcePath: location.pathname,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      if (data.mayHaveBeenDelivered || data.code === 'delivery_unconfirmed')
        throw new Error(
          'Delivery could not be confirmed. Please wait before retrying with new verification. Your message is still here.',
        );
      if (response.status === 429)
        throw new Error(
          'Please wait a minute before trying again. Your message is still here.',
        );
      if (data.code === 'captcha')
        throw new Error(
          'Verification could not be confirmed. Please verify again.',
        );
      throw new Error(
        'Your message could not be delivered. Please try again, or use Telegram.',
      );
    }
    setStatus(
      data.mock
        ? 'Local test complete. No message was sent to Telegram.'
        : 'Thank you. Your feedback was sent successfully.',
    );
    form.reset();
  } catch (error) {
    setStatus(
      error instanceof TypeError ||
        (error instanceof Error && error.name === 'TimeoutError')
        ? mock
          ? 'The local mock is not running. Start npm run dev:feedback, then retry. No message was sent.'
          : 'The connection ended before delivery could be confirmed. Your message is still here. Wait before retrying or contact me directly.'
        : error instanceof Error
          ? error.message
          : 'Something went wrong. Please try again.',
      true,
    );
  } finally {
    busy = false;
    token = '';
    submit.disabled = false;
    submit.textContent = 'Send feedback';
    form.removeAttribute('aria-busy');
    if (widget !== undefined) window.turnstile?.reset(widget);
    verificationState.textContent = mock
      ? 'Use the local verification control before another test.'
      : 'Please verify again before sending another message.';
  }
});
// Enable only after every handler is installed. The server-rendered form stays
// disabled if JavaScript is blocked, fails to load, or configuration is absent.
if (ready) {
  controls.disabled = false;
  submit.disabled = false;
  verificationButton.disabled = false;
}
