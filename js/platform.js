// Thin layer over the chrome.* APIs, so the page also opens as a plain file for previewing.
const IS_EXTENSION = typeof chrome !== 'undefined' && !!(chrome.storage && chrome.storage.local);

const Store = {
  async get(key, fallback = null) {
    if (IS_EXTENSION) {
      const out = await chrome.storage.local.get(key);
      return key in out ? out[key] : fallback;
    }
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  async set(key, value) {
    if (IS_EXTENSION) return chrome.storage.local.set({ [key]: value });
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* preview only */ }
  },
  async remove(key) {
    if (IS_EXTENSION) return chrome.storage.local.remove(key);
    try { localStorage.removeItem(key); } catch { /* preview only */ }
  },
};

// Small synchronous cache for things that must be painted before the first frame (the theme).
const FastCache = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } },
};

const PREVIEW_APPS = [
  { title: 'Gmail', url: 'https://mail.google.com/' },
  { title: 'YouTube', url: 'https://www.youtube.com/' },
  { title: 'GitHub', url: 'https://github.com/' },
  { title: 'Claude', url: 'https://claude.ai/' },
  { title: 'Notion', url: 'https://www.notion.so/' },
  { title: 'LinkedIn', url: 'https://www.linkedin.com/' },
  { title: 'Netflix', url: 'https://www.netflix.com/' },
];

const Platform = {
  isExtension: IS_EXTENSION,

  favicon(url, size = 64) {
    if (IS_EXTENSION) {
      const u = new URL(chrome.runtime.getURL('/_favicon/'));
      u.searchParams.set('pageUrl', url);
      u.searchParams.set('size', String(size));
      return u.toString();
    }
    return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=${size}`;
  },

  // Apps come from a bookmarks folder (default "Dashboard"); without one, from the bookmarks bar.
  async apps(folderName) {
    if (!IS_EXTENSION) return { folderId: null, items: PREVIEW_APPS.map((b, index) => ({ ...b, id: String(index), index })) };
    const matches = await chrome.bookmarks.search({ title: folderName });
    const folder = matches.find(n => !n.url);
    const parentId = folder ? folder.id : '1';
    const children = await chrome.bookmarks.getChildren(parentId);
    return { folderId: folder ? folder.id : null, items: children.filter(n => n.url) };
  },

  async addApp(folderName, title, url) {
    if (!IS_EXTENSION) { PREVIEW_APPS.push({ title, url }); return; }
    const matches = await chrome.bookmarks.search({ title: folderName });
    let folder = matches.find(n => !n.url);
    if (!folder) folder = await chrome.bookmarks.create({ parentId: '1', title: folderName });
    await chrome.bookmarks.create({ parentId: folder.id, title, url });
  },

  // Moves a bookmark to just before (or after) another one in the same folder.
  // chrome.bookmarks.move counts the index as it was before the moved item is taken out.
  async moveApp(node, target, after) {
    if (!IS_EXTENSION) {
      const [moved] = PREVIEW_APPS.splice(node.index, 1);
      const to = PREVIEW_APPS.findIndex(b => b.url === target.url && b.title === target.title);
      PREVIEW_APPS.splice(to + (after ? 1 : 0), 0, moved);
      return;
    }
    await chrome.bookmarks.move(node.id, { parentId: target.parentId, index: target.index + (after ? 1 : 0) });
  },

  openBookmarkManager(folderId) {
    const url = folderId ? `chrome://bookmarks/?id=${folderId}` : 'chrome://bookmarks/';
    if (IS_EXTENSION) chrome.tabs.create({ url });
  },

  search(text) {
    if (IS_EXTENSION && chrome.search) {
      chrome.search.query({ text, disposition: 'CURRENT_TAB' });
    } else {
      location.href = `https://www.google.com/search?q=${encodeURIComponent(text)}`;
    }
  },

  // Opens a page without leaving the new tab (used for Spotify's web player).
  openBackgroundTab(url) {
    if (IS_EXTENSION) chrome.tabs.create({ url, active: false, pinned: true });
    else window.open(url, '_blank');
  },

  onBookmarksChanged(fn) {
    if (!IS_EXTENSION) return;
    ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered']
      .forEach(ev => chrome.bookmarks[ev].addListener(fn));
  },
};
