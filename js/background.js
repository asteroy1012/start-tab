// Background service worker: makes the Spotify calls for the floating player (js/float.js), so web pages
// never see the tokens, and remembers which windows have the floating player hidden.
importScripts('platform.js', 'spotify.js');

let ready = Spotify.load();
const OFF_KEY = 'float.off'; // window ids where the floating player is hidden (cleared when Chrome restarts)

async function hiddenWindows() {
  return (await chrome.storage.session.get(OFF_KEY))[OFF_KEY] || [];
}

async function setWindow(windowId, enabled) {
  const off = (await hiddenWindows()).filter(id => id !== windowId);
  if (!enabled) off.push(windowId);
  await chrome.storage.session.set({ [OFF_KEY]: off });
  const tabs = await chrome.tabs.query({ windowId });
  for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'float:set', enabled }).catch(() => { /* no widget in that tab */ });
}

async function toggleWindow(windowId) {
  const off = await hiddenWindows();
  await setWindow(windowId, off.includes(windowId));
}

chrome.action.onClicked.addListener(tab => toggleWindow(tab.windowId));
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle-float' && tab) toggleWindow(tab.windowId);
});
chrome.windows.onRemoved.addListener(async id => {
  const off = await hiddenWindows();
  if (off.includes(id)) chrome.storage.session.set({ [OFF_KEY]: off.filter(x => x !== id) });
});

// Whether each song is in the library, checked once per song rather than on every poll.
const savedCache = new Map();
async function isSaved(uri) {
  if (!Spotify.canLike()) return null;
  if (!savedCache.has(uri)) {
    try { savedCache.set(uri, await Spotify.isSaved(uri)); } catch { return null; }
    if (savedCache.size > 200) savedCache.delete(savedCache.keys().next().value);
  }
  return savedCache.get(uri);
}

// Album art is fetched here and handed over as bytes, so a page's own content rules can't block it.
let lastArt = { url: null, out: null };
async function art(url) {
  if (lastArt.url === url) return lastArt.out;
  if (!/^https:\/\/[\w.-]+\.(scdn\.co|spotifycdn\.com)\//.test(url)) throw new Error('Not Spotify art');
  const res = await fetch(url);
  if (!res.ok) throw new Error('No art');
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > 400000) throw new Error('Art too large');
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const out = { mime: res.headers.get('content-type') || 'image/jpeg', b64: btoa(bin) };
  lastArt = { url, out };
  return out;
}

const HANDLERS = {
  async 'float:status'(msg, sender) {
    const off = await hiddenWindows();
    return { enabled: !(sender.tab && off.includes(sender.tab.windowId)) };
  },
  async 'float:hide'(msg, sender) {
    if (sender.tab) await setWindow(sender.tab.windowId, false);
  },
  async 'float:state'() {
    if (!Spotify.connected) return { connected: false };
    const state = await Spotify.state();
    const playing = state && !state.idle;
    return {
      connected: true,
      state,
      canLike: Spotify.canLike(),
      saved: playing && state.uri ? await isSaved(state.uri) : null,
    };
  },
  'float:play': () => Spotify.play(),
  'float:pause': () => Spotify.pause(),
  'float:next': () => Spotify.next(),
  'float:previous': () => Spotify.previous(),
  async 'float:like'({ uri, save }) {
    if (typeof uri !== 'string' || !/^spotify:(track|episode):\w+$/.test(uri)) throw new Error('Bad uri');
    await (save ? Spotify.save(uri) : Spotify.unsave(uri));
    savedCache.set(uri, !!save);
  },
  'float:art': ({ url }) => art(String(url)),
};

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  const handler = msg && HANDLERS[msg.type];
  if (!handler || sender.id !== chrome.runtime.id) return false;
  (async () => {
    try {
      await ready;
      respond({ ok: true, data: (await handler(msg, sender)) ?? null });
    } catch (err) {
      respond({ ok: false, code: err.code || 'api', message: String(err.message || err) });
    }
  })();
  return true; // the answer comes later
});
