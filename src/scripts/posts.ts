export {};
const feed = document.querySelector<HTMLElement>('[data-telegram-feed]');
const load = document.querySelector<HTMLButtonElement>('[data-telegram-load]');
const reset = document.querySelector<HTMLButtonElement>(
  '[data-telegram-reset]',
);
const status = document.querySelector<HTMLElement>('[data-telegram-status]');
const slots = [
  ...document.querySelectorAll<HTMLElement>('[data-telegram-slot]'),
];
const consentInput =
  document.querySelector<HTMLInputElement>('#telegram-consent');
const cards = [...document.querySelectorAll<HTMLElement>('.telegram-card')];
const more = document.querySelector<HTMLButtonElement>('[data-posts-more]');
let visibleCount = 6;
cards.forEach((card, index) => {
  card.hidden = index >= visibleCount;
});
if (more) more.hidden = cards.length <= visibleCount;
let consent = false;
try {
  consent = localStorage.getItem('wizardloop-telegram-consent') === 'yes';
} catch {}
let generation = 0;
const unload = () => {
  generation++;
  slots.forEach((slot) => {
    slot.replaceChildren();
    slot.dataset.loaded = 'false';
  });
};
function render(resetExisting = true) {
  if (resetExisting) unload();
  const paused = document.documentElement.dataset.motion === 'paused';
  if (status)
    status.textContent = !consent
      ? 'Telegram content is off. You can still open every original post.'
      : paused
        ? 'Telegram embeds are unloaded while motion is paused. Open a post in Telegram or resume motion to load it here.'
        : 'Loading original Telegram posts. Their media and formatting are provided by Telegram.';
  if (load) load.hidden = consent;
  if (reset) reset.hidden = !consent;
  if (!consent || paused) return;
  const current = generation;
  slots.forEach((slot) => {
    if (slot.closest('[hidden]')) return;
    if (slot.dataset.loaded === 'true' || slot.dataset.loaded === 'loading')
      return;
    const id = slot.dataset.telegramSlot;
    if (!id || !/^wizard_loop\/\d+$/i.test(id)) return;
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.dataset.telegramPost = id;
    script.dataset.width = '100%';
    script.dataset.userpic = 'true';
    if (document.documentElement.dataset.theme === 'dark')
      script.dataset.dark = '1';
    script.addEventListener('error', () => {
      if (generation === current) {
        slot.dataset.loaded = 'failed';
        slot.textContent =
          'Telegram could not load. Use the original post link below.';
      }
    });
    slot.dataset.loaded = 'loading';
    slot.append(script);
    const observer = new MutationObserver(() => {
      const iframe = slot.querySelector('iframe');
      if (iframe) {
        iframe.title = `Original Telegram post ${id.split('/')[1]}`;
        iframe.loading = 'lazy';
        slot.dataset.loaded = 'true';
        observer.disconnect();
      }
    });
    observer.observe(slot, { childList: true });
    window.setTimeout(() => {
      observer.disconnect();
      if (generation === current && !slot.querySelector('iframe')) {
        slot.textContent =
          'The embed is taking longer than expected. Open the original post or retry.';
      }
    }, 15000);
  });
}
function setConsent(value: boolean) {
  consent = value;
  try {
    localStorage.setItem('wizardloop-telegram-consent', value ? 'yes' : 'no');
  } catch {}
  if (consentInput) consentInput.checked = value;
  render();
}
load?.addEventListener('click', () => setConsent(true));
reset?.addEventListener('click', () => setConsent(false));
document
  .querySelector('[data-telegram-retry]')
  ?.addEventListener('click', () => render());

more?.addEventListener('click', () => {
  const firstNew = cards[visibleCount];
  visibleCount += 6;
  cards.forEach((card, index) => {
    card.hidden = index >= visibleCount;
  });
  more.hidden = cards.length <= visibleCount;
  render(false);
  const heading = firstNew?.querySelector<HTMLElement>('h2');
  heading?.setAttribute('tabindex', '-1');
  heading?.focus({ preventScroll: true });
  firstNew?.scrollIntoView({
    behavior:
      document.documentElement.dataset.motion === 'paused'
        ? 'instant'
        : 'smooth',
    block: 'start',
  });
});
document.addEventListener('wizardloop:consent', () => {
  consent = consentInput?.checked || false;
  render();
});
document.addEventListener('wizardloop:preferences', () => render());
if (feed) render();
