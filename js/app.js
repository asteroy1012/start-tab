// Start — wires the page together: clock, quote, search, apps, wallpapers, Spotify and settings.
(() => {
  const $ = sel => document.querySelector(sel);
  const DEFAULTS = {
    rotate: 'daily', clock: '24', folder: 'Dashboard', float: 'on', quotes: 'online',
    source: null, themes: Discover.DEFAULT_THEMES, customThemes: [], veil: 100,
  };
  const MAX_APPS = 11; // plus the Add tile: three rows of four
  const PARAMS = new URLSearchParams(location.search);
  const DEMO = PARAMS.has('demo');

  // Pictures dropped into wallpapers/ and listed in wallpapers/index.json ship with this copy of the
  // extension. The folder is kept out of git, so every install starts with its owner's own pictures.
  let bundled = [];
  async function loadBundled() {
    try {
      const res = await fetch('wallpapers/index.json');
      const list = res.ok ? await res.json() : [];
      bundled = list.map(w => ({ id: w.file.replace(/\.[^.]+$/, ''), name: w.name || w.file, src: `wallpapers/${w.file}`, bundled: true }));
    } catch {
      bundled = [];
    }
  }

  let settings = { ...DEFAULTS };
  let ownQuotes = [];
  let wallpapers = [];
  let currentWallpaper = null;
  let appsFolderId = null;

  const dayNumber = (d = new Date()) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  const todayKey = () => new Date().toDateString();
  const isTyping = e => !!(e.target.closest && e.target.closest('input, textarea, select, [contenteditable]'));

  function toast(text, ms = 3200) {
    document.querySelector('.toast')?.remove();
    const el = Object.assign(document.createElement('div'), { className: 'toast', textContent: text, role: 'status' });
    document.body.append(el);
    setTimeout(() => el.remove(), ms);
  }

  async function saveSettings(patch) {
    settings = { ...settings, ...patch };
    await Store.set('settings', settings);
  }

  /* ---------- clock, date and quote ---------- */
  let lastDay = null;
  function tick() {
    const now = new Date();
    const h = now.getHours(), m = String(now.getMinutes()).padStart(2, '0');
    const clock = $('#clock');
    if (settings.clock === '12') {
      clock.textContent = `${h % 12 || 12}:${m}`;
      clock.setAttribute('aria-label', `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`);
    } else {
      clock.textContent = `${String(h).padStart(2, '0')}:${m}`;
      clock.removeAttribute('aria-label');
    }
    const ampm = settings.clock === '12' ? (h < 12 ? ' · AM' : ' · PM') : '';
    $('#date').textContent = DATE_FORMAT.format(now) + ampm;
    const day = dayNumber(now);
    if (day !== lastDay) {
      const first = lastDay === null;
      lastDay = day;
      renderQuote(dailyQuote(now), true);
      if (!first) refreshOnlineQuotes(); // past midnight: fetch the new day's batch
    }
  }
  const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  function startClock() {
    tick();
    setTimeout(() => { tick(); setInterval(tick, 1000); }, 1000 - (Date.now() % 1000));
  }

  // Quotes come from today's ZenQuotes batch (js/zenquotes.js) when online quotes are on and the batch
  // is in; otherwise from the built-in list. Your own quotes join either way.
  const onlineQuotes = () => (settings.quotes !== 'local' && ZenQuotes.list()) || null;

  function dailyQuote(date = new Date()) {
    const online = onlineQuotes();
    if (!online) return quoteForDay(date, ownQuotes);
    const pool = [...online.map(([text, author]) => ({ text, author, source: 'zenquotes' })),
      ...ownQuotes.filter(q => Array.isArray(q) && q[0]).map(([text, author = '']) => ({ text, author }))];
    return pool[dayNumber(date) % pool.length]; // the same quote in every tab all day
  }

  function anotherQuote() {
    const pool = [...(onlineQuotes() || []).map(([text, author]) => ({ text, author, source: 'zenquotes' })),
      ...quotePool(ownQuotes).map(([text, author = '']) => ({ text, author }))];
    let q = pool[Math.floor(Math.random() * pool.length)];
    if (pool.length > 1 && q.text === shownQuote) q = pool[(pool.indexOf(q) + 1) % pool.length];
    return q;
  }

  let shownQuote = null;
  let showingDaily = true;
  function renderQuote(q, daily) {
    shownQuote = q.text;
    showingDaily = daily;
    $('#quote-text').textContent = q.text;
    $('#quote-author').textContent = q.author;
    $('#quote-author').hidden = $('#quote-sep').hidden = !q.author;
    $('#quote-kind').textContent = daily ? 'today’s quote' : 'another quote';
    $('#quote-credit').hidden = $('#quote-credit-sep').hidden = q.source !== 'zenquotes';
    $('#quote').dataset.length = q.text.length > 62 ? 'long' : 'short';
  }

  // Fetches today's batch in the background; once it arrives, it replaces the built-in quote
  // unless you have shuffled to another one.
  async function refreshOnlineQuotes() {
    if (settings.quotes === 'local' || DEMO) return;
    if (await ZenQuotes.refresh() && showingDaily) renderQuote(dailyQuote(), true);
  }

  function initQuotes() {
    $('#quote-next').addEventListener('click', () => renderQuote(anotherQuote(), false));
    $('#quotes-own').addEventListener('change', async e => {
      ownQuotes = parseQuotes(e.target.value);
      await Store.set('quotes.own', ownQuotes);
      e.target.value = formatQuotes(ownQuotes);
      renderQuote(dailyQuote(), true);
    });
    document.querySelectorAll('input[name="quotesrc"]').forEach(r => r.addEventListener('change', async () => {
      await saveSettings({ quotes: r.value });
      renderQuote(dailyQuote(), true);
      refreshOnlineQuotes();
    }));
  }

  /* ---------- search ---------- */
  // A file name like "node.js" or a number like "3.14" is a search, not an address.
  const FILE_LIKE = /\.(js|ts|jsx|tsx|py|rb|go|rs|java|cs|cpp|md|txt|json|yml|yaml|toml|css|html?|sh|exe|dll|zip|pdf|png|jpe?g|gif|svg)$/i;
  function looksLikeUrl(s) {
    if (/\s/.test(s)) return false;
    if (/^[a-z][\w+.-]*:\/\//i.test(s)) return true; // has a scheme
    if (/^(localhost|\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:]+\])(:\d+)?([/?#].*)?$/i.test(s)) return true; // local or IP
    const m = s.match(/^((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63})(:\d+)?([/?#].*)?$/i);
    if (!m) return false;
    return !(FILE_LIKE.test(m[1]) && m[1].split('.').length === 2 && !m[3]);
  }
  function normaliseUrl(s) {
    if (/^[a-z][\w+.-]*:\/\//i.test(s)) return s;
    const local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(s);
    return `${local ? 'http' : 'https'}://${s}`;
  }

  function initSearch() {
    const input = $('#q');
    $('#search').addEventListener('submit', e => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      if (looksLikeUrl(text)) location.href = normaliseUrl(text);
      else Platform.search(text);
    });
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !isTyping(e) && !document.querySelector('dialog[open]')) { e.preventDefault(); input.focus(); }
      if (e.key === 'Escape' && e.target === input) { input.value = ''; input.blur(); }
    });
  }

  /* ---------- apps (from Chrome bookmarks) ---------- */
  let dragFrom = null; // index of the app tile being dragged
  async function renderApps() {
    const box = $('#apps');
    let result;
    try { result = await Platform.apps(settings.folder || DEFAULTS.folder); }
    catch { result = { folderId: null, items: [] }; }
    appsFolderId = result.folderId;
    const items = result.items.slice(0, MAX_APPS);
    box.replaceChildren();

    items.forEach((b, i) => {
      const a = document.createElement('a');
      a.className = 'app';
      a.href = b.url;
      a.title = b.title || b.url;
      a.draggable = true;
      const img = new Image(28, 28);
      img.alt = ''; img.loading = 'eager'; img.draggable = false;
      img.src = Platform.favicon(b.url);
      const label = document.createElement('span');
      let host = b.url;
      try { host = new URL(b.url).hostname.replace(/^www\./, ''); } catch { /* keep the raw URL */ }
      label.textContent = b.title || host;
      a.append(img, label);
      if (i < 9) {
        const k = document.createElement('kbd');
        k.textContent = `Alt ${i + 1}`;
        a.append(k);
      }

      // Drag a tile onto another to move it there; the bookmark itself moves, so Chrome stays in step.
      a.addEventListener('dragstart', e => {
        dragFrom = i;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-start-app', String(i));
        a.classList.add('dragging');
      });
      a.addEventListener('dragend', () => {
        dragFrom = null;
        box.querySelectorAll('.dragging, .drop-before, .drop-after').forEach(n => n.classList.remove('dragging', 'drop-before', 'drop-after'));
      });
      a.addEventListener('dragover', e => {
        if (dragFrom === null || dragFrom === i) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        a.classList.add(dragFrom < i ? 'drop-after' : 'drop-before');
      });
      a.addEventListener('dragleave', () => a.classList.remove('drop-before', 'drop-after'));
      a.addEventListener('drop', async e => {
        if (dragFrom === null || dragFrom === i) return;
        e.preventDefault();
        const from = items[dragFrom];
        const after = dragFrom < i;
        dragFrom = null;
        try {
          await Platform.moveApp(from, b, after);
          await renderApps();
        } catch { toast('Couldn’t move that bookmark'); }
      });
      box.append(a);
    });

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'app add';
    add.innerHTML = '<svg class="i" aria-hidden="true"><use href="#i-plus"/></svg><span>Add</span>';
    add.addEventListener('click', openAddApp);
    box.append(add);
  }

  function initAppKeys() {
    const box = $('#apps');
    document.addEventListener('keydown', e => {
      if (e.key === 'Alt') box.classList.add('show-keys');
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const link = box.querySelectorAll('a.app')[Number(e.key) - 1];
        if (link) { e.preventDefault(); location.href = link.href; }
      }
    });
    const hide = () => box.classList.remove('show-keys');
    document.addEventListener('keyup', e => { if (e.key === 'Alt') hide(); });
    window.addEventListener('blur', hide);

    $('#apps-edit').addEventListener('click', () => {
      if (Platform.isExtension) Platform.openBookmarkManager(appsFolderId);
      else toast('Opens Chrome’s bookmark manager once installed');
    });
    Platform.onBookmarksChanged(() => renderApps());
  }

  function openAddApp() {
    const dlg = $('#add-app');
    $('#add-form').reset();
    $('#add-where').textContent = `Saved to your “${settings.folder || DEFAULTS.folder}” bookmarks folder.`;
    dlg.showModal();
    $('#add-name').focus();
  }
  function initAddApp() {
    const dlg = $('#add-app');
    dlg.addEventListener('close', async () => {
      if (dlg.returnValue !== 'add') return;
      const name = $('#add-name').value.trim();
      const raw = $('#add-url').value.trim();
      if (!name || !raw) return;
      try {
        await Platform.addApp(settings.folder || DEFAULTS.folder, name, normaliseUrl(raw));
        await renderApps();
      } catch { toast('Couldn’t add that bookmark'); }
    });
  }

  /* ---------- wallpapers and theme ---------- */
  // Your own pictures are stored one per key, with a small thumbnail beside each, so a new tab reads
  // only the list and the one picture it shows:
  //   wallpapers.index        [{ id, name }]
  //   wallpaper.img.<id>      the picture (JPEG data URL, at most 1800px tall)
  //   wallpaper.thumb.<id>    a 300px-tall thumbnail for Settings
  const IMG = id => `wallpaper.img.${id}`;
  const THUMB = id => `wallpaper.thumb.${id}`;
  const srcCache = new Map();

  async function srcOf(w) {
    if (w.src) return w.src;
    if (w.url) return w.url; // linked, not stored (Unsplash pictures)
    if (!srcCache.has(w.id)) srcCache.set(w.id, await Store.get(IMG(w.id), null));
    return srcCache.get(w.id);
  }
  async function thumbOf(w) {
    if (w.src) return w.src;
    if (w.thumb) return w.thumb;
    return (await Store.get(THUMB(w.id), null)) || srcOf(w);
  }

  // Earlier versions kept every picture in one 'wallpapers.custom' array. Split it up once.
  async function migrateWallpapers() {
    const old = await Store.get('wallpapers.custom', null);
    if (!Array.isArray(old) || await Store.get('wallpapers.migrated', false)) return;
    const index = await Store.get('wallpapers.index', []);
    for (const w of old) {
      if (!w || !w.src || index.some(x => x.id === w.id)) continue;
      await Store.set(IMG(w.id), w.src);
      try { await Store.set(THUMB(w.id), await scaleImage(w.src, 300, 0.8)); } catch { /* falls back to the picture */ }
      index.push({ id: w.id, name: w.name });
    }
    await Store.set('wallpapers.index', index);
    // The old array is left in place so the previous version still finds these pictures if you go back to it;
    // the flag stops this copy running again (which would bring back pictures deleted since).
    await Store.set('wallpapers.migrated', true);
  }

  // "Your collection": pictures shipped in wallpapers/, uploaded, or kept from Discover with the heart.
  async function loadWallpapers() {
    const custom = await Store.get('wallpapers.index', []);
    const hidden = await Store.get('wallpapers.hidden', []);
    wallpapers = [...bundled.filter(w => !hidden.includes(w.id)), ...custom.map(w => ({
      id: w.id, name: w.name, credit: w.credit || null,
      ...(w.url ? { url: w.url, thumb: w.thumb || w.url } : {}),
    }))];
  }

  async function chooseWallpaper() {
    if (settings.source === 'discover' && !PARAMS.get('wall')) {
      const pic = await chooseDiscover();
      if (pic) return pic;
    }
    return chooseFromCollection();
  }

  /* Discover: a picture from your themes, new each day or each tab */
  const discoverEntry = cur => ({
    id: `discover-${cur.meta.id}`, name: cur.meta.title || `Photo by ${cur.meta.author}`,
    url: cur.meta.url, credit: cur.meta, discover: true,
  });

  async function chooseDiscover() {
    if (!(await Discover.getKey())) return null; // no Unsplash key yet: show your collection meanwhile
    let cur = await Discover.current();
    const due = !cur || settings.rotate === 'tab' || cur.date !== todayKey();
    // A waiting picture makes this instant; without one, only wait on the network when there's nothing to show.
    if (due && (!cur || await Discover.isReady())) {
      const next = await Discover.advance(settings);
      if (next) cur = next;
    }
    return cur ? discoverEntry(cur) : null;
  }

  let stepping = false;
  async function discoverStep(dir) {
    if (stepping) return;
    stepping = true;
    const slow = setTimeout(() => toast(dir > 0 ? 'Finding a picture…' : 'Going back…', 15000), 400);
    let cur = null;
    try { cur = dir > 0 ? await Discover.advance(settings) : await Discover.back(); }
    catch { cur = null; }
    clearTimeout(slow);
    document.querySelector('.toast')?.remove();
    stepping = false;
    if (cur) showWallpaper(discoverEntry(cur));
    else if (dir < 0) toast('No earlier picture');
    else {
      const problem = await Discover.status();
      const code = problem && problem.code;
      toast(code === 'nokey' ? 'Add your Unsplash key in Settings → Wallpapers'
        : code === 'key' ? 'Unsplash didn’t accept your key. Check it in Settings → Wallpapers'
          : code === 'limit' ? 'Unsplash’s hourly limit is used up. New photos resume within the hour'
            : 'Couldn’t get a new photo. Check your connection, or try again in a few minutes');
    }
    Discover.prepare(settings);
  }

  const keptFor = w => w && w.credit && wallpapers.find(x => x.credit && x.credit.id === w.credit.id && !x.discover);

  // The heart: keep the picture on the wall in your collection (or let it go again).
  async function toggleKeep() {
    const w = currentWallpaper;
    if (!w || !w.discover) return;
    const kept = keptFor(w);
    try {
      if (kept) {
        await deleteStored(kept.id);
        toast('Removed from your collection');
      } else {
        await keepLinked(w);
        toast('Kept in your collection');
      }
    } catch { toast('Couldn’t save that picture'); }
    await loadWallpapers();
    renderDots();
    renderThumbs();
  }

  // Unsplash pictures stay linked rather than copied (their guidelines), so keeping one saves its link and credit.
  async function keepLinked(w) {
    const credit = cleanCredit(w.credit);
    const index = await Store.get('wallpapers.index', []);
    index.push({ id: `kept-${credit.id}`, name: w.name.slice(0, 140), url: credit.url, thumb: credit.thumb, credit });
    await Store.set('wallpapers.index', index);
  }

  async function notForMe() {
    const w = currentWallpaper;
    if (!w || !w.discover || stepping) return;
    await Discover.block(w.credit.id);
    discoverStep(1);
  }

  async function chooseFromCollection() {
    if (!wallpapers.length) return null;
    const asked = PARAMS.get('wall'); // newtab.html?wall=porsche
    if (asked && wallpapers.some(w => w.id === asked)) return wallpapers.find(w => w.id === asked);
    if (settings.rotate === 'tab') {
      const last = FastCache.get('wallpaper.last');
      const pool = wallpapers.length > 1 ? wallpapers.filter(w => w.id !== last) : wallpapers;
      return pool[Math.floor(Math.random() * pool.length)];
    }
    const pin = await Store.get('wallpaper.pin', null);
    if (pin && pin.date === todayKey()) {
      const pinned = wallpapers.find(w => w.id === pin.id);
      if (pinned) return pinned;
    }
    return wallpapers[dayNumber() % wallpapers.length];
  }

  let showToken = 0;
  async function showWallpaper(w) {
    const token = ++showToken;
    currentWallpaper = w || null;
    $('.poster-wrap').toggleAttribute('data-empty', !w);
    renderDots();
    renderThumbs();
    const img = $('#poster'), back = $('#backdrop');
    if (!w) { img.removeAttribute('src'); back.removeAttribute('src'); back.classList.remove('ready'); return; }
    FastCache.set('wallpaper.last', w.id);
    img.classList.remove('ready');
    img.alt = w.name;
    const src = await srcOf(w);
    if (token !== showToken) return; // another picture was asked for meanwhile
    if (!src) { toast(`Couldn’t load ${w.name}`); return; }
    img.onload = () => {
      // Discover pictures change too often to be worth remembering; your own are analysed once.
      const key = w.discover ? null : `theme.v1.${w.id}`;
      let t = key && FastCache.get(key);
      if (!t) {
        try { t = Theme.analyse(img); if (key) FastCache.set(key, t); } catch { t = null; }
      }
      if (t) {
        Theme.apply(t);
        FastCache.set('theme.last', t);
        Store.set('theme.last', t); // the floating player on other pages takes its colours from here
      }
      img.classList.add('ready');
    };
    img.src = src;
    back.onload = () => back.classList.add('ready');
    back.classList.remove('ready');
    back.src = src;
    if (w.discover) Discover.prepare(settings); // get the next one ready in the background
  }

  async function pinWallpaper(w) {
    showWallpaper(w);
    await Store.set('wallpaper.pin', { date: todayKey(), id: w.id });
  }

  function step(dir) {
    if (currentWallpaper?.discover) return discoverStep(dir);
    if (wallpapers.length < 2) return;
    const i = wallpapers.findIndex(w => w.id === currentWallpaper?.id);
    pinWallpaper(wallpapers[(i + dir + wallpapers.length) % wallpapers.length]);
  }

  // The controls on the poster: dots for your collection; keep, not-for-me and the credit for Discover.
  function renderDots() {
    const discover = !!currentWallpaper?.discover;
    const box = $('#dots');
    box.replaceChildren();
    if (!discover) {
      wallpapers.forEach((w, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', `Wallpaper ${i + 1}: ${w.name}`);
        b.setAttribute('aria-current', String(w.id === currentWallpaper?.id));
        b.addEventListener('click', () => pinWallpaper(w));
        box.append(b);
      });
    }
    box.hidden = discover || wallpapers.length > 12;
    $('#wp-prev').hidden = $('#wp-next').hidden = !discover && wallpapers.length < 2;

    const keep = $('#wp-keep'), kept = !!keptFor(currentWallpaper);
    keep.hidden = $('#wp-block').hidden = !discover;
    keep.setAttribute('aria-pressed', String(kept));
    keep.setAttribute('aria-label', kept ? 'Remove from your collection' : 'Keep in your collection');
    keep.title = kept ? 'Kept in your collection' : 'Keep in your collection';

    renderCredit(currentWallpaper?.credit);
  }

  // Unsplash asks for "Photo by <name> on Unsplash", both linked. Pictures kept from the old Wikimedia source keep their credit.
  function renderCredit(c) {
    const box = $('#wp-credit');
    box.hidden = !c;
    if (!c) return;
    const link = (text, href) => Object.assign(document.createElement('a'), { textContent: text, href, target: '_blank', rel: 'noopener' });
    const line = document.createElement('b');
    const sub = document.createElement('small');
    if (c.source === 'unsplash') {
      line.append('Photo by ', link(c.author, c.authorUrl), ' on ', link('Unsplash', `https://unsplash.com/?${Discover.UTM}`));
      if (c.title) sub.append(link(c.title, c.page));
    } else {
      line.append(link(c.title || 'Wikimedia Commons', c.page));
      sub.textContent = [c.author, c.license, 'Wikimedia Commons'].filter(Boolean).join(' · ');
    }
    box.replaceChildren(line, sub);
  }

  // Thumbnails are only drawn while Settings is open, so a new tab never reads them.
  function renderThumbs() {
    const box = $('#thumbs');
    if (!$('#settings').open) return;
    box.replaceChildren();
    wallpapers.forEach(w => {
      const t = document.createElement('div');
      t.className = 'thumb';
      t.setAttribute('aria-current', String(w.id === currentWallpaper?.id));
      const pick = document.createElement('button');
      pick.type = 'button'; pick.className = 'pick';
      pick.setAttribute('aria-label', `Show ${w.name}`);
      pick.addEventListener('click', () => pinWallpaper(w));
      const img = new Image();
      img.alt = ''; img.decoding = 'async';
      thumbOf(w).then(src => { if (src) img.src = src; });
      pick.append(img);
      t.append(pick);
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'remove';
      rm.setAttribute('aria-label', `Remove ${w.name}`);
      rm.innerHTML = '<svg class="i" aria-hidden="true"><use href="#i-x"/></svg>';
      rm.addEventListener('click', () => removeWallpaper(w));
      t.append(rm);
      box.append(t);
    });
    if (!wallpapers.length) {
      box.append(Object.assign(document.createElement('p'), { className: 'help', textContent: 'No wallpapers yet. Add one below, or drop pictures on the page.' }));
    }
  }

  async function removeWallpaper(w) {
    if (w.bundled) {
      const hidden = await Store.get('wallpapers.hidden', []);
      await Store.set('wallpapers.hidden', [...new Set([...hidden, w.id])]);
    } else {
      await deleteStored(w.id);
    }
    await loadWallpapers();
    if (currentWallpaper?.id === w.id) showWallpaper(await chooseWallpaper());
    else { renderDots(); renderThumbs(); }
  }

  async function deleteStored(id) {
    const index = await Store.get('wallpapers.index', []);
    await Store.set('wallpapers.index', index.filter(c => c.id !== id));
    await Store.remove(IMG(id));
    await Store.remove(THUMB(id));
    srcCache.delete(id);
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Not an image'));
      img.src = src;
    });
  }

  // Scales a picture to at most maxHeight tall and returns it as a JPEG data URL.
  async function scaleImage(src, maxHeight, quality) {
    const img = await loadImage(src);
    const scale = Math.min(1, maxHeight / img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  }

  // Only the fields a credit line needs, as plain strings (kept pictures and imported backups pass through here).
  function cleanCredit(c) {
    if (!c || typeof c !== 'object') return null;
    const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
    const url = (v, host, fallback) => {
      const u = s(v, 800);
      return new RegExp(`^https://([\\w-]+\\.)?${host.replace(/\./g, '\\.')}/`).test(u) ? u : fallback;
    };
    const base = { id: s(String(c.id ?? ''), 40), title: s(c.title, 140), author: s(c.author, 80), theme: s(c.theme, 60) };
    if (c.source === 'unsplash') {
      return {
        ...base, source: 'unsplash',
        authorUrl: url(c.authorUrl, 'unsplash.com', 'https://unsplash.com/'),
        page: url(c.page, 'unsplash.com', 'https://unsplash.com/'),
        url: url(c.url, 'images.unsplash.com', ''),
        thumb: url(c.thumb, 'images.unsplash.com', ''),
      };
    }
    return { ...base, license: s(c.license, 40), page: url(c.page, 'commons.wikimedia.org', 'https://commons.wikimedia.org/') };
  }

  async function storeWallpaper(name, src, credit = null) {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const thumb = await scaleImage(src, 300, 0.8);
    await Store.set(IMG(id), src);
    await Store.set(THUMB(id), thumb);
    const index = await Store.get('wallpapers.index', []);
    const entry = { id, name };
    if (credit) entry.credit = cleanCredit(credit);
    index.push(entry);
    await Store.set('wallpapers.index', index);
    srcCache.set(id, src);
    return id;
  }

  async function addWallpapers(files) {
    let added = null;
    for (const file of files) {
      const url = URL.createObjectURL(file);
      try {
        const src = await scaleImage(url, 1800, 0.9);
        added = await storeWallpaper(file.name.replace(/\.[^.]+$/, ''), src);
      } catch { toast(`Couldn’t read ${file.name}`); }
      finally { URL.revokeObjectURL(url); }
    }
    await loadWallpapers();
    if (added) pinWallpaper(wallpapers.find(w => w.id === added));
    else renderDots();
  }

  // Drop pictures anywhere on the page to add them.
  function initDrop() {
    const overlay = $('#drop');
    const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
    let depth = 0;
    document.addEventListener('dragenter', e => { if (hasFiles(e)) { depth++; overlay.hidden = false; } });
    document.addEventListener('dragleave', e => { if (hasFiles(e) && --depth <= 0) { depth = 0; overlay.hidden = true; } });
    document.addEventListener('dragover', e => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
    document.addEventListener('drop', e => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0; overlay.hidden = true;
      const images = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
      if (!images.length) { toast('Only pictures can go on the wall'); return; }
      addWallpapers(images);
    });
  }

  function initWallpaperKeys() {
    document.addEventListener('keydown', e => {
      if (isTyping(e) || e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]')) return;
      if (e.key === '[') { e.preventDefault(); step(-1); }
      if (e.key === ']') { e.preventDefault(); step(1); }
    });
  }

  /* ---------- Spotify player ---------- */
  const Player = (() => {
    const el = $('#player');
    const fill = $('#p-fill'), pos = $('#p-pos'), dur = $('#p-dur'), seekBar = $('#p-seek');
    const toggle = $('#p-toggle'), action = $('#p-action'), like = $('#p-like');
    const volWrap = $('#p-vol-wrap'), vol = $('#p-vol'), mute = $('#p-mute');
    const artLink = $('#p-art'), artImg = artLink.querySelector('img');
    let current = null, pollTimer = null, progressTimer = null, actionFn = null;

    const fmt = ms => {
      const s = Math.max(0, Math.floor(ms / 1000));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };

    function setText(title, sub) {
      $('#p-title').textContent = title;
      $('#p-sub').textContent = sub;
    }

    function setAction(label, fn) {
      action.textContent = label;
      actionFn = fn;
    }

    function setArt(src, href) {
      if (src) { artImg.src = src; artImg.hidden = false; } else { artImg.hidden = true; artImg.removeAttribute('src'); }
      if (href) { artLink.href = href; artLink.title = 'Open in Spotify'; } else { artLink.removeAttribute('href'); artLink.removeAttribute('title'); }
    }

    function setPlaying(playing) {
      toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      toggle.querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
    }

    const positionNow = () => Math.min(current.duration, current.progress + (current.playing ? Date.now() - current.at : 0));

    function drawProgress() {
      if (!current || !current.duration) return;
      const p = positionNow();
      fill.style.width = `${(p / current.duration) * 100}%`;
      pos.textContent = fmt(p);
      dur.textContent = fmt(current.duration);
      seekBar.setAttribute('aria-valuemax', String(Math.round(current.duration / 1000)));
      seekBar.setAttribute('aria-valuenow', String(Math.round(p / 1000)));
      seekBar.setAttribute('aria-valuetext', `${fmt(p)} of ${fmt(current.duration)}`);
      if (current.playing && p >= current.duration) schedule(800);
    }

    function render(s) {
      clearInterval(progressTimer);
      current = s && !s.idle ? s : null;
      if (!current) {
        el.dataset.state = 'idle';
        setText('Nothing playing', s && s.device ? `Press play to resume on ${s.device}` : 'Press play to resume on your last device');
        setArt(null, null);
        setPlaying(false);
        $('#p-prev').disabled = $('#p-next').disabled = true;
        like.hidden = true;
        volWrap.hidden = true;
        return;
      }
      el.dataset.state = 'active';
      $('#p-prev').disabled = $('#p-next').disabled = false;
      setText(current.title, [current.artist, current.device && `on ${current.device}`].filter(Boolean).join(' · '));
      setArt(current.art, current.url);
      setPlaying(current.playing);
      renderVolume();
      renderLike();
      drawProgress();
      if (current.playing) progressTimer = setInterval(drawProgress, 1000);
    }

    function showSetup(sub = 'Control what’s playing on any device', label = 'Connect Spotify') {
      clearTimeout(pollTimer); clearInterval(progressTimer);
      el.dataset.state = 'setup';
      setText('Spotify', sub);
      setArt(null, null);
      like.hidden = true; volWrap.hidden = true;
      setAction(label, () => openSettings('spotify'));
    }

    function showError(err) {
      clearInterval(progressTimer);
      if (err.code === 'auth') return showSetup('Your Spotify sign-in expired', 'Reconnect');
      el.dataset.state = 'error';
      setArt(null, null);
      like.hidden = true; volWrap.hidden = true;
      if (err.code === 'premium') {
        setText('Spotify Premium needed', 'Spotify only allows remote control on Premium accounts');
        setAction('Open Spotify', () => window.open('https://open.spotify.com/', '_blank'));
      } else {
        setText('Couldn’t reach Spotify', `Last tried at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
        setAction('Retry', () => poll());
      }
    }

    function schedule(ms) {
      clearTimeout(pollTimer);
      if (!DEMO && !document.hidden && Spotify.connected) pollTimer = setTimeout(poll, ms);
    }

    async function poll() {
      try {
        const s = await Spotify.state();
        render(s);
        schedule(s && s.playing ? 5000 : 12000);
      } catch (err) {
        showError(err);
        if (err.code === 'api' || err.code === undefined) schedule(30000);
      }
    }

    const askReconnect = () => toast('Reconnect Spotify in Settings to allow this');

    async function command(fn, optimistic) {
      if (optimistic) optimistic();
      if (DEMO) return;
      try {
        await fn();
      } catch (err) {
        if (err.code === 'device') toast('Open Spotify on a device first, then press play');
        else if (err.code === 'scope') askReconnect();
        else if (err.code === 'premium' || err.code === 'auth') showError(err);
        else toast('Spotify didn’t respond');
      }
      schedule(600);
    }

    toggle.addEventListener('click', () => {
      const playing = current && current.playing;
      command(playing ? Spotify.pause : Spotify.play, () => {
        if (current) { current.progress = positionNow(); current.at = Date.now(); current.playing = !playing; }
        setPlaying(!playing);
        clearInterval(progressTimer);
        if (current && current.playing) progressTimer = setInterval(drawProgress, 1000);
      });
    });
    $('#p-next').addEventListener('click', () => command(Spotify.next));
    $('#p-prev').addEventListener('click', () => command(Spotify.previous));
    action.addEventListener('click', () => actionFn && actionFn());

    /* seek: click or drag along the bar, or use the arrow keys on it */
    function seekTo(ms) {
      if (!current || !current.duration) return;
      const to = Math.max(0, Math.min(current.duration - 500, ms));
      command(() => Spotify.seek(to), () => { current.progress = to; current.at = Date.now(); drawProgress(); });
    }
    const msAt = e => {
      const r = seekBar.getBoundingClientRect();
      return ((e.clientX - r.left) / r.width) * current.duration;
    };
    seekBar.addEventListener('pointerdown', e => {
      if (!current || !current.duration) return;
      seekBar.setPointerCapture(e.pointerId);
      seekBar.classList.add('scrubbing');
      clearInterval(progressTimer);
      const preview = ev => {
        const p = Math.max(0, Math.min(current.duration, msAt(ev)));
        fill.style.width = `${(p / current.duration) * 100}%`;
        pos.textContent = fmt(p);
      };
      preview(e);
      const end = ev => {
        seekBar.removeEventListener('pointermove', preview);
        seekBar.removeEventListener('pointerup', end);
        seekBar.removeEventListener('pointercancel', end);
        seekBar.classList.remove('scrubbing');
        if (ev.type === 'pointerup') seekTo(msAt(ev));
        if (current && current.playing) progressTimer = setInterval(drawProgress, 1000);
      };
      seekBar.addEventListener('pointermove', preview);
      seekBar.addEventListener('pointerup', end);
      seekBar.addEventListener('pointercancel', end);
    });
    seekBar.addEventListener('keydown', e => {
      if (!current) return;
      const jump = { ArrowRight: 10000, ArrowLeft: -10000, ArrowUp: 10000, ArrowDown: -10000 }[e.key];
      if (jump) { e.preventDefault(); seekTo(positionNow() + jump); }
      if (e.key === 'Home') { e.preventDefault(); seekTo(0); }
    });

    /* volume: the slider sends after a short pause, and the next poll won't snap it back mid-drag */
    let volTimer = null, volTouched = 0, lastLoud = 50;
    function renderVolume() {
      volWrap.hidden = !current.supportsVolume;
      if (!current.supportsVolume || Date.now() - volTouched < 4000) return;
      vol.value = String(current.volume);
      if (current.volume > 0) lastLoud = current.volume;
      drawVolumeIcon();
    }
    function drawVolumeIcon() {
      const muted = Number(vol.value) === 0;
      mute.querySelector('use').setAttribute('href', muted ? '#i-mute' : '#i-volume');
      mute.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
      vol.style.setProperty('--fill', `${vol.value}%`);
    }
    function sendVolume(v) {
      volTouched = Date.now();
      if (current) current.volume = v;
      drawVolumeIcon();
      clearTimeout(volTimer);
      volTimer = setTimeout(() => command(() => Spotify.volume(v)), 250);
    }
    vol.addEventListener('input', () => {
      const v = Number(vol.value);
      if (v > 0) lastLoud = v;
      sendVolume(v);
    });
    mute.addEventListener('click', () => {
      vol.value = String(Number(vol.value) === 0 ? lastLoud || 50 : 0);
      sendVolume(Number(vol.value));
    });

    /* like: save the playing song to the library. Checked once per song, not on every poll. */
    const savedCache = new Map();
    function drawLike(saved) {
      like.setAttribute('aria-pressed', String(!!saved));
      like.setAttribute('aria-label', saved ? 'Remove from your library' : 'Save to your library');
      like.title = saved ? 'Saved to your library' : 'Save to your library';
    }
    async function renderLike() {
      const uri = current && current.uri;
      like.hidden = !uri;
      if (!uri) return;
      if (savedCache.has(uri)) return drawLike(savedCache.get(uri));
      drawLike(false);
      if (DEMO || !Spotify.canLike()) return;
      try {
        const saved = await Spotify.isSaved(uri);
        savedCache.set(uri, saved);
        if (current && current.uri === uri) drawLike(saved);
      } catch { /* leave it unfilled */ }
    }
    like.addEventListener('click', async () => {
      const uri = current && current.uri;
      if (!uri) return;
      if (!DEMO && !Spotify.canLike()) { askReconnect(); openSettings('spotify'); return; }
      const saved = like.getAttribute('aria-pressed') === 'true';
      savedCache.set(uri, !saved);
      drawLike(!saved);
      if (DEMO) return;
      try {
        await (saved ? Spotify.unsave(uri) : Spotify.save(uri));
        toast(saved ? 'Removed from your library' : 'Saved to your library');
      } catch (err) {
        savedCache.set(uri, saved);
        drawLike(saved);
        if (err.code === 'scope') askReconnect();
        else if (err.code === 'auth') showError(err);
        else toast('Spotify didn’t save that');
      }
    });

    /* where to play: move the song between the phone, this computer and speakers */
    const devBtn = $('#p-devices'), menu = $('#device-menu');
    const DEVICE_ICON = { Computer: 'i-computer', Smartphone: 'i-phone', Tablet: 'i-phone' };
    const DEVICE_KIND = { Computer: 'Computer', Smartphone: 'Phone', Tablet: 'Tablet', Speaker: 'Speaker', TV: 'TV', CastAudio: 'Cast speaker', CastVideo: 'Cast device', Automobile: 'Car' };
    const isWebPlayer = d => /^Web Player/i.test(d.name);
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function menuNote(text) {
      return Object.assign(document.createElement('p'), { className: 'note', textContent: text });
    }

    function menuRow(icon, name, sub, onPick, isCurrent) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'device'; b.setAttribute('role', 'menuitem');
      if (isCurrent) b.setAttribute('aria-current', 'true');
      b.innerHTML = `<svg class="i" aria-hidden="true"><use href="#${icon}"/></svg><span><b></b><small></small></span>`;
      b.querySelector('b').textContent = name;
      b.querySelector('small').textContent = sub;
      b.addEventListener('click', () => onPick(b));
      return b;
    }

    function closeMenu() {
      menu.hidden = true;
      devBtn.setAttribute('aria-expanded', 'false');
    }

    async function openMenu() {
      menu.hidden = false;
      devBtn.setAttribute('aria-expanded', 'true');
      const head = Object.assign(document.createElement('h3'), { textContent: 'Play on' });
      if (DEMO) {
        menu.replaceChildren(head, menuRow('i-speaker', 'Desk speaker', 'Playing now', closeMenu, true), menuRow('i-phone', 'Phone', 'Phone', closeMenu));
        return;
      }
      menu.replaceChildren(head, menuNote('Looking for your devices…'));
      let list;
      try { list = await Spotify.devices(); }
      catch (err) {
        if (err.code === 'auth') { closeMenu(); return showError(err); }
        menu.replaceChildren(head, menuNote('Couldn’t load your devices. Try again in a moment.'));
        return;
      }
      if (menu.hidden) return;

      menu.replaceChildren(head);
      list.forEach(d => {
        const sub = d.is_active ? (current && current.playing ? 'Playing now' : 'Connected') : (isWebPlayer(d) ? 'This browser' : DEVICE_KIND[d.type] || d.type);
        menu.append(menuRow(isWebPlayer(d) ? 'i-browser' : DEVICE_ICON[d.type] || 'i-speaker', d.name, sub,
          b => (d.is_active ? closeMenu() : moveTo(d, b)), d.is_active));
      });
      if (!list.some(isWebPlayer)) {
        menu.append(menuRow('i-browser', 'This browser', 'Opens Spotify’s web player in a pinned tab', playHere));
      }
      if (!list.length) menu.append(menuNote('No devices are online. Open Spotify on your phone or computer, or play in this browser.'));
      menu.querySelector('.device')?.focus();
    }

    async function moveTo(device, row) {
      if (device.is_restricted) { toast(`Spotify can’t control ${device.name}`); return; }
      row.setAttribute('aria-busy', 'true');
      try {
        await Spotify.transfer(device.id);
        closeMenu();
        toast(`Playing on ${device.name}`);
      } catch (err) {
        row.removeAttribute('aria-busy');
        if (err.code === 'premium' || err.code === 'auth') { closeMenu(); showError(err); }
        else toast(`Couldn’t move playback to ${device.name}`);
      }
      schedule(900);
    }

    // No web player is running: open one in a pinned background tab, wait for it to register, then move playback to it.
    let searching = false;
    async function playHere(row) {
      if (searching) return;
      searching = true;
      row.setAttribute('aria-busy', 'true');
      const sub = row.querySelector('small');
      sub.textContent = 'Opening the web player…';
      Platform.openBackgroundTab('https://open.spotify.com/');
      try {
        for (let i = 0; i < 20; i++) {
          await sleep(1500);
          const found = (await Spotify.devices()).find(isWebPlayer);
          if (found) {
            await Spotify.transfer(found.id);
            closeMenu();
            toast('Playing in this browser. If it stays silent, click the pinned Spotify tab once.');
            schedule(1200);
            return;
          }
        }
        sub.textContent = 'Log in to Spotify in the pinned tab, then try again';
      } catch {
        sub.textContent = 'Spotify didn’t respond. Try again in a moment.';
      } finally {
        searching = false;
        row.removeAttribute('aria-busy');
      }
    }

    devBtn.addEventListener('click', () => (menu.hidden ? openMenu() : closeMenu()));
    document.addEventListener('click', e => {
      if (!menu.hidden && !menu.contains(e.target) && !devBtn.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !menu.hidden) { closeMenu(); devBtn.focus(); }
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Spotify.connected) poll();
      else clearTimeout(pollTimer);
    });

    async function start() {
      await Spotify.load();
      if (DEMO) return demo();
      if (!Spotify.connected) return showSetup();
      el.dataset.state = 'loading';
      setText('Spotify', 'Checking what’s playing');
      poll();
    }

    // ?demo shows a playing track, for previewing the design without an account.
    function demo() {
      render({
        playing: true, title: 'Nightcall', artist: 'Kavinsky', device: 'Desk speaker', art: null, url: null,
        uri: 'spotify:track:demo', progress: 102000, duration: 259000, volume: 60, supportsVolume: true, at: Date.now(),
      });
    }

    return { start, poll, showSetup };
  })();

  /* ---------- backup ---------- */
  const BACKUP_KEYS = ['settings', 'quotes.own', 'wallpapers.hidden', 'spotify.clientId', 'unsplash.key'];

  async function exportBackup() {
    const data = { app: 'start', version: 1, exported: new Date().toISOString(), store: {}, wallpapers: [] };
    for (const k of BACKUP_KEYS) data.store[k] = await Store.get(k, null);
    for (const w of await Store.get('wallpapers.index', [])) {
      if (w.url) { data.wallpapers.push({ id: w.id, name: w.name, url: w.url, thumb: w.thumb, credit: w.credit || null }); continue; }
      const src = await Store.get(IMG(w.id), null);
      if (src) data.wallpapers.push({ id: w.id, name: w.name, src, credit: w.credit || null });
    }
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `start-backup-${new Date().toISOString().slice(0, 10)}.json`,
    });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`Exported settings and ${data.wallpapers.length} wallpaper${data.wallpapers.length === 1 ? '' : 's'}`);
  }

  async function importBackup(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch { data = null; }
    if (!data || data.app !== 'start' || typeof data.store !== 'object') { toast('That isn’t a Start backup file'); return; }

    for (const k of BACKUP_KEYS) {
      if (k in data.store && data.store[k] !== null) await Store.set(k, data.store[k]);
    }
    const index = await Store.get('wallpapers.index', []);
    let added = 0;
    for (const w of Array.isArray(data.wallpapers) ? data.wallpapers : []) {
      if (!w || index.some(x => x.id === w.id)) continue;
      // A kept Unsplash picture: just its link and credit.
      const linked = w.credit && cleanCredit(w.credit);
      if (linked && linked.source === 'unsplash' && linked.url) {
        index.push({ id: `kept-${linked.id}`, name: String(w.name || 'Photo').slice(0, 140), url: linked.url, thumb: linked.thumb || linked.url, credit: linked });
        added++;
        continue;
      }
      if (typeof w.src !== 'string' || !w.src.startsWith('data:image/')) continue;
      try {
        const id = /^custom-[\w-]+$/.test(w.id) ? w.id : `custom-${Date.now()}-${added}`;
        await Store.set(IMG(id), w.src);
        await Store.set(THUMB(id), await scaleImage(w.src, 300, 0.8));
        const entry = { id, name: String(w.name || 'Wallpaper').slice(0, 120) };
        if (w.credit) entry.credit = cleanCredit(w.credit);
        index.push(entry);
        added++;
      } catch { /* skip a broken picture */ }
    }
    await Store.set('wallpapers.index', index);

    settings = { ...DEFAULTS, ...(await Store.get('settings', {})) };
    ownQuotes = await Store.get('quotes.own', []);
    await Spotify.load();
    await loadWallpapers();
    applyVeil(settings.veil);
    lastDay = null; tick();
    showWallpaper(await chooseWallpaper());
    renderApps();
    fillSettings();
    toast(`Restored settings${added ? ` and ${added} wallpaper${added === 1 ? '' : 's'}` : ''}`);
  }

  /* ---------- settings ---------- */
  function fillSettings() {
    $('#sp-client').value = Spotify.clientId || '';
    $('#sp-redirect').value = Spotify.redirectUri() || 'Shown once installed as an extension';
    refreshSpotifyStatus();
    document.querySelectorAll('input[name="rotate"]').forEach(r => { r.checked = r.value === settings.rotate; });
    document.querySelectorAll('input[name="quotesrc"]').forEach(r => { r.checked = r.value === settings.quotes; });
    document.querySelectorAll('input[name="clock"]').forEach(r => { r.checked = r.value === settings.clock; });
    document.querySelectorAll('input[name="float"]').forEach(r => { r.checked = r.value === settings.float; });
    $('#folder').value = settings.folder;
    $('#quotes-own').value = formatQuotes(ownQuotes);
    document.querySelectorAll('input[name="source"]').forEach(r => { r.checked = r.value === settings.source; });
    $('#veil').value = String(settings.veil);
    $('#veil-out').textContent = `${settings.veil}%`;
    renderSource();
    renderThemes();
    renderThumbs();
  }

  /* ---------- wallpaper settings: source, themes, left side ---------- */
  function renderSource() {
    const discover = settings.source === 'discover';
    $('#themes-block').hidden = !discover;
    if (discover) renderUnsplashStatus();
    $('#source-help').textContent = discover
      ? 'A new photo from Unsplash, from the themes below. Press the heart on the poster to keep one, or ⊘ to never see it again.'
      : 'Cycles through your own pictures and the ones you kept from Discover.';
  }

  async function renderUnsplashStatus(message) {
    const key = await Discover.getKey();
    const input = $('#unsplash-key');
    if (document.activeElement !== input) input.value = key;
    const problem = await Discover.status();
    const text = message || (!key
      ? 'Add a free key to start: create an app at unsplash.com/developers and paste its Access Key here.'
      : problem && problem.code === 'key' ? 'Unsplash didn’t accept this key. Check you copied the Access Key, not the Secret Key.'
        : problem && problem.code === 'limit' ? 'This key has used its hourly allowance. New photos resume within the hour; the current one stays up.'
          : problem && problem.code === 'offline' ? 'Couldn’t reach Unsplash. The last photo stays up until you’re back online.'
            : 'Connected to Unsplash.');
    $('#unsplash-status').textContent = text;
  }

  async function saveUnsplashKey() {
    const key = $('#unsplash-key').value.trim();
    if (key === await Discover.getKey()) return;
    await Discover.setKey(key);
    if (!key) { renderUnsplashStatus(); return; }
    renderUnsplashStatus('Checking the key…');
    const ok = await Discover.prepare(settings);
    renderUnsplashStatus(ok ? 'Connected to Unsplash.' : undefined);
    if (ok && settings.source === 'discover' && !currentWallpaper?.discover) discoverStep(1);
  }

  function renderThemes() {
    const box = $('#themes');
    box.replaceChildren();
    const chosen = settings.themes;
    const chip = (label, pressed, onClick, removable) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = label;
      if (removable) {
        b.setAttribute('aria-label', `Remove theme ${label}`);
        b.classList.add('own');
        const x = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        x.setAttribute('class', 'i');
        x.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', '#i-x');
        x.append(use);
        b.append(x);
      } else {
        b.setAttribute('aria-pressed', String(pressed));
      }
      b.addEventListener('click', onClick);
      return b;
    };
    Discover.THEMES.forEach(t => {
      box.append(chip(t.label, chosen.includes(t.id), () => {
        const on = chosen.includes(t.id);
        const next = on ? chosen.filter(id => id !== t.id) : [...chosen, t.id];
        if (!next.length && !settings.customThemes.length) { toast('Keep at least one theme'); return; }
        changeThemes({ themes: next });
      }));
    });
    settings.customThemes.forEach(word => {
      box.append(chip(word, true, () => {
        const next = settings.customThemes.filter(w => w !== word);
        if (!next.length && !settings.themes.length) { toast('Keep at least one theme'); return; }
        changeThemes({ customThemes: next });
      }, true));
    });
  }

  async function changeThemes(patch) {
    await saveSettings(patch);
    renderThemes();
    Discover.prepare(settings); // the next picture comes from the new mix
  }

  function addOwnTheme() {
    const input = $('#theme-own');
    const word = input.value.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!word) return;
    input.value = '';
    if (settings.customThemes.some(w => w.toLowerCase() === word.toLowerCase())) return;
    changeThemes({ customThemes: [...settings.customThemes, word].slice(-12) });
  }

  // The left side's background: 100% is solid; lower lets the wallpaper show through behind it.
  function applyVeil(v) {
    const root = document.documentElement;
    root.style.setProperty('--veil', `${v}%`);
    root.toggleAttribute('data-see-through', v < 100);
    FastCache.set('veil', v); // painted before the first frame by boot.js
  }

  function openSettings(focus) {
    const dlg = $('#settings');
    if (!dlg.open) dlg.showModal();
    fillSettings();
    if (focus === 'spotify') $('#sp-client').focus();
  }

  function refreshSpotifyStatus(message) {
    const connected = Spotify.connected;
    let text = connected
      ? 'Connected. The player shows whatever is playing on your account.'
      : 'Not connected. You need Spotify Premium and a free app from the Spotify dashboard.';
    if (connected && !Spotify.canLike()) text += ' Reconnect once to turn on the save-to-library heart.';
    $('#sp-status').textContent = message || text;
    $('#sp-connect').textContent = connected ? 'Reconnect' : 'Connect';
    $('#sp-disconnect').hidden = !connected;
  }

  function initSettings() {
    $('#open-settings').addEventListener('click', () => openSettings());
    $('#sp-client').addEventListener('change', e => Spotify.setClientId(e.target.value));
    $('#sp-copy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText($('#sp-redirect').value); toast('Redirect URI copied'); }
      catch { $('#sp-redirect').select(); }
    });
    $('#sp-connect').addEventListener('click', async () => {
      await Spotify.setClientId($('#sp-client').value);
      refreshSpotifyStatus('Waiting for Spotify…');
      try {
        await Spotify.connect();
        refreshSpotifyStatus();
        Player.poll();
      } catch (err) {
        refreshSpotifyStatus(err.message || 'Couldn’t connect.');
      }
    });
    $('#sp-disconnect').addEventListener('click', async () => {
      await Spotify.disconnect();
      refreshSpotifyStatus();
      Player.showSetup();
    });
    $('#wp-file').addEventListener('change', e => { addWallpapers([...e.target.files]); e.target.value = ''; });
    document.querySelectorAll('input[name="rotate"]').forEach(r => r.addEventListener('change', () => saveSettings({ rotate: r.value })));
    document.querySelectorAll('input[name="clock"]').forEach(r => r.addEventListener('change', async () => {
      await saveSettings({ clock: r.value });
      tick();
    }));
    document.querySelectorAll('input[name="float"]').forEach(r => r.addEventListener('change', () => saveSettings({ float: r.value })));
    $('#folder').addEventListener('change', async e => {
      await saveSettings({ folder: e.target.value.trim() || DEFAULTS.folder });
      renderApps();
    });
    $('#backup-export').addEventListener('click', () => exportBackup().catch(() => toast('Couldn’t export')));
    $('#backup-import').addEventListener('change', e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (file) importBackup(file).catch(() => toast('Couldn’t import that file'));
    });
    $('#wp-prev').addEventListener('click', () => step(-1));
    $('#wp-next').addEventListener('click', () => step(1));
    $('#wp-keep').addEventListener('click', toggleKeep);
    $('#wp-block').addEventListener('click', notForMe);
    $('#first-wallpaper').addEventListener('click', () => $('#wp-file').click());

    document.querySelectorAll('input[name="source"]').forEach(r => r.addEventListener('change', async () => {
      await saveSettings({ source: r.value });
      renderSource();
      showWallpaper(await chooseWallpaper());
    }));
    $('#theme-add').addEventListener('click', addOwnTheme);
    $('#theme-own').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addOwnTheme(); } });
    $('#veil').addEventListener('input', e => {
      const v = Number(e.target.value);
      $('#veil-out').textContent = `${v}%`;
      applyVeil(v);
    });
    $('#veil').addEventListener('change', async e => {
      await saveSettings({ veil: Number(e.target.value) });
      // Across 100% the wall switches between a tall poster and a full-page picture: fetch the right shape next.
      if (settings.source === 'discover') Discover.prepare(settings);
    });
    $('#unsplash-key').addEventListener('change', saveUnsplashKey);
    $('#unsplash-key').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); saveUnsplashKey(); } });
  }

  /* ---------- start ---------- */
  async function start() {
    settings = { ...DEFAULTS, ...(await Store.get('settings', {})) };
    ownQuotes = await Store.get('quotes.own', []);
    await ZenQuotes.load(); // today's batch, if already fetched, so the first quote painted is the right one
    startClock();
    refreshOnlineQuotes();
    initSearch();
    initQuotes();
    initAppKeys();
    initAddApp();
    initSettings();
    initDrop();
    initWallpaperKeys();
    applyVeil(settings.veil);
    await loadBundled();
    await migrateWallpapers();
    await loadWallpapers();
    // First run after this update: keep showing your own pictures if you have some, otherwise discover.
    if (!settings.source) await saveSettings({ source: wallpapers.length ? 'collection' : 'discover' });
    Discover.cleanupOld();
    showWallpaper(await chooseWallpaper());
    renderApps();
    Player.start();
  }

  start();
})();
