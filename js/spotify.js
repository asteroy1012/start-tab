// Spotify remote: shows and controls whatever is playing on the user's Spotify app or device.
// Auth is the Authorization Code flow with PKCE through chrome.identity, so no secret is stored.
const Spotify = (() => {
  const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
  const AUTH_KEY = 'spotify.auth';
  const CLIENT_KEY = 'spotify.clientId';

  let auth = null;     // { access, refresh, expires }
  let clientId = null;

  const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  function redirectUri() {
    return Platform.isExtension && chrome.identity ? chrome.identity.getRedirectURL() : null;
  }

  async function load() {
    clientId = await Store.get(CLIENT_KEY, null);
    auth = await Store.get(AUTH_KEY, null);
    return { clientId, connected: !!auth };
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
    };
    await Store.set(AUTH_KEY, auth);
  }

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
    await saveTokens(await res.json());
  }

  async function disconnect() {
    auth = null;
    await Store.remove(AUTH_KEY);
  }

  async function refresh() {
    if (!auth || !auth.refresh) throw Object.assign(new Error('Not connected'), { code: 'auth' });
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: auth.refresh, client_id: clientId }),
    });
    if (!res.ok) {
      await disconnect();
      throw Object.assign(new Error('Spotify sign-in expired'), { code: 'auth' });
    }
    await saveTokens(await res.json());
  }

  async function api(path, { method = 'GET', body, retried = false } = {}) {
    if (!auth) throw Object.assign(new Error('Not connected'), { code: 'auth' });
    if (Date.now() > auth.expires) await refresh();
    const res = await fetch('https://api.spotify.com/v1' + path, {
      method,
      headers: { Authorization: `Bearer ${auth.access}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401 && !retried) {
      await refresh();
      return api(path, { method, body, retried: true });
    }
    if (res.status === 204 || res.status === 202) return null;
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const reason = data && data.error && (data.error.reason || data.error.message);
      const err = new Error(reason || `Spotify error ${res.status}`);
      err.status = res.status;
      err.code = reason === 'PREMIUM_REQUIRED' ? 'premium' : reason === 'NO_ACTIVE_DEVICE' ? 'device' : 'api';
      if (res.status === 403 && err.code === 'api') err.code = 'premium';
      if (res.status === 404) err.code = 'device';
      throw err;
    }
    return data;
  }

  // Normalised playback state, or null when nothing is playing anywhere.
  async function state() {
    const p = await api('/me/player?additional_types=episode');
    if (!p || !p.item) return p && p.device ? { idle: true, device: p.device.name, deviceId: p.device.id } : null;
    const item = p.item;
    const images = item.album ? item.album.images : item.images || [];
    return {
      playing: p.is_playing,
      title: item.name,
      artist: item.artists ? item.artists.map(a => a.name).join(', ') : (item.show && item.show.name) || '',
      art: images.length ? images[images.length > 1 ? images.length - 2 : 0].url : null,
      url: item.external_urls && item.external_urls.spotify,
      progress: p.progress_ms,
      duration: item.duration_ms,
      device: p.device ? p.device.name : '',
      deviceId: p.device ? p.device.id : null,
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

  // Every device Spotify can see on this account right now (phones, computers, speakers, web players).
  const devices = async () => ((await api('/me/player/devices')) || {}).devices || [];
  // Moves playback to a device, carrying on from the same position.
  const transfer = (id, play = true) => api('/me/player', { method: 'PUT', body: { device_ids: [id], play } });

  return {
    load, setClientId, connect, disconnect, state, play, pause, next, previous, devices, transfer, redirectUri,
    get clientId() { return clientId; },
    get connected() { return !!auth; },
  };
})();
