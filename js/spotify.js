// Spotify remote: shows and controls whatever is playing on the user's Spotify app or device.
// Auth is the Authorization Code flow with PKCE through chrome.identity, so no secret is stored.
const Spotify = (() => {
  const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing user-library-read user-library-modify';
  const AUTH_KEY = 'spotify.auth';
  const CLIENT_KEY = 'spotify.clientId';

  let auth = null;     // { access, refresh, expires, scope }
  let clientId = null;
  let refreshing = null; // the refresh in flight, shared by every caller

  const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const fail = (message, code, extra) => Object.assign(new Error(message), { code }, extra);

  function redirectUri() {
    return Platform.isExtension && chrome.identity ? chrome.identity.getRedirectURL() : null;
  }

  async function load() {
    clientId = await Store.get(CLIENT_KEY, null);
    auth = await Store.get(AUTH_KEY, null);
    return { clientId, connected: !!auth };
  }

  // The new tab page and the background script each hold the sign-in in memory. When one of them
  // connects, disconnects or refreshes, the other picks the change up from storage.
  if (Platform.isExtension && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (AUTH_KEY in changes) auth = changes[AUTH_KEY].newValue || null;
      if (CLIENT_KEY in changes) clientId = changes[CLIENT_KEY].newValue || null;
    });
  }

  async function setClientId(id) {
    clientId = (id || '').trim() || null;
    await Store.set(CLIENT_KEY, clientId);
  }

  async function saveTokens(json) {
    auth = {
      access: json.access_token,
      refresh: json.refresh_token || (auth && auth.refresh),
      expires: Date.now() + (json.expires_in - 60) * 1000,
      scope: json.scope || (auth && auth.scope) || '',
    };
    await Store.set(AUTH_KEY, auth);
  }

  // True when the current sign-in was granted this scope. Sign-ins made before a scope was added lack it.
  const hasScope = s => !!auth && (auth.scope || '').split(' ').includes(s);

  async function connect() {
    if (!clientId) throw new Error('Add your Spotify Client ID first.');
    if (!redirectUri()) throw new Error('Connecting works once the page is installed as the Chrome extension.');

    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const url = new URL('https://accounts.spotify.com/authorize');
    url.search = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri(),
      code_challenge_method: 'S256',
      code_challenge: challenge,
      scope: SCOPES,
    });

    const back = await chrome.identity.launchWebAuthFlow({ url: url.toString(), interactive: true });
    const params = new URL(back).searchParams;
    if (params.get('error')) throw new Error(`Spotify said: ${params.get('error')}`);

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: params.get('code'),
        redirect_uri: redirectUri(),
        client_id: clientId,
        code_verifier: verifier,
      }),
    });
    if (!res.ok) throw new Error('Spotify did not accept the sign-in. Check the Client ID and redirect URI.');
    auth = null; // a fresh sign-in replaces the old scopes
    await saveTokens(await res.json());
  }

  async function disconnect() {
    auth = null;
    await Store.remove(AUTH_KEY);
  }

  // Spotify rotates the refresh token on every use, so two refreshes racing each other would leave one
  // holding a dead token and sign the user out. Every caller waits on the same refresh instead.
  function refresh() {
    if (!refreshing) refreshing = doRefresh().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function doRefresh() {
    if (!auth || !auth.refresh) throw fail('Not connected', 'auth');
    // Another new tab may already have refreshed (and so retired our refresh token): adopt its tokens.
    const latest = await Store.get(AUTH_KEY, null);
    if (latest && latest.refresh && latest.refresh !== auth.refresh) {
      auth = latest;
      if (Date.now() < auth.expires) return;
    }
    const used = auth.refresh;
    let res;
    try {
      res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: used, client_id: clientId }),
      });
    } catch {
      throw fail('Couldn’t reach Spotify', 'api'); // offline: keep the sign-in and try again later
    }
    if (!res.ok) {
      // Another tab may have refreshed first and stored a newer token: use it rather than signing out.
      const stored = await Store.get(AUTH_KEY, null);
      if (stored && stored.refresh !== used) { auth = stored; return; }
      if (res.status >= 500) throw fail('Spotify didn’t respond', 'api');
      await disconnect();
      throw fail('Spotify sign-in expired', 'auth');
    }
    await saveTokens(await res.json());
  }

  async function readJson(res) {
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; } // e.g. an HTML error page from a proxy
  }

  async function api(path, { method = 'GET', body, retried = false } = {}) {
    if (!auth) throw fail('Not connected', 'auth');
    if (Date.now() > auth.expires) await refresh();
    let res;
    try {
      res = await fetch('https://api.spotify.com/v1' + path, {
        method,
        headers: { Authorization: `Bearer ${auth.access}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw fail('Couldn’t reach Spotify', 'api');
    }
    if (res.status === 401 && !retried) {
      await refresh();
      return api(path, { method, body, retried: true });
    }
    if (res.status === 204 || res.status === 202) return null;
    const data = await readJson(res);
    if (!res.ok) {
      const reason = data && data.error && (data.error.reason || data.error.message);
      let code = reason === 'PREMIUM_REQUIRED' ? 'premium' : reason === 'NO_ACTIVE_DEVICE' ? 'device' : 'api';
      if (res.status === 403 && /scope/i.test(reason || '')) code = 'scope';
      else if (res.status === 403 && code === 'api') code = 'premium';
      if (res.status === 404) code = 'device';
      throw fail(reason || `Spotify error ${res.status}`, code, { status: res.status });
    }
    return data;
  }

  // Normalised playback state, or null when nothing is playing anywhere.
  async function state() {
    const p = await api('/me/player?additional_types=episode');
    if (!p || !p.item) return p && p.device ? { idle: true, device: p.device.name, deviceId: p.device.id } : null;
    const item = p.item;
    const images = item.album ? item.album.images : item.images || [];
    const d = p.device || {};
    return {
      playing: p.is_playing,
      title: item.name,
      artist: item.artists ? item.artists.map(a => a.name).join(', ') : (item.show && item.show.name) || '',
      art: images.length ? images[images.length > 1 ? images.length - 2 : 0].url : null,
      artSmall: images.length ? images[images.length - 1].url : null,
      url: item.external_urls && item.external_urls.spotify,
      uri: item.uri || null,
      progress: p.progress_ms,
      duration: item.duration_ms,
      device: d.name || '',
      deviceId: d.id || null,
      volume: typeof d.volume_percent === 'number' ? d.volume_percent : null,
      supportsVolume: d.supports_volume !== false && typeof d.volume_percent === 'number',
      at: Date.now(),
    };
  }

  async function play() {
    try {
      await api('/me/player/play', { method: 'PUT' });
    } catch (e) {
      if (e.code !== 'device') throw e;
      // Nothing active: wake the most recent device the account knows about.
      const { devices = [] } = (await api('/me/player/devices')) || {};
      if (!devices.length) throw e;
      await api(`/me/player/play?device_id=${encodeURIComponent(devices[0].id)}`, { method: 'PUT' });
    }
  }
  const pause = () => api('/me/player/pause', { method: 'PUT' });
  const next = () => api('/me/player/next', { method: 'POST' });
  const previous = () => api('/me/player/previous', { method: 'POST' });
  const seek = ms => api(`/me/player/seek?position_ms=${Math.max(0, Math.round(ms))}`, { method: 'PUT' });
  const volume = pct => api(`/me/player/volume?volume_percent=${Math.max(0, Math.min(100, Math.round(pct)))}`, { method: 'PUT' });

  // The library: one endpoint for tracks and episodes, keyed by Spotify URI (since February 2026).
  const canLike = () => hasScope('user-library-read') && hasScope('user-library-modify');
  async function isSaved(uri) {
    const out = await api(`/me/library/contains?uris=${encodeURIComponent(uri)}`);
    return Array.isArray(out) ? !!out[0] : false;
  }
  const save = uri => api(`/me/library?uris=${encodeURIComponent(uri)}`, { method: 'PUT' });
  const unsave = uri => api(`/me/library?uris=${encodeURIComponent(uri)}`, { method: 'DELETE' });

  // Every device Spotify can see on this account right now (phones, computers, speakers, web players).
  const devices = async () => ((await api('/me/player/devices')) || {}).devices || [];
  // Moves playback to a device, carrying on from the same position.
  const transfer = (id, play = true) => api('/me/player', { method: 'PUT', body: { device_ids: [id], play } });

  return {
    load, setClientId, connect, disconnect, state, play, pause, next, previous, seek, volume,
    canLike, isSaved, save, unsave, devices, transfer, redirectUri,
    get clientId() { return clientId; },
    get connected() { return !!auth; },
  };
})();
