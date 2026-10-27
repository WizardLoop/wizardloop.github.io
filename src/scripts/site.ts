export {};
const root = document.documentElement;
const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const save = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Preferences work for this visit when storage is unavailable. */
  }
};
const themeButton = document.querySelector<HTMLButtonElement>(
  '[data-theme-toggle]',
);
const motionButton = document.querySelector<HTMLButtonElement>(
  '[data-motion-toggle]',
);
const motionMedia = matchMedia('(prefers-reduced-motion: reduce)');
function updateControls() {
  const themeLabel = `Switch to ${root.dataset.theme === 'dark' ? 'light' : 'dark'} mode`;
  themeButton?.setAttribute('aria-label', themeLabel);
  themeButton?.setAttribute('data-tooltip', themeLabel);
  const paused = root.dataset.motion === 'paused';
  const label = paused ? 'Resume motion' : 'Pause motion';
  motionButton?.setAttribute('aria-label', label);
  motionButton?.setAttribute('data-tooltip', label);
  motionButton?.setAttribute('aria-pressed', String(paused));
  document
    .querySelectorAll<HTMLVideoElement>('video[data-profile-video]')
    .forEach((video) => {
      if (paused) video.pause();
      else video.play().catch(() => {});
    });
  document.dispatchEvent(new CustomEvent('wizardloop:preferences'));
}
themeButton?.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  save('wizardloop-theme', root.dataset.theme);
  updateControls();
});
motionButton?.addEventListener('click', () => {
  root.dataset.motion = root.dataset.motion === 'paused' ? 'running' : 'paused';
  save('wizardloop-motion', root.dataset.motion);
  updateControls();
});
motionMedia.addEventListener('change', () => {
  if (motionMedia.matches) {
    root.dataset.motion = 'paused';
    updateControls();
  }
});
updateControls();

const tooltipTriggers = [
  ...document.querySelectorAll<HTMLElement>('[data-tooltip]'),
];
tooltipTriggers.forEach((trigger) => {
  const reset = () => {
    if (!trigger.matches(':hover, :focus-within'))
      trigger.removeAttribute('data-tooltip-dismissed');
  };
  trigger.addEventListener('pointerleave', reset);
  trigger.addEventListener('focusout', () => queueMicrotask(reset));
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  tooltipTriggers.forEach((trigger) => {
    if (trigger.matches(':hover, :focus-within'))
      trigger.setAttribute('data-tooltip-dismissed', '');
  });
});

function wireDialog(
  dialog: HTMLDialogElement | null,
  openers: NodeListOf<HTMLElement>,
  closer: HTMLElement | null,
) {
  if (!dialog) return;
  let opener: HTMLElement | null = null;
  function close() {
    dialog?.close();
  }
  openers.forEach((button) =>
    button.addEventListener('click', () => {
      opener = button;
      dialog.showModal();
      document.body.style.overflow = 'hidden';
      button.setAttribute('aria-expanded', 'true');
      dialog.querySelector<HTMLElement>('button,a,input')?.focus();
    }),
  );
  closer?.addEventListener('click', close);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      )
        close();
    }
  });
  dialog.addEventListener('close', () => {
    document.body.style.overflow = '';
    opener?.setAttribute('aria-expanded', 'false');
    opener?.focus();
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const items = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button,a,input,select,textarea,[tabindex="0"]',
      ),
    ].filter(
      (el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0,
    );
    event.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[
      event.shiftKey
        ? i <= 0
          ? items.length - 1
          : i - 1
        : (i + 1) % items.length
    ]?.focus();
  });
}
const menu = document.querySelector<HTMLDialogElement>('#mobile-nav');
wireDialog(
  menu,
  document.querySelectorAll<HTMLElement>('[data-menu-toggle]'),
  document.querySelector('[data-menu-close]'),
);
matchMedia('(min-width:901px)').addEventListener('change', (e) => {
  if (e.matches && menu?.open) menu.close();
});
const privacyDialog =
  document.querySelector<HTMLDialogElement>('#privacy-dialog');
wireDialog(
  privacyDialog,
  document.querySelectorAll<HTMLElement>('[data-privacy-open]'),
  document.querySelector('[data-privacy-close]'),
);
const consent = document.querySelector<HTMLInputElement>('#telegram-consent');
if (consent) consent.checked = read('wizardloop-telegram-consent') === 'yes';
document.querySelector('[data-privacy-save]')?.addEventListener('click', () => {
  save('wizardloop-telegram-consent', consent?.checked ? 'yes' : 'no');
  document.dispatchEvent(new CustomEvent('wizardloop:consent'));
  privacyDialog?.close();
});

document
  .querySelectorAll<HTMLVideoElement>('video[data-profile-video]')
  .forEach((video) => {
    video.addEventListener(
      'error',
      () => {
        video.pause();
        video.hidden = true;
        const image = video.parentElement?.querySelector<HTMLImageElement>(
          'img[data-profile-image]',
        );
        if (image) image.hidden = false;
      },
      true,
    );
  });

document
  .querySelectorAll<HTMLImageElement>('img[data-profile-image]')
  .forEach((img) => {
    const sources = [
      img.dataset.githubFallback,
      '/media/profile/fallback.svg',
    ].filter(Boolean) as string[];
    let next = 0;
    function fallback() {
      if (next < sources.length) {
        img.src = sources[next++];
        const label = document.querySelector('[data-profile-source]');
        if (label)
          label.textContent =
            next === 1 ? 'GitHub profile fallback' : 'Local WizardLoop artwork';
      }
    }
    img.addEventListener('error', fallback);
    if (img.complete && !img.naturalWidth) fallback();
  });

const artNodes = [
  ...document.querySelectorAll<HTMLElement>('[data-animation]'),
];
const hero = document.querySelector<HTMLElement>('[data-native-hero]');
if (hero) import('./hero').then(({ mountHero }) => mountHero(hero));
if (artNodes.length)
  import('./motion').then(({ mountMotion }) => mountMotion(artNodes));
if (document.querySelector('[data-telegram-feed]')) import('./posts');
if (document.querySelector('[data-feedback-form]')) import('./feedback');
