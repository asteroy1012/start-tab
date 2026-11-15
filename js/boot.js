// Paint the last poster's colours (and how see-through the left side is) before anything else,
// so a new tab never flashes the wrong ground.
Theme.apply(FastCache.get('theme.last'));
(() => {
  const veil = FastCache.get('veil');
  if (typeof veil === 'number' && veil < 100) {
    document.documentElement.style.setProperty('--veil', `${veil}%`);
    document.documentElement.setAttribute('data-see-through', '');
  }
})();
