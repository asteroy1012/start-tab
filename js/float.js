// The floating Spotify player: a small draggable remote added to every web page.
// It only draws itself; it never reads the page. All Spotify calls go through js/background.js,
// so the page (and this script) never see the sign-in tokens.
(() => {
  if (window.top !== window || !(document.documentElement instanceof HTMLElement)) return;
  if (window.__startFloat) return;
  window.__startFloat = true;

  const SVG = 'http://www.w3.org/2000/svg';
  const ICONS = {
    prev: ['M6 5v14M18 6l-9 6 9 6z'],
    next: ['M18 5v14M6 6l9 6-9 6z'],
    play: ['M8 5.5v13l10.5-6.5z'],
    pause: ['M8 5v14M16 5v14'],
    heart: ['M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
    x: ['M6 6l12 12M18 6 6 18'],
    note: ['M9 18V5l11-2v13', 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', 'M20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  };

  // Styles are attached as a constructed stylesheet, which a page's content rules can't block,
  // and everything is built with DOM calls (no innerHTML) so strict pages don't reject it.
  const CSS = `
    :host { all: initial; position: fixed; z-index: 2147483647; right: 20px; bottom: 20px; display: none; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    [hidden] { display: none !important; }
    .card {
      --bg: #161616; --raised: #2a2a2a; --text: #fff; --muted: #b4b4b4; --accent: #1db954; --on-accent: #000;
      position: relative; display: flex; align-items: center; gap: 10px; width: 312px; padding: 8px 10px 10px 8px;
      border-radius: 16px; background: var(--bg); color: var(--text); overflow: hidden;
      font: 13px/18px system-ui, -apple-system, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased;
      box-shadow: 0 10px 32px rgba(0, 0, 0, .4), 0 0 0 1px rgba(255, 255, 255, .08);
      cursor: grab; user-select: none; touch-action: none;
      opacity: .94; transition: opacity .15s;
    }
    .card:hover, .card:focus-within { opacity: 1; }
    .card.dragging { cursor: grabbing; }
    .art {
      position: relative; width: 40px; height: 40px; flex: none; border-radius: 8px; overflow: hidden;
      display: grid; place-items: center; background: var(--accent); color: var(--on-accent); cursor: pointer;
    }
    .art canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
    .meta { flex: 1; min-width: 0; }
    .meta b, .meta small { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .meta b { font-weight: 600; font-size: 13px; }
    .meta small { font-size: 12px; line-height: 16px; color: var(--muted); }
    .ctrls { display: flex; align-items: center; gap: 2px; flex: none; }
    button {
      all: unset; box-sizing: border-box; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center;
      color: var(--muted); cursor: pointer; transition: color .15s, background-color .15s, transform .15s;
    }
    button:hover { color: var(--text); background: var(--raised); }
    button:active { transform: scale(.92); }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    button:disabled { opacity: .4; pointer-events: none; }
    button.play { width: 34px; height: 34px; background: var(--text); color: var(--bg); }
    button.play:hover { background: var(--text); color: var(--bg); transform: scale(1.06); }
    button.like[aria-pressed="true"] { color: var(--accent); }
    button.like[aria-pressed="true"] svg { fill: currentColor; }
    button.close {
      position: absolute; top: 3px; right: 3px; width: 18px; height: 18px; background: var(--raised); color: var(--text);
      opacity: 0; transition: opacity .15s;
    }
    .card:hover button.close, button.close:focus-visible { opacity: 1; }
    button.close svg { width: 10px; height: 10px; stroke-width: 2.4; }
    svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    svg.solid { fill: currentColor; }
    .art svg { width: 18px; height: 18px; }
    .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--raised); }
    .bar i { display: block; height: 100%; width: 0; background: var(--accent); transition: width 1s linear; }
    .card[data-idle] .bar, .card[data-idle] .like { display: none; }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
  `;

  function icon(name) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    setIcon(svg, name);
    return svg;
  }
  function setIcon(svg, name) {
    svg.replaceChildren(...ICONS[name].map(d => {
      const p = document.createElementNS(SVG, 'path');
      p.setAttribute('d', d);
      return p;
    }));
    svg.classList.toggle('solid', name === 'play');
  }
  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text) n.textContent = text;
    return n;
  }
  function button(className, label, iconName, onClick) {
    const b = el('button', className);
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.append(icon(iconName));
    b.addEventListener('click', e => { e.stopPropagation(); onClick(); });
    return b;
  }

  /* ---------- talking to the background script ---------- */
  let dead = false; // the extension was reloaded or removed: this copy of the script can't reach it any more
  function send(type, extra) {
    return new Promise(resolve => {
      if (dead) return resolve({ ok: false, code: 'gone' });
      try {
        chrome.runtime.sendMessage({ type, ...extra }, res => {
          if (chrome.runtime.lastError || !res) resolve({ ok: false, code: 'api' });
          else resolve(res);
        });
      } catch {
        destroy();
        resolve({ ok: false, code: 'gone' });
      }
    });
  }

  /* ---------- state ---------- */
  let ui = null;            // built the first time there is something to show
  let globalOn = true;      // Settings → Floating player
  let windowOn = true;      // the toolbar button, per window
  let connected = false;
  let current = null;       // the playing song, or null
  let saved = null, canLike = false;
  let pos = { right: 20, bottom: 20 };
  let theme = null;
  let pollTimer = null, progressTimer = null, artUrl = null;

  const wanted = () => globalOn && windowOn && connected && !document.fullscreenElement;

  function build() {
    const host = document.createElement('start-float');
    const root = host.attachShadow({ mode: 'closed' });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];

    const card = el('div', 'card');
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', 'Spotify');

    const art = el('div', 'art');
    art.title = 'Open in Spotify';
    const artIcon = icon('note');
    const canvas = el('canvas');
    canvas.width = canvas.height = 80;
    canvas.hidden = true;
    art.append(artIcon, canvas);
    art.addEventListener('click', () => { if (current && current.url && !moved) window.open(current.url, '_blank', 'noopener'); });

    const meta = el('div', 'meta');
    const title = el('b'), sub = el('small');
    meta.append(title, sub);

    const ctrls = el('div', 'ctrls');
    const prev = button('', 'Previous track', 'prev', () => command('float:previous'));
    const play = button('play', 'Play', 'play', togglePlay);
    const next = button('', 'Next track', 'next', () => command('float:next'));
    const like = button('like', 'Save to your library', 'heart', toggleLike);
    like.setAttribute('aria-pressed', 'false');
    ctrls.append(prev, play, next, like);

    const close = button('close', 'Hide in this window (the Start toolbar button brings it back)', 'x', () => {
      windowOn = false;
      update();
      send('float:hide');
    });

    const bar = el('div', 'bar');
    const fill = el('i');
    bar.append(fill);

    card.append(art, meta, ctrls, close, bar);
    root.append(card);
    document.documentElement.append(host);

    /* drag it anywhere; the spot is remembered and shared by every tab */
    let moved = false;
    card.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const start = { x: e.clientX, y: e.clientY, right: pos.right, bottom: pos.bottom };
      moved = false;
      card.setPointerCapture(e.pointerId);
      const move = ev => {
        const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moved = true;
        card.classList.add('dragging');
        pos = { right: start.right - dx, bottom: start.bottom - dy };
        place();
      };
      const end = () => {
        card.removeEventListener('pointermove', move);
        card.removeEventListener('pointerup', end);
        card.removeEventListener('pointercancel', end);
        card.classList.remove('dragging');
        if (moved) {
          try { chrome.storage.local.set({ 'float.pos': pos }); } catch { destroy(); }
          setTimeout(() => { moved = false; }, 0); // let the click that ends a drag pass without opening Spotify
        }
      };
      card.addEventListener('pointermove', move);
      card.addEventListener('pointerup', end);
      card.addEventListener('pointercancel', end);
    });

    ui = { host, card, art, artIcon, canvas, title, sub, prev, play, next, like, fill };
    applyTheme();
    place();
  }

  // Keeps the player fully inside the window, whatever position was saved.
  function place() {
    if (!ui) return;
    const w = ui.card.offsetWidth || 312, h = ui.card.offsetHeight || 58;
    const maxRight = Math.max(8, window.innerWidth - w - 8), maxBottom = Math.max(8, window.innerHeight - h - 8);
    pos = {
      right: Math.round(Math.min(maxRight, Math.max(8, pos.right))),
      bottom: Math.round(Math.min(maxBottom, Math.max(8, pos.bottom))),
    };
    ui.host.style.right = `${pos.right}px`;
    ui.host.style.bottom = `${pos.bottom}px`;
  }

  // The colours follow the poster on the new tab page.
  function applyTheme() {
    if (!ui || !theme) return;
    const s = ui.card.style;
    const set = (name, value) => { if (typeof value === 'string' && value.length < 60) s.setProperty(name, value); };
    set('--bg', theme.surface);
    set('--raised', theme.raised);
    set('--text', theme.text);
    set('--muted', theme.muted);
    set('--accent', theme.accent);
    set('--on-accent', theme.onAccent);
  }

  function update() {
    const show = wanted();
    if (show && !ui) build();
    if (ui) ui.host.style.display = show ? 'block' : 'none';
    clearInterval(progressTimer);
    if (!show) { clearTimeout(pollTimer); if (globalOn && windowOn && !dead) schedule(connected ? 5000 : 60000); return; }
    render();
    place();
    if (current && current.playing) progressTimer = setInterval(drawProgress, 1000);
  }

  function setPlaying(playing) {
    ui.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    ui.play.title = playing ? 'Pause' : 'Play';
    setIcon(ui.play.firstChild, playing ? 'pause' : 'play');
  }

  function drawProgress() {
    if (!ui || !current || !current.duration) return;
    const p = Math.min(current.duration, current.progress + (current.playing ? Date.now() - current.at : 0));
    ui.fill.style.width = `${(p / current.duration) * 100}%`;
    if (current.playing && p >= current.duration) schedule(800);
  }

  function render() {
    if (!ui) return;
    ui.card.toggleAttribute('data-idle', !current);
    ui.prev.disabled = ui.next.disabled = !current;
    if (!current) {
      ui.title.textContent = 'Nothing playing';
      ui.sub.textContent = 'Press play to resume';
      setPlaying(false);
      showArt(null);
      return;
    }
    ui.title.textContent = current.title;
    ui.sub.textContent = current.artist || (current.device ? `on ${current.device}` : '');
    ui.title.title = current.title;
    ui.sub.title = [current.artist, current.device && `Playing on ${current.device}`].filter(Boolean).join(' · ');
    setPlaying(current.playing);
    ui.like.hidden = !current.uri;
    ui.like.setAttribute('aria-pressed', String(!!saved));
    ui.like.title = saved ? 'Saved to your library' : 'Save to your library';
    ui.like.setAttribute('aria-label', saved ? 'Remove from your library' : 'Save to your library');
    drawProgress();
    showArt(current.artSmall || current.art || null);
  }

  // The picture arrives as bytes from the background script and is painted on a canvas,
  // so it shows even on pages that block outside images.
  async function showArt(url) {
    if (url === artUrl) return;
    artUrl = url;
    ui.canvas.hidden = true;
    if (!url) return;
    const res = await send('float:art', { url });
    if (!res.ok || url !== artUrl || !ui) return;
    try {
      const bin = atob(res.data.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const bmp = await createImageBitmap(new Blob([bytes], { type: res.data.mime }));
      if (url !== artUrl) return;
      const side = Math.min(bmp.width, bmp.height);
      ui.canvas.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 80, 80);
      ui.canvas.hidden = false;
    } catch { /* keep the note icon */ }
  }

  /* ---------- polling: only the tab you're looking at asks Spotify ---------- */
  function schedule(ms) {
    clearTimeout(pollTimer);
    if (dead || document.visibilityState !== 'visible' || !globalOn || !windowOn) return;
    pollTimer = setTimeout(poll, ms);
  }

  async function poll() {
    if (dead || !globalOn || !windowOn) return;
    const res = await send('float:state');
    if (dead) return;
    if (res.ok) {
      connected = !!res.data.connected;
      const s = res.data.state;
      current = connected && s && !s.idle ? s : null;
      if (current) current.at = Date.now(); // the reply took a moment; count progress from now
      saved = res.data.saved;
      canLike = !!res.data.canLike;
      update();
      schedule(!connected ? 60000 : current && current.playing ? 5000 : 15000);
    } else if (res.code === 'auth' || res.code === 'premium') {
      connected = false;
      update();
      schedule(60000);
    } else {
      schedule(30000); // Spotify or the network hiccuped: keep what's shown and try again
    }
  }

  async function command(type, extra) {
    const res = await send(type, extra);
    if (!res.ok && (res.code === 'auth' || res.code === 'premium')) { connected = false; update(); }
    schedule(600);
    return res;
  }

  function togglePlay() {
    const playing = !!(current && current.playing);
    if (current) {
      current.progress = Math.min(current.duration, current.progress + (playing ? Date.now() - current.at : 0));
      current.at = Date.now();
      current.playing = !playing;
    }
    setPlaying(!playing);
    clearInterval(progressTimer);
    if (current && current.playing) progressTimer = setInterval(drawProgress, 1000);
    command(playing ? 'float:pause' : 'float:play');
  }

  async function toggleLike() {
    if (!current || !current.uri) return;
    if (!canLike) { ui.like.title = 'Open a new tab → Settings → Reconnect Spotify to allow saving'; return; }
    const uri = current.uri, was = !!saved;
    saved = !was;
    render();
    const res = await command('float:like', { uri, save: !was });
    if (!res.ok && current && current.uri === uri) { saved = was; render(); }
  }

  /* ---------- lifecycle ---------- */
  function destroy() {
    dead = true;
    clearTimeout(pollTimer);
    clearInterval(progressTimer);
    if (ui) ui.host.remove();
    ui = null;
    window.__startFloat = false;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') poll();
    else { clearTimeout(pollTimer); clearInterval(progressTimer); }
  });
  document.addEventListener('fullscreenchange', update);
  window.addEventListener('resize', place);

  try {
    chrome.runtime.onMessage.addListener(msg => {
      if (msg && msg.type === 'float:set') {
        windowOn = !!msg.enabled;
        if (windowOn) poll(); else update();
      }
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.settings) {
        globalOn = !changes.settings.newValue || changes.settings.newValue.float !== 'off';
        if (globalOn) poll(); else update();
      }
      if (changes['float.pos'] && changes['float.pos'].newValue) { pos = changes['float.pos'].newValue; place(); }
      if (changes['theme.last']) { theme = changes['theme.last'].newValue || null; applyTheme(); }
      if (changes['spotify.auth'] && document.visibilityState === 'visible') poll();
    });

    chrome.storage.local.get(['settings', 'float.pos', 'theme.last'], async stored => {
      if (chrome.runtime.lastError) return;
      globalOn = !stored.settings || stored.settings.float !== 'off';
      if (stored['float.pos']) pos = stored['float.pos'];
      theme = stored['theme.last'] || null;
      const status = await send('float:status');
      windowOn = !status.ok || status.data.enabled !== false;
      if (document.visibilityState === 'visible') poll();
    });
  } catch {
    destroy();
  }
})();
