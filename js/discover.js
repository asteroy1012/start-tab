// Discover: fresh wallpapers from Unsplash, picked from the themes you choose.
//
// Unsplash's API guidelines, which this follows:
//  - pictures are shown from Unsplash's own image links (hotlinked), never copied elsewhere;
//    the browser caches them for a year, so a picture seen once also shows offline
//  - each picture shown is credited "Photo by <name> on Unsplash", with both linked
//  - when a picture goes on the wall, its download_location is pinged so the photographer's count goes up
//
// It needs a free Access Key from unsplash.com/developers (Settings → Wallpapers). Unapproved ("demo")
// keys allow 50 requests an hour, so candidates come 30 at a time and the next picture is loaded ahead.
const Discover = (() => {
  const API = 'https://api.unsplash.com';
  const UTM = 'utm_source=start_new_tab&utm_medium=referral';

  // A theme is an Unsplash topic (curated by their editors) or search phrases, one picked per request.
  // Topics fall back to their phrases if Unsplash ever renames them.
  const THEMES = [
    { id: 'wallpapers', label: 'Curated wallpapers', topic: 'wallpapers', q: ['wallpaper'] },
    { id: 'mountains', label: 'Mountains', q: ['mountains', 'alps', 'mountain landscape'] },
    { id: 'ocean', label: 'Ocean and coast', q: ['ocean', 'coast', 'beach'] },
    { id: 'forests', label: 'Forests', q: ['forest', 'misty forest'] },
    { id: 'night-sky', label: 'Night sky', q: ['milky way', 'aurora', 'starry night'] },
    { id: 'cities', label: 'Cities at night', q: ['city night', 'neon city', 'skyline night'] },
    { id: 'architecture', label: 'Architecture', topic: 'architecture-interior', q: ['architecture', 'minimal architecture'] },
    { id: 'deserts', label: 'Deserts', q: ['desert', 'sand dunes'] },
    { id: 'nature', label: 'Nature', topic: 'nature', q: ['nature landscape'] },
    { id: 'textures', label: 'Textures and abstract', topic: 'textures-patterns', q: ['abstract', 'texture'] },
    { id: '3d', label: '3D renders', topic: '3d-renders', q: ['3d render'] },
    { id: 'cars', label: 'Cars', q: ['sports car', 'classic car'] },
    { id: 'animals', label: 'Animals', topic: 'animals', q: ['wildlife'] },
    { id: 'winter', label: 'Snow and winter', q: ['snow mountains', 'winter landscape'] },
    { id: 'film', label: 'Film photography', topic: 'film', q: ['film photography'] },
  ];
  const DEFAULT_THEMES = ['wallpapers', 'mountains', 'night-sky'];

  const K = {
    key: 'unsplash.key',          // the user's Access Key
    queue: 'unsplash.queue',      // candidates not shown yet: [meta]
    ready: 'unsplash.ready',      // the next picture, already in the browser cache: meta
    current: 'unsplash.current',  // the picture on the wall: { meta, date }
    history: 'unsplash.history',  // earlier pictures, newest last: [meta]
    seen: 'unsplash.seen',        // ids shown recently
    blocked: 'unsplash.blocked',  // ids marked "not for me"
    pause: 'unsplash.pause',      // after an error or a spent rate limit, wait until this time
    status: 'unsplash.status',    // the last problem, for Settings: { code, at }
    mix: 'unsplash.mix',          // the themes and orientation the queue was built for
  };

  let busy = null;
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const getKey = async () => ((await Store.get(K.key, '')) || '').trim();

  // Portrait pictures for the poster; landscape ones when the left side is see-through and the picture fills the page.
  const orientation = settings => (settings.veil < 100 ? 'landscape' : 'portrait');
  const mixKey = settings => JSON.stringify([settings.themes || DEFAULT_THEMES, settings.customThemes || [], orientation(settings)]);

  function themes(settings) {
    const preset = THEMES.filter(t => (settings.themes || DEFAULT_THEMES).includes(t.id));
    const own = (settings.customThemes || []).map(w => ({ label: w, q: [w] }));
    const all = [...preset, ...own];
    return all.length ? all : THEMES.filter(t => DEFAULT_THEMES.includes(t.id));
  }

  // Sized image links. Unsplash's image server scales on the fly; the same link is reused so the cache hits.
  function sized(raw, o) {
    const join = raw.includes('?') ? '&' : '?';
    return o === 'landscape'
      ? `${raw}${join}w=2400&q=80&fm=jpg&fit=max`
      : `${raw}${join}h=1800&q=80&fm=jpg&fit=max`;
  }

  function toMeta(p, theme, o) {
    if (!p || !p.id || !p.urls || !p.urls.raw || !p.user) return null;
    return {
      source: 'unsplash',
      id: String(p.id),
      title: String(p.alt_description || p.description || '').slice(0, 140),
      author: String(p.user.name || p.user.username || 'Unknown').slice(0, 80),
      authorUrl: `${p.user.links && p.user.links.html ? p.user.links.html : 'https://unsplash.com'}?${UTM}`,
      page: `${p.links && p.links.html ? p.links.html : 'https://unsplash.com'}?${UTM}`,
      download: p.links && p.links.download_location ? p.links.download_location : null,
      url: sized(p.urls.raw, o),
      thumb: p.urls.small || sized(p.urls.raw, 'portrait'),
      color: p.color || null,
      ratio: p.height / p.width,
      orientation: o,
      theme: theme.label,
    };
  }

  async function call(path, params, key) {
    const url = new URL(API + path);
    url.search = new URLSearchParams(params);
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' } });
    } catch {
      throw Object.assign(new Error('offline'), { code: 'offline' });
    }
    const remaining = Number(res.headers.get('X-Ratelimit-Remaining'));
    if (res.status === 401) throw Object.assign(new Error('Unsplash didn’t accept the key'), { code: 'key' });
    if (res.status === 403 || res.status === 429 || remaining === 0) {
      if (!res.ok) throw Object.assign(new Error('Hourly limit reached'), { code: 'limit' });
    }
    if (res.status === 404) throw Object.assign(new Error('Not found'), { code: 'missing' });
    if (!res.ok) throw Object.assign(new Error(`Unsplash said ${res.status}`), { code: 'api' });
    return { data: await res.json(), remaining: Number.isFinite(remaining) ? remaining : null };
  }

  // One request: up to 30 pictures from one of your themes, a random page in so they keep changing.
  async function search(theme, o, key) {
    const base = { per_page: '30', orientation: o, content_filter: 'high' };
    if (theme.topic) {
      try {
        const { data } = await call(`/topics/${theme.topic}/photos`, { ...base, order_by: 'popular', page: String(1 + Math.floor(Math.random() * 10)) }, key);
        return data;
      } catch (err) {
        if (err.code !== 'missing') throw err; // topic renamed: use its search phrases instead
      }
    }
    const page = 1 + Math.floor(Math.random() * 4);
    const { data } = await call('/search/photos', { ...base, query: pick(theme.q), order_by: 'relevant', page: String(page) }, key);
    if (!data.results.length && page > 1) {
      return (await call('/search/photos', { ...base, query: pick(theme.q), order_by: 'relevant', page: '1' }, key)).data.results;
    }
    return data.results;
  }

  async function setProblem(code) {
    await Store.set(K.status, code ? { code, at: Date.now() } : null);
  }

  async function refill(settings) {
    const key = await getKey();
    if (!key) { await setProblem('nokey'); return false; }
    if (Date.now() < await Store.get(K.pause, 0)) return false;
    const theme = pick(themes(settings));
    const o = orientation(settings);
    let photos;
    try {
      photos = await search(theme, o, key);
    } catch (err) {
      await setProblem(err.code);
      const wait = { limit: 20, key: 60, offline: 2 }[err.code] || 5;
      await Store.set(K.pause, Date.now() + wait * 60000);
      return false;
    }
    await setProblem(null);
    const seen = new Set(await Store.get(K.seen, []));
    const blocked = new Set(await Store.get(K.blocked, []));
    const queue = await Store.get(K.queue, []);
    const have = new Set(queue.map(m => m.id));
    const fresh = photos.map(p => toMeta(p, theme, o)).filter(m => m && !seen.has(m.id) && !blocked.has(m.id) && !have.has(m.id));
    // Shuffle, so one page of a theme doesn't play in a row.
    for (let i = fresh.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [fresh[i], fresh[j]] = [fresh[j], fresh[i]]; }
    await Store.set(K.queue, [...queue, ...fresh].slice(-90));
    if (!fresh.length) await Store.set(K.pause, Date.now() + 60000);
    return fresh.length > 0;
  }

  // Loads a picture into the browser cache (CORS mode, matching the poster), so showing it is instant.
  async function warm(meta) {
    const res = await fetch(meta.url, { mode: 'cors' });
    if (!res.ok) throw new Error(`Picture said ${res.status}`);
    await res.blob();
  }

  // Makes sure the next picture is chosen and loaded. Safe to call often.
  function prepare(settings) {
    if (!busy) busy = doPrepare(settings).catch(() => false).finally(() => { busy = null; });
    return busy;
  }
  async function doPrepare(settings) {
    const mix = mixKey(settings);
    if ((await Store.get(K.mix, null)) !== mix) {
      await forget();
      await Store.set(K.mix, mix);
    }
    if (await Store.get(K.ready, null)) return true;
    for (let attempt = 0; attempt < 3; attempt++) {
      let queue = await Store.get(K.queue, []);
      if (queue.length < 3) {
        await refill(settings);
        queue = await Store.get(K.queue, []);
      }
      if (!queue.length) return false;
      const meta = queue.shift();
      await Store.set(K.queue, queue);
      try {
        await warm(meta);
        await Store.set(K.ready, meta);
        return true;
      } catch { /* that one failed; try the next */ }
    }
    return false;
  }

  // Tells Unsplash the picture was used, as their guidelines ask. Best effort; never blocks the page.
  async function track(meta) {
    const key = await getKey();
    if (!key || !meta.download || !/^https:\/\/api\.unsplash\.com\//.test(meta.download)) return;
    fetch(meta.download, { headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' } }).catch(() => {});
  }

  async function setCurrent(meta) {
    const old = await Store.get(K.current, null);
    if (old && old.meta.id !== meta.id) {
      const history = await Store.get(K.history, []);
      await Store.set(K.history, [...history.filter(m => m.id !== old.meta.id), old.meta].slice(-20));
    }
    const current = { meta, date: new Date().toDateString() };
    await Store.set(K.current, current);
    const seen = await Store.get(K.seen, []);
    await Store.set(K.seen, [...seen.filter(id => id !== meta.id), meta.id].slice(-1000));
    track(meta);
    return current;
  }

  // Puts the waiting picture on the wall. Resolves to the new current picture, or null if none could be had.
  async function advance(settings) {
    if (!(await Store.get(K.ready, null))) await prepare(settings);
    const ready = await Store.get(K.ready, null);
    if (!ready) return null;
    await Store.remove(K.ready);
    return setCurrent(ready);
  }

  // Goes back to the picture before this one (still in the browser cache).
  async function back() {
    const history = await Store.get(K.history, []);
    const blocked = new Set(await Store.get(K.blocked, []));
    let meta = null;
    while (history.length && !meta) {
      const m = history.pop();
      if (!blocked.has(m.id)) meta = m;
    }
    if (!meta) { await Store.set(K.history, history); return null; }
    const old = await Store.get(K.current, null);
    if (old) await Store.set(K.ready, old.meta); // "next" returns to it
    await Store.set(K.history, history);
    const current = { meta, date: new Date().toDateString() };
    await Store.set(K.current, current);
    return current;
  }

  async function block(id) {
    const blocked = await Store.get(K.blocked, []);
    await Store.set(K.blocked, [...new Set([...blocked, id])].slice(-3000));
    const ready = await Store.get(K.ready, null);
    if (ready && ready.id === id) await Store.remove(K.ready);
  }

  // Drops everything picked for the old themes or orientation (the picture on the wall stays until the next).
  async function forget() {
    await Store.remove(K.queue);
    await Store.remove(K.ready);
    await Store.remove(K.pause);
  }

  async function setKey(key) {
    await Store.set(K.key, (key || '').trim());
    await forget();
    await setProblem(null);
  }

  // Earlier versions used Wikimedia Commons under 'discover.*'. Clear that out once.
  async function cleanupOld() {
    for (const k of ['queue', 'ready', 'current', 'history', 'seen', 'blocked', 'pause', 'themesKey']) await Store.remove(`discover.${k}`);
  }

  const current = () => Store.get(K.current, null);
  const isReady = async () => !!(await Store.get(K.ready, null));
  const status = () => Store.get(K.status, null);

  return { THEMES, DEFAULT_THEMES, prepare, advance, back, block, forget, current, isReady, getKey, setKey, status, cleanupOld, UTM };
})();
