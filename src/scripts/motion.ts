import type { AnimationItem } from 'lottie-web';

type Playback = {
  animation: AnimationItem;
  ready: boolean;
  running: boolean;
  started: number;
  elapsed: number;
  lastFrame: number;
  fps: number;
  duration: number;
};

type MotionData = {
  fr: number;
  ip: number;
  op: number;
  [key: string]: unknown;
};

export function mountMotion(nodes: HTMLElement[]) {
  const instances = new Map<HTMLElement, Playback>();
  const visible = new Set<HTMLElement>();
  const loading = new Set<HTMLElement>();
  const assets = new Map<string, Promise<MotionData>>();
  let renderer:
    | Promise<typeof import('lottie-web/build/player/lottie_light_canvas')>
    | undefined;
  let request = 0;
  let lastTick = 0;
  let disposed = false;
  const allowed = () =>
    document.documentElement.dataset.motion !== 'paused' && !document.hidden;
  const resizeObserver = new ResizeObserver((entries) => {
    entries.forEach(({ target }) => {
      const node = target as HTMLElement;
      const playback = instances.get(node);
      if (
        !disposed &&
        playback?.ready &&
        node.clientWidth &&
        node.clientHeight
      ) {
        try {
          playback.animation.resize();
        } catch {
          unavailable(node);
        }
      }
    });
  });

  function unavailable(node: HTMLElement) {
    const playback = instances.get(node);
    instances.delete(node);
    resizeObserver.unobserve(node);
    node.dataset.playing = 'false';
    if (node.dataset.state !== 'unavailable') {
      node.dataset.state = 'unavailable';
      node.setAttribute(
        'aria-label',
        `${node.getAttribute('aria-label') || 'WizardLoop artwork'}. Motion unavailable; showing a still preview.`,
      );
    }
    playback?.animation.destroy();
    reconcile();
  }

  function tick(now: number) {
    request = 0;
    if (!allowed() || disposed) return;
    // One bounded draw loop for all art. Elapsed time preserves the source speed.
    if (now - lastTick >= 1000 / 24) {
      lastTick = now - ((now - lastTick) % (1000 / 24));
      instances.forEach((playback, node) => {
        if (!playback.running || !playback.ready) return;
        const elapsed =
          (playback.elapsed + now - playback.started) % playback.duration;
        const frame = Math.floor((elapsed * playback.fps) / 1000);
        if (frame !== playback.lastFrame) {
          try {
            playback.animation.goToAndStop(frame, true);
            playback.lastFrame = frame;
          } catch {
            unavailable(node);
          }
        }
      });
    }
    if (
      !request &&
      [...instances.values()].some((playback) => playback.running)
    )
      request = requestAnimationFrame(tick);
  }

  function loadAsset(name: string): Promise<MotionData> {
    const cached = assets.get(name);
    if (cached) return cached;
    const pending = (async () => {
      const response = await fetch(`/media/animations/${name}.tgs`, {
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok || !response.body)
        throw new Error('Animation unavailable');
      const data = await new Response(
        response.body.pipeThrough(new DecompressionStream('gzip')),
      ).json();
      if (
        !data ||
        ![data.fr, data.ip, data.op].every(Number.isFinite) ||
        data.fr <= 0 ||
        data.op <= data.ip
      )
        throw new Error('Invalid animation timing');
      return data as MotionData;
    })();
    assets.set(name, pending);
    void pending.catch(() => {
      if (assets.get(name) === pending) assets.delete(name);
    });
    return pending;
  }

  async function mount(node: HTMLElement) {
    if (
      instances.has(node) ||
      loading.has(node) ||
      node.dataset.state === 'unavailable' ||
      !allowed() ||
      !visible.has(node) ||
      disposed
    )
      return;
    const name = node.dataset.animation;
    if (
      !name ||
      !/^[a-z0-9-]+$/.test(name) ||
      !('DecompressionStream' in window)
    ) {
      unavailable(node);
      return;
    }
    loading.add(node);
    try {
      const [data, { default: lottie }] = await Promise.all([
        loadAsset(name),
        (renderer ||= import('lottie-web/build/player/lottie_light_canvas')),
      ]);
      if (disposed || !allowed() || !visible.has(node)) return;
      const container = node.querySelector<HTMLElement>('.art-player');
      if (!container) return;
      const size = Math.max(node.clientWidth, node.clientHeight, 1);
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        name.startsWith('flag-') ? 1 : 1.5,
        768 / size,
      );
      const animation = lottie.loadAnimation({
        container,
        renderer: 'canvas',
        loop: true,
        autoplay: false,
        // Lottie mutates animation data; each view needs an independent copy.
        animationData: structuredClone(data),
        rendererSettings: {
          dpr,
          clearCanvas: true,
          preserveAspectRatio: 'xMidYMid meet',
        },
      });
      animation.setSubframe(false);
      const playback: Playback = {
        animation,
        ready: false,
        running: false,
        started: 0,
        elapsed: 0,
        lastFrame: -1,
        fps: data.fr,
        duration: ((data.op - data.ip) / data.fr) * 1000,
      };
      instances.set(node, playback);
      resizeObserver.observe(node);
      animation.addEventListener('DOMLoaded', () => {
        if (disposed || !instances.has(node)) return;
        playback.ready = true;
        animation.goToAndStop(0, true);
        if (!instances.has(node)) return;
        node.dataset.state = 'ready';
        reconcile();
      });
      animation.addEventListener('data_failed', () => unavailable(node));
      animation.addEventListener('error', () => unavailable(node));
    } catch {
      if (!disposed) unavailable(node);
    } finally {
      loading.delete(node);
    }
  }

  function reconcile() {
    const active = new Set(
      allowed() && !disposed
        ? [...visible]
            .filter((node) => node.dataset.state !== 'unavailable')
            .slice(0, 3)
        : [],
    );
    const now = performance.now();
    instances.forEach((playback, node) => {
      const running = active.has(node) && playback.ready;
      if (running && !playback.running) playback.started = now;
      if (!running && playback.running)
        playback.elapsed =
          (playback.elapsed + now - playback.started) % playback.duration;
      playback.running = running;
      node.dataset.playing = String(running);
    });
    if (
      !request &&
      [...instances.values()].some((playback) => playback.running)
    )
      request = requestAnimationFrame(tick);
    active.forEach((node) => {
      void mount(node);
    });
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.12)
          visible.add(entry.target as HTMLElement);
        else visible.delete(entry.target as HTMLElement);
      });
      reconcile();
    },
    { threshold: 0.12 },
  );
  nodes.forEach((node) => observer.observe(node));
  document.addEventListener('wizardloop:preferences', reconcile);
  document.addEventListener('visibilitychange', reconcile);
  window.addEventListener('pagehide', () => {
    disposed = true;
    observer.disconnect();
    resizeObserver.disconnect();
    cancelAnimationFrame(request);
    request = 0;
    instances.forEach((playback, node) => {
      playback.animation.destroy();
      node.dataset.state = 'poster';
      node.dataset.playing = 'false';
    });
    instances.clear();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      disposed = false;
      nodes.forEach((node) => observer.observe(node));
      reconcile();
    }
  });
}
