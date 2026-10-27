(() => {
  const root = document.documentElement;
  const key = `wizardloop-concept-${root.dataset.concept || 'index'}`;
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const storage = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* Preferences remain usable without storage. */ } } };
  const saved = storage.get(`${key}-theme`);
  const requested = new URLSearchParams(location.search).get('theme');
  root.dataset.theme = ['dark', 'light'].includes(requested) ? requested : ['dark', 'light'].includes(saved) ? saved : root.dataset.theme || 'dark';
  root.dataset.motion = media.matches || storage.get('wizardloop-motion') === 'paused' ? 'paused' : 'running';
  const theme = document.querySelector('[data-theme-toggle]');
  const motion = document.querySelector('[data-motion-toggle]');
  function sync() {
    const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    const paused = root.dataset.motion === 'paused';
    theme?.setAttribute('aria-label', `Switch to ${nextTheme} mode`);
    theme?.setAttribute('title', `Switch to ${nextTheme} mode`);
    theme?.querySelector('[data-theme-label]')?.replaceChildren(nextTheme === 'light' ? 'Light mode' : 'Dark mode');
    motion?.setAttribute('aria-label', paused ? 'Resume motion' : 'Pause motion');
    motion?.setAttribute('aria-pressed', String(paused));
    motion?.querySelector('[data-motion-label]')?.replaceChildren(paused ? 'Resume motion' : 'Pause motion');
    document.querySelectorAll('video').forEach(video => { if (paused) video.pause(); else video.play().catch(() => {}); });
  }
  theme?.addEventListener('click', () => { root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark'; storage.set(`${key}-theme`, root.dataset.theme); sync(); });
  motion?.addEventListener('click', () => { root.dataset.motion = root.dataset.motion === 'paused' ? 'running' : 'paused'; storage.set('wizardloop-motion', root.dataset.motion); sync(); });
  media.addEventListener('change', () => { if (media.matches) { root.dataset.motion = 'paused'; sync(); } });
  sync();

  const trigger = document.querySelector('[data-menu-toggle]');
  const menu = document.getElementById('mobile-nav');
  let priorFocus, priorOverflow;
  const inerted = [];
  function close() {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = priorOverflow || '';
    inerted.splice(0).forEach(el => { el.inert = false; });
    priorFocus?.focus();
  }
  function open() {
    if (!menu) return;
    priorFocus = trigger || document.activeElement;
    priorOverflow = document.body.style.overflow;
    menu.hidden = false;
    menu.setAttribute('role', 'dialog'); menu.setAttribute('aria-modal', 'true');
    if (!menu.hasAttribute('aria-label')) menu.setAttribute('aria-label', 'Site navigation');
    trigger?.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    document.querySelectorAll('main,footer').forEach(el => { if (!el.contains(menu) && !el.inert) { el.inert = true; inerted.push(el); } });
    menu.querySelector('button,a')?.focus();
  }
  trigger?.addEventListener('click', () => menu?.hidden ? open() : close());
  menu?.querySelectorAll('a,[data-menu-close]').forEach(el => el.addEventListener('click', close));
  document.addEventListener('keydown', event => {
    if (!menu || menu.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const items = [...menu.querySelectorAll('a,button,input,[tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
      event.preventDefault();
      const index = items.indexOf(document.activeElement);
      const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index + 1) % items.length;
      items[next]?.focus();
    }
  });
  matchMedia('(min-width:801px)').addEventListener('change', event => { if (event.matches) close(); });
  document.querySelectorAll('img[data-profile]').forEach(img => {
    const fallback = () => { if (!img.src.endsWith('profile-fallback.svg')) { img.src = '/assets/profile-fallback.svg'; const label = document.querySelector('[data-profile-source]'); if (label) label.textContent = 'Local WizardLoop fallback'; } };
    img.addEventListener('error', fallback);
    if (img.complete && img.naturalWidth === 0) fallback();
  });
  document.querySelectorAll('[data-pointer]').forEach(zone => {
    zone.addEventListener('pointermove', event => {
      if (root.dataset.motion === 'paused' || media.matches || event.pointerType === 'touch') return;
      const rect = zone.getBoundingClientRect();
      zone.style.setProperty('--px', `${((event.clientX - rect.left) / rect.width - .5) * 14}px`);
      zone.style.setProperty('--py', `${((event.clientY - rect.top) / rect.height - .5) * 12}px`);
    });
    zone.addEventListener('pointerleave', () => { zone.style.setProperty('--px', '0px'); zone.style.setProperty('--py', '0px'); });
  });
})();
