// Start — wires the page together: clock, quote, search, apps, wallpapers, Spotify and settings.
(() => {
  const $ = sel => document.querySelector(sel);
  const DEFAULTS = { rotate: 'daily', clock: '24', folder: 'Dashboard' };
  const MAX_APPS = 11; // plus the Add tile: three rows of four

  // Pictures dropped into wallpapers/ and listed in wallpapers/index.json ship with this copy of the
  // extension. The folder is kept out of git, so every install starts with its owner's own pictures.
  let bundled = [];
  async function loadBundled() {
    try {
      const res = await fetch('wallpapers/index.json');
      const list = res.ok ? await res.json() : [];
      bundled = list.map(w => ({ id: w.file.replace(/\.[^.]+$/, ''), name: w.name || w.file, src: `wallpapers/${w.file}` }));
    } catch {
      bundled = [];
    }
  }

  let settings = { ...DEFAULTS };
  let wallpapers = [];
  let currentWallpaper = null;
  let appsFolderId = null;

  const dayNumber = (d = new Date()) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  const todayKey = () => new Date().toDateString();

  function toast(text) {
    document.querySelector('.toast')?.remove();
    const el = Object.assign(document.createElement('div'), { className: 'toast', textContent: text, role: 'status' });
    document.body.append(el);
    setTimeout(() => el.remove(), 3200);
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
    if (day !== lastDay) { lastDay = day; renderQuote(now); }
  }
  const DATE_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  function startClock() {
    tick();
    setTimeout(() => { tick(); setInterval(tick, 1000); }, 1000 - (Date.now() % 1000));
  }

  function renderQuote(date) {
    const q = quoteForDay(date);
    $('#quote-text').textContent = q.text;
    $('#quote-author').textContent = q.author;
    $('#quote').dataset.length = q.text.length > 62 ? 'long' : 'short';
  }

  /* ---------- search ---------- */
  function looksLikeUrl(s) {
    if (/\s/.test(s)) return false;
    return /^[a-z][\w+.-]*:\/\//i.test(s) || /^localhost(:\d+)?(\/|$)/i.test(s) || /^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(s);
  }
  const normaliseUrl = s => (/^[a-z][\w+.-]*:\/\//i.test(s) ? s : `https://${s}`);

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
      const typing = e.target.closest('input, textarea, [contenteditable]');
      if (e.key === '/' && !typing && !document.querySelector('dialog[open]')) { e.preventDefault(); input.focus(); }
      if (e.key === 'Escape' && e.target === input) { input.value = ''; input.blur(); }
    });
  }

  /* ---------- apps (from Chrome bookmarks) ---------- */
  async function renderApps() {
    const box = $('#apps');
    let result;
    try { result = await Platform.apps(settings.folder || DEFAULTS.folder); }
    catch { result = { folderId: null, items: [] }; }
    appsFolderId = result.folderId;
    box.replaceChildren();

    result.items.slice(0, MAX_APPS).forEach((b, i) => {
      const a = document.createElement('a');
      a.className = 'app';
      a.href = b.url;
      a.title = b.title || b.url;
      const img = new Image(28, 28);
      img.alt = ''; img.loading = 'eager';
      img.src = Platform.favicon(b.url);
      const label = document.createElement('span');
      label.textContent = b.title || new URL(b.url).hostname.replace(/^www\./, '');
      a.append(img, label);
      if (i < 9) {
        const k = document.createElement('kbd');
        k.textContent = `Alt ${i + 1}`;
        a.append(k);
      }
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
  async function loadWallpapers() {
    const custom = await Store.get('wallpapers.custom', []);
    const hidden = await Store.get('wallpapers.hidden', []);
    wallpapers = [...bundled.filter(w => !hidden.includes(w.id)), ...custom];
  }

  async function chooseWallpaper() {
    const asked = new URLSearchParams(location.search).get('wall'); // newtab.html?wall=porsche
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

  function showWallpaper(w) {
    currentWallpaper = w || null;
    $('.poster-wrap').toggleAttribute('data-empty', !w);
    if (!w) {
      $('#poster').removeAttribute('src');
      renderDots();
      renderThumbs();
      return;
    }
    FastCache.set('wallpaper.last', w.id);
    const img = $('#poster');
    img.classList.remove('ready');
    img.alt = w.name;
    img.onload = () => {
      const key = `theme.v1.${w.id}`;
      let t = FastCache.get(key);
      if (!t) {
        try { t = Theme.analyse(img); FastCache.set(key, t); } catch { t = null; }
      }
      if (t) { Theme.apply(t); FastCache.set('theme.last', t); }
      img.classList.add('ready');
    };
    img.src = w.src;
    renderDots();
    renderThumbs();
  }

  async function pinWallpaper(w) {
    showWallpaper(w);
    await Store.set('wallpaper.pin', { date: todayKey(), id: w.id });
  }

  function step(dir) {
    if (!wallpapers.length) return;
    const i = wallpapers.findIndex(w => w.id === currentWallpaper?.id);
    pinWallpaper(wallpapers[(i + dir + wallpapers.length) % wallpapers.length]);
  }

  function renderDots() {
    const box = $('#dots');
    box.replaceChildren();
    wallpapers.forEach((w, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', `Wallpaper ${i + 1}: ${w.name}`);
      b.setAttribute('aria-current', String(w.id === currentWallpaper?.id));
      b.addEventListener('click', () => pinWallpaper(w));
      box.append(b);
    });
    box.hidden = wallpapers.length > 12;
    $('#wp-prev').hidden = $('#wp-next').hidden = wallpapers.length < 2;
  }

  function renderThumbs() {
    const box = $('#thumbs');
    if (!box) return;
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
      img.src = w.src; img.alt = '';
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
      box.append(Object.assign(document.createElement('p'), { className: 'help', textContent: 'No wallpapers yet. Add one below.' }));
    }
  }

  async function removeWallpaper(w) {
    if (bundled.some(b => b.id === w.id)) {
      const hidden = await Store.get('wallpapers.hidden', []);
      await Store.set('wallpapers.hidden', [...new Set([...hidden, w.id])]);
    } else {
      const custom = await Store.get('wallpapers.custom', []);
      await Store.set('wallpapers.custom', custom.filter(c => c.id !== w.id));
    }
    await loadWallpapers();
    if (currentWallpaper?.id === w.id) showWallpaper(wallpapers[0]);
    else { renderDots(); renderThumbs(); }
  }

  // Uploaded pictures are scaled to at most 1800px tall and kept in extension storage.
  function readImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1800 / img.naturalHeight);
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image')); };
      img.src = url;
    });
  }

  async function addWallpapers(files) {
    const custom = await Store.get('wallpapers.custom', []);
    let added = null;
    for (const file of files) {
      try {
        const src = await readImage(file);
        added = { id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: file.name.replace(/\.[^.]+$/, ''), src };
        custom.push(added);
      } catch { toast(`Couldn’t read ${file.name}`); }
    }
    await Store.set('wallpapers.custom', custom);
    await loadWallpapers();
    if (added) pinWallpaper(wallpapers.find(w => w.id === added.id));
  }

  /* ---------- Spotify player ---------- */
  const Player = (() => {
    const el = $('#player');
    const fill = $('#p-fill'), pos = $('#p-pos'), dur = $('#p-dur');
    const toggle = $('#p-toggle'), action = $('#p-action');
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

    function drawProgress() {
      if (!current || !current.duration) return;
      const p = Math.min(current.duration, current.progress + (current.playing ? Date.now() - current.at : 0));
      fill.style.width = `${(p / current.duration) * 100}%`;
      pos.textContent = fmt(p);
      dur.textContent = fmt(current.duration);
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
        return;
      }
      el.dataset.state = 'active';
      $('#p-prev').disabled = $('#p-next').disabled = false;
      setText(current.title, [current.artist, current.device && `on ${current.device}`].filter(Boolean).join(' · '));
      setArt(current.art, current.url);
      setPlaying(current.playing);
      drawProgress();
      if (current.playing) progressTimer = setInterval(drawProgress, 1000);
    }

    function showSetup(sub = 'Control what’s playing on any device', label = 'Connect Spotify') {
      clearTimeout(pollTimer); clearInterval(progressTimer);
      el.dataset.state = 'setup';
      setText('Spotify', sub);
      setArt(null, null);
      setAction(label, () => openSettings('spotify'));
    }

    function showError(err) {
      clearInterval(progressTimer);
      if (err.code === 'auth') return showSetup('Your Spotify sign-in expired', 'Reconnect');
      el.dataset.state = 'error';
      setArt(null, null);
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
      if (!document.hidden && Spotify.connected) pollTimer = setTimeout(poll, ms);
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

    async function command(fn, optimistic) {
      if (optimistic) optimistic();
      try {
        await fn();
      } catch (err) {
        if (err.code === 'device') toast('Open Spotify on a device first, then press play');
        else if (err.code === 'premium') showError(err);
        else if (err.code === 'auth') showError(err);
        else toast('Spotify didn’t respond');
      }
      schedule(600);
    }

    toggle.addEventListener('click', () => {
      const playing = current && current.playing;
      command(playing ? Spotify.pause : Spotify.play, () => {
        if (current) { current.progress += Date.now() - current.at; current.at = Date.now(); current.playing = !playing; }
        setPlaying(!playing);
      });
    });
    $('#p-next').addEventListener('click', () => command(Spotify.next));
    $('#p-prev').addEventListener('click', () => command(Spotify.previous));
    action.addEventListener('click', () => actionFn && actionFn());

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
      if (new URLSearchParams(location.search).has('demo')) return demo();
      if (!Spotify.connected) return showSetup();
      el.dataset.state = 'loading';
      setText('Spotify', 'Checking what’s playing');
      poll();
    }

    // ?demo shows a playing track, for previewing the design without an account.
    function demo() {
      render({ playing: true, title: 'Nightcall', artist: 'Kavinsky', device: 'Desk speaker', art: null, url: null, progress: 102000, duration: 259000, at: Date.now() });
    }

    return { start, poll, showSetup };
  })();

  /* ---------- settings ---------- */
  function openSettings(focus) {
    const dlg = $('#settings');
    $('#sp-client').value = Spotify.clientId || '';
    $('#sp-redirect').value = Spotify.redirectUri() || 'Shown once installed as an extension';
    refreshSpotifyStatus();
    document.querySelectorAll('input[name="rotate"]').forEach(r => { r.checked = r.value === settings.rotate; });
    document.querySelectorAll('input[name="clock"]').forEach(r => { r.checked = r.value === settings.clock; });
    $('#folder').value = settings.folder;
    renderThumbs();
    dlg.showModal();
    if (focus === 'spotify') $('#sp-client').focus();
  }

  function refreshSpotifyStatus(message) {
    const connected = Spotify.connected;
    $('#sp-status').textContent = message || (connected
      ? 'Connected. The player shows whatever is playing on your account.'
      : 'Not connected. You need Spotify Premium and a free app from the Spotify dashboard.');
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
      lastDay = null; tick();
    }));
    $('#folder').addEventListener('change', async e => {
      await saveSettings({ folder: e.target.value.trim() || DEFAULTS.folder });
      renderApps();
    });
    $('#wp-prev').addEventListener('click', () => step(-1));
    $('#wp-next').addEventListener('click', () => step(1));
    $('#first-wallpaper').addEventListener('click', () => $('#wp-file').click());
  }

  /* ---------- start ---------- */
  async function start() {
    settings = { ...DEFAULTS, ...(await Store.get('settings', {})) };
    startClock();
    initSearch();
    initAppKeys();
    initAddApp();
    initSettings();
    await loadBundled();
    await loadWallpapers();
    showWallpaper(await chooseWallpaper());
    renderApps();
    Player.start();
  }

  start();
})();
