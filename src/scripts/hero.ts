export function mountHero(node: HTMLElement) {
  const video = node.querySelector<HTMLVideoElement>('[data-hero-video]');
  if (!video) return;
  const description =
    node.getAttribute('aria-label') || 'Original WizardLoop illustration';
  const failed = new Set<string>();
  let visible = false;
  let selected = '';
  let suspended = false;
  let progressTimer: number | undefined;
  let lastTime = 0;
  let lastProgress = 0;
  let lastSample = 0;
  video.muted = true;
  const allowed = () =>
    visible &&
    !suspended &&
    !document.hidden &&
    document.documentElement.dataset.motion !== 'paused';
  const isCurrentSource = () =>
    Boolean(selected) &&
    video!.getAttribute('src') === selected &&
    video!.currentSrc === new URL(selected, document.baseURI).href;

  function stopProgressWatch() {
    window.clearTimeout(progressTimer);
    progressTimer = undefined;
  }

  function watchProgress() {
    if (progressTimer !== undefined || !allowed() || video!.paused) return;
    lastTime = video!.currentTime;
    lastSample = lastProgress = performance.now();
    const sample = () => {
      progressTimer = undefined;
      if (
        !allowed() ||
        !isCurrentSource() ||
        node.dataset.state !== 'ready' ||
        video!.paused
      )
        return;
      const currentTime = video!.currentTime;
      const now = performance.now();
      // A delayed timer may miss entire healthy loops. Require continuously
      // observed nonprogress rather than treating a busy main thread as failure.
      if (now - lastSample > 1500) lastProgress = now;
      lastSample = now;
      if (Math.abs(currentTime - lastTime) > 0.001) {
        lastTime = currentTime;
        lastProgress = now;
      } else if (now - lastProgress >= 4000) {
        // Some decoders stall at a loop boundary without pause/error events.
        // A "playing" flag alone must not leave a frozen frame presented as motion.
        failed.add(selected);
        unavailable();
        return;
      }
      progressTimer = window.setTimeout(sample, 500);
    };
    progressTimer = window.setTimeout(sample, 500);
  }

  function unavailable() {
    stopProgressWatch();
    video!.pause();
    video!.hidden = true;
    node.dataset.state = 'unavailable';
    node.dataset.playing = 'false';
    node.setAttribute(
      'aria-label',
      `${description}. Motion unavailable; showing a still preview.`,
    );
  }

  function reconcile() {
    const theme =
      document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const source = `/media/hero/portal-${theme}.mp4`;
    if (selected !== source) {
      stopProgressWatch();
      video!.pause();
      node.dataset.state = 'poster';
      node.dataset.playing = 'false';
      video!.removeAttribute('src');
      video!.load();
      selected = source;
      video!.hidden = false;
      node.setAttribute('aria-label', description);
    }
    if (failed.has(source)) {
      unavailable();
      return;
    }
    if (!allowed()) {
      stopProgressWatch();
      video!.pause();
      return;
    }
    if (video!.getAttribute('src') !== source) {
      video!.src = source;
      video!.load();
    }
    // Playback may be denied by browser policy. The still stays useful and the
    // visitor can explicitly resume from the persistent motion control.
    void video!.play().catch(() => {});
    if (node.dataset.state === 'ready') watchProgress();
  }

  video.addEventListener('playing', () => {
    if (!allowed() || video.paused || !isCurrentSource()) return;
    node.dataset.state = 'ready';
    node.dataset.playing = 'true';
    node.setAttribute('aria-label', description);
    watchProgress();
  });
  video.addEventListener('pause', () => {
    if (!video.paused) return;
    stopProgressWatch();
    node.dataset.playing = 'false';
    // A native decoder can stop a looping clip without an error event. Our own
    // pauses first change permission or source state, so they keep their frame.
    // Do not repeatedly force playback against a browser-initiated pause.
    if (allowed() && isCurrentSource() && node.dataset.state === 'ready') {
      failed.add(selected);
      unavailable();
    }
  });
  video.addEventListener('error', () => {
    if (!isCurrentSource()) return;
    failed.add(selected);
    unavailable();
  });
  const observer = new IntersectionObserver(
    (entries) => {
      visible = entries.some(
        (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.12,
      );
      reconcile();
    },
    { threshold: [0, 0.12] },
  );
  observer.observe(node);
  document.addEventListener('wizardloop:preferences', reconcile);
  document.addEventListener('visibilitychange', reconcile);
  window.addEventListener('pagehide', () => {
    suspended = true;
    stopProgressWatch();
    video.pause();
  });
  window.addEventListener('pageshow', () => {
    suspended = false;
    reconcile();
  });
}
