(function () {
  var root = document.documentElement;
  var theme = 'light';
  var motion = 'running';
  try {
    theme =
      localStorage.getItem('wizardloop-theme') ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    motion = localStorage.getItem('wizardloop-motion') || motion;
  } catch (_) {}
  root.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  root.dataset.motion =
    matchMedia('(prefers-reduced-motion: reduce)').matches ||
    motion === 'paused'
      ? 'paused'
      : 'running';
})();
