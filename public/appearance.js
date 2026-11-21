(() => {
  const palettes = window.workoutPalettes;
  const defaults = { palette: 'a', mode: 'light', textSize: 'default' };
  const cacheKey = 'workout-appearance';
  let version = 0;
  function apply(value, remember = false) {
    if (!value || typeof value.palette !== 'string' || !Object.hasOwn(palettes, value.palette) || !['light', 'dark'].includes(value.mode)) return;
    const textSize = ['default', 'large', 'extra-large'].includes(value.textSize) ? value.textSize : 'default';
    document.documentElement.dataset.textSize = textSize;
    document.documentElement.dataset.palette = value.palette;
    document.documentElement.dataset.mode = value.mode;
    if (remember) {
      try { localStorage.setItem(cacheKey, JSON.stringify({ ...value, textSize })); } catch { /* Account saving still works without browser storage. */ }
    }
  }
  async function load() {
    const active = ++version;
    try {
      const response = await fetch('/api/settings', { credentials: 'same-origin' });
      if (!response.ok) return;
      const settings = await response.json();
      if (active === version) apply(settings.appearance, true);
    } catch { /* Keep the cached appearance when the network is unavailable. */ }
  }
  function reset() {
    version++;
    apply(defaults);
    try { localStorage.removeItem(cacheKey); } catch { /* Storage may be disabled. */ }
  }
  apply(defaults);
  try { apply(JSON.parse(localStorage.getItem(cacheKey))); } catch { /* Ignore invalid or unavailable cache. */ }
  window.appAppearance = { palettes, apply, load, reset };
})();
