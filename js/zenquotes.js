// Online quotes from ZenQuotes (zenquotes.io): one request a day for 50 random quotes, kept in storage.
// The daily quote and the shuffle button draw from that batch, so a new tab never waits on the network,
// and the built-in list (js/quotes.js) takes over whenever the batch is missing.
//
// ZenQuotes' free tier needs no key, allows about 5 requests per 30 seconds, and asks for a visible
// link back to zenquotes.io wherever its quotes are shown. Extension pages can only reach it because
// manifest.json lists it in host_permissions (it doesn't allow ordinary web pages to call it).
const ZenQuotes = (() => {
  const URL_QUOTES = 'https://zenquotes.io/api/quotes';
  const KEY = 'quotes.online'; // { day, list: [[quote, author], ...], fetchedAt }
  const RETRY_KEY = 'quotes.online.retry'; // after a failed fetch, wait until this time
  const MAX_LENGTH = 140;      // longer quotes don't fit the quote's place on the page

  let batch = null;
  let busy = null;

  const today = () => {
    const d = new Date();
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  };

  // Today's batch, or null if it hasn't been fetched yet today.
  async function load() {
    batch = await Store.get(KEY, null);
    return list();
  }
  const list = () => (batch && batch.day === today() && Array.isArray(batch.list) ? batch.list : null);

  // Fetches today's batch unless it is already stored. Resolves true when a new batch arrived.
  function refresh() {
    if (!busy) busy = doRefresh().catch(() => false).finally(() => { busy = null; });
    return busy;
  }
  async function doRefresh() {
    if (list()) return false;
    if (Date.now() < (await Store.get(RETRY_KEY, 0))) return false;
    let data;
    try {
      const res = await fetch(URL_QUOTES, { cache: 'no-store' });
      if (!res.ok) throw new Error(`ZenQuotes said ${res.status}`);
      data = await res.json();
    } catch {
      await Store.set(RETRY_KEY, Date.now() + 15 * 60000); // offline or refused: try again in 15 minutes
      return false;
    }
    // Errors such as the rate limit arrive as a "quote" credited to zenquotes.io; drop those.
    const quotes = (Array.isArray(data) ? data : [])
      .filter(x => x && typeof x.q === 'string' && typeof x.a === 'string' && !/zenquotes\.io/i.test(x.a))
      .map(x => [x.q.trim(), x.a.trim()])
      .filter(([q]) => q && q.length <= MAX_LENGTH);
    if (!quotes.length) {
      await Store.set(RETRY_KEY, Date.now() + 15 * 60000);
      return false;
    }
    batch = { day: today(), list: quotes, fetchedAt: Date.now() };
    await Store.set(KEY, batch);
    await Store.remove(RETRY_KEY);
    return true;
  }

  return { load, list, refresh, CREDIT_URL: 'https://zenquotes.io/' };
})();
