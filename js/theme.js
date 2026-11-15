// Reads a poster and derives the page's colours from it:
//   ground  = the poster's own left edge (the side that meets the page), so page and print read as one sheet
//   accent  = the poster's most present saturated hue, used on the progress bar and focus rings
const Theme = (() => {
  const rgbToHsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
  };

  const hsl = (h, s, l) => `hsl(${h.toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%)`;

  // Every poster hangs in a 2:3 frame (css/style.css, --poster-ratio) and is trimmed evenly to fit,
  // so only the part that shows is read: its left edge is the one that meets the page.
  const FRAME = 2 / 3;

  function analyse(img) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    let sx = 0, sy = 0, sw = iw, sh = ih;
    if (iw / ih > FRAME) { sw = ih * FRAME; sx = (iw - sw) / 2; } else { sh = iw / FRAME; sy = (ih - sh) / 2; }
    const w = 64;
    const h = Math.round(w / FRAME);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;

    // Left edge: average of the two outermost columns.
    let er = 0, eg = 0, eb = 0, n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < 2; x++) {
        const i = (y * w + x) * 4;
        er += px[i]; eg += px[i + 1]; eb += px[i + 2]; n++;
      }
    }
    const [eh, es, el] = rgbToHsl(er / n, eg / n, eb / n);

    // Accent: the hue bin with the most saturated weight.
    const bins = new Array(24).fill(0).map(() => ({ w: 0, h: 0, s: 0 }));
    let total = 0;
    for (let i = 0; i < px.length; i += 4) {
      const [ph, ps, pl] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
      total++;
      if (ps < 0.3 || pl < 0.18 || pl > 0.85) continue;
      const b = bins[Math.floor(ph / 15) % 24];
      const wgt = ps * (1 - Math.abs(pl - 0.5));
      b.w += wgt; b.h += ph * wgt; b.s += ps * wgt;
    }
    const best = bins.reduce((a, b) => (b.w > a.w ? b : a));

    const light = el > 0.82;
    const t = {};
    if (light) {
      const s = Math.min(es, 0.4);
      t.mode = 'light';
      t.ground = hsl(eh, s, el);
      t.surface = hsl(eh, s, el - 0.05);
      t.raised = hsl(eh, s, el - 0.11);
      t.text = '#141414'; t.muted = hsl(eh, 0.08, 0.3); t.faint = hsl(eh, 0.08, 0.38);
    } else {
      const s = Math.min(es, 0.45);
      const l = Math.min(el, 0.06);
      t.mode = 'dark';
      t.ground = hsl(eh, s, l);
      t.surface = hsl(eh, s, l + 0.05);
      t.raised = hsl(eh, s, l + 0.13);
      t.text = '#ffffff'; t.muted = '#b4b4b4'; t.faint = '#949494';
    }

    if (best.w / total > 0.01) {
      const ah = best.h / best.w;
      const as = Math.min(0.85, Math.max(0.5, best.s / best.w));
      t.accent = hsl(ah, as, light ? 0.42 : 0.56);
    } else {
      t.accent = light ? '#1a1a1a' : '#e8e8e8';
    }
    t.onAccent = light ? '#ffffff' : '#000000';
    return t;
  }

  function apply(t) {
    if (!t) return;
    const root = document.documentElement.style;
    for (const [k, v] of Object.entries(t)) {
      if (k === 'mode') continue;
      root.setProperty('--' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), v);
    }
    document.documentElement.dataset.theme = t.mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.ground);
  }

  return { analyse, apply };
})();
