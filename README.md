# Start

A personal new tab for Chrome: today's poster hung on the wall, a quote of the day, your apps from Chrome bookmarks, and a Spotify remote.

## Install

1. On this repo's GitHub page, click **Code → Download ZIP** and unzip it somewhere it can stay (for example `Documents\start`).
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and choose the unzipped folder (the one with `manifest.json` in it).
4. Open a new tab. If Chrome asks whether to keep the change, choose **Keep it**.
5. To see it when Chrome starts, open `chrome://settings/onStartup` and choose **Open the New Tab page**.
6. Click **Add wallpaper** on the empty frame and pick a picture or two.

Keep the folder where it is. Chrome identifies an unpacked extension by its folder, so moving it changes the Spotify redirect URI (see below).

If you use `git`, `git clone` works too, and `git pull` gets updates (then click the reload icon on the extension at `chrome://extensions`).

Chrome shows a "Customize Chrome" bar under every new tab page that comes from an extension. To hide it, right-click it and choose **Hide footer on New Tab page**, or switch off **Show footer on New Tab page** in the Customize Chrome panel.

## Your apps

The page shows the sites in a bookmarks folder called **Dashboard**. Create one anywhere in your bookmarks (the bookmarks bar is easiest) and add sites to it. Without that folder, the sites on your bookmarks bar are shown.

- **Add** on the page saves a new bookmark into the folder (it creates the folder if needed).
- **Drag a tile** onto another to reorder. The bookmark moves too, so Chrome's bookmarks stay in the same order.
- **Edit** opens Chrome's bookmark manager at that folder, where you can rename or remove.
- **Alt + 1 to 9** opens the first nine apps. Hold **Alt** to see the numbers.
- The folder name can be changed in Settings (the gear on the poster).

## Spotify

The player shows and controls whatever is playing on your Spotify account, on any device. Spotify only allows this for **Premium** accounts. Setup takes about five minutes:

1. Open a new tab, click the gear on the poster, and copy the **Redirect URI** (it looks like `https://<letters>.chromiumapp.org/`).
2. Go to <https://developer.spotify.com/dashboard>, log in, and click **Create app**.
   - Name and description: anything, for example "Start".
   - Redirect URI: paste the one you copied, exactly, including the final `/`.
   - Which API: **Web API**.
3. Save, open the app's **Settings** and copy its **Client ID**.
4. Back on the new tab, paste the Client ID into Settings and click **Connect**. Approve the Spotify window.

Click the album art to open the track in Spotify. If nothing is playing, play resumes on your most recent device.

- **Seek:** click or drag along the progress bar, or focus it and use the arrow keys (10 seconds per press).
- **Volume:** point at the speaker icon to slide the volume out; click the icon to mute. It only shows for devices that let Spotify change their volume.
- **Save to library:** the heart next to the title saves the song (or episode) to your library. If you connected before this was added, Settings asks you to **Reconnect** once so Spotify grants the library permission.

**Moving the song to another device.** The speaker button at the right of the player lists every device on your account that's online: phone, computer, speakers, web players. Pick one and the song moves there and carries on from the same spot.

- **Spotify desktop app open on this computer:** it shows by your computer's name. Pick it.
- **No Spotify app on the computer:** pick **This browser**. It opens Spotify's web player in a pinned background tab and moves the song there once it's ready (a few seconds). If you aren't logged in to Spotify in Chrome, log in in that tab and pick it again. Chrome sometimes blocks sound from a tab you haven't clicked yet; if it stays silent, click the pinned tab once.

## Floating player

Once Spotify is connected, a small remote sits on every web page while you browse: album art, title, previous, play/pause, next and the save heart.

- **Move it:** drag it anywhere. Every tab remembers the same spot.
- **Hide it in one window:** click the **Start** button in Chrome's toolbar (pin it from the puzzle-piece menu), press **Alt+Shift+S**, or use the small ✕ that appears when you point at the player. The same button or shortcut brings it back. To change the shortcut, open `chrome://extensions/shortcuts`.
- **Turn it off everywhere:** Settings → Floating player → **Off**.
- **Colours** follow the poster on your new tab page.
- It hides itself during fullscreen video, when Spotify isn't connected, and on Spotify's own web player.

To put it on every page, Chrome asks for permission to "read and change all your data on all websites" when you reload the extension. The player only draws itself: it never reads the page, and the page can't reach your Spotify sign-in, which stays in the extension's background script.

Chrome doesn't let extensions add anything to its own pages, so the player won't appear on `chrome://` pages, the Chrome Web Store or the built-in PDF viewer. Tabs that were already open when you install or reload the extension need a refresh before it shows.

## Wallpapers

Settings → Wallpapers chooses where pictures come from: **Discover** or **Your collection**. Either changes **daily** (the default) or on **every new tab**.

### Discover

A new photo from [Unsplash](https://unsplash.com/), from themes you pick, so you never have to add pictures yourself.

**Setup (about two minutes, free):**

1. Go to <https://unsplash.com/developers>, log in (or sign up), and click **Your apps → New Application**.
2. Accept the guidelines, give it any name (for example "Start"), and create it.
3. On the app's page, copy the **Access Key** (not the Secret Key).
4. On a new tab: Settings → Wallpapers → **Discover**, and paste it into **Unsplash access key**.

**Using it:**

- **Pick themes** in Settings: Curated wallpapers (Unsplash's own wallpaper picks), Mountains, Ocean and coast, Forests, Night sky, Cities at night, Architecture, Deserts, Nature, Textures and abstract, 3D renders, Cars, Animals, Snow and winter and Film photography. Add your own words too, like `lighthouse` or `tokyo`. Each new photo comes from one of your themes at random.
- **On the poster:** the **heart** keeps the photo in your collection; **⊘ (not for me)** skips it and never shows it again; the **arrows** (or **[** and **]**) go to the next or previous photo.
- **Shape:** with the left side at 100%, tall photos are picked for the poster; below 100%, wide ones that fill the page.
- **Credit:** point at the poster to see "Photo by … on Unsplash", linked to the photographer and the photo.

**Limits:** a new Unsplash app allows 50 requests an hour. Each request brings 30 photos, and each photo shown sends Unsplash one small "used" ping (their rules), so normal use stays well inside it. If you set **Every new tab** and open lots of tabs, the limit can run out; the current photo then stays up until it resets within the hour. You can ask Unsplash to raise it to 5,000 an hour from your app's page.

Photos are shown straight from Unsplash's servers, as their rules require, rather than copied into Chrome. The browser keeps them cached, so a new tab is instant and photos you've seen still show offline.

### Your collection

Pictures you've added plus the ones you kept from Discover, cycled in turn.

- The arrows and dots on the poster, or the **[** and **]** keys, switch the picture; your pick holds for the rest of the day.
- **Add wallpaper** in Settings takes any image, or **drop pictures anywhere on the page**. Tall pictures look best, since they hang uncropped. They're saved in Chrome on your computer, each with a small thumbnail, so a new tab only loads the one it shows.

### Look

- Each poster colours the page: the background matches the poster's left edge, and the accent is its strongest colour.
- **Left side** in Settings sets how solid the background behind the clock, quote and apps is. At 100% it's a solid colour with the poster hung on the right; below 100% the picture becomes one full-page wallpaper, with the left side tinted over it.
- To ship pictures with your copy of the extension instead, see [wallpapers/README.md](wallpapers/README.md). That folder is ignored by git, so your pictures stay private.

## Daily quote

A new quote every day, the same in every tab. With **Online** on (the default, Settings → Quotes), the extension fetches a fresh batch of 50 quotes from [ZenQuotes](https://zenquotes.io/) once a day, so they keep changing instead of cycling through a fixed list. No sign-up or key is needed. Without internet, or with **Built-in only**, the 87 quotes bundled in `js/quotes.js` are used instead. Quotes from ZenQuotes show a small "via ZenQuotes" link, which their free service asks for.

- **Your own quotes:** add them in Settings → Your quotes, one per line with the author after a dash (`Stay hungry, stay foolish. — Stewart Brand`). They join the daily rotation.
- **Another quote:** point at the quote and click the shuffle button. Tomorrow it goes back to the daily pick.
- To change the bundled list, edit `js/quotes.js`: each entry is `['quote', 'author']`.

## Backup

Settings → Backup → **Export** saves your settings, wallpapers, quotes and Spotify Client ID to one `.json` file. **Import** on another computer (or after reinstalling) restores them. Your Spotify sign-in isn't included; connect again after importing.

## Search

Type an address (`github.com`, `localhost:3000`, `192.168.1.1`) to go there, or anything else to search with your default search engine. Things that only look like addresses, such as `3.14` or `node.js`, are searched. Press **/** to jump to the box.

## Offline and privacy

The fonts (Inter and Instrument Serif, latin subsets) ship in `fonts/`, so opening a new tab makes no request to Google. The page only goes online for Spotify (once you've connected it), with Discover on for Unsplash (one request for 30 photos every so often, plus the photos themselves), and with online quotes on, for ZenQuotes (one request a day).

## Files

| Path | What it is |
| --- | --- |
| `newtab.html` | The page |
| `css/style.css` | All styling |
| `js/app.js` | Clock, search, apps, wallpapers, player UI, settings, backup |
| `js/spotify.js` | Spotify sign-in (PKCE) and playback calls |
| `js/background.js` | Background script: Spotify calls for the floating player, and which windows have it hidden |
| `js/float.js` | The floating player added to web pages |
| `js/discover.js` | Discover: finds and queues Unsplash photos by theme |
| `js/theme.js` | Reads a poster and derives the page colours |
| `js/quotes.js` | The built-in quote list, and parsing your own quotes |
| `js/zenquotes.js` | Online quotes: fetches and stores the daily batch from ZenQuotes |
| `js/platform.js` | Chrome APIs, with stand-ins so the page also opens as a plain file |
| `fonts/` | Bundled Inter and Instrument Serif (SIL Open Font License) |
| `wallpapers/` | Your own pictures and `index.json` (kept out of git) |

To preview without installing, serve the folder with any static server (for example `npx serve .`) and open `newtab.html?demo`. `?wall=<file name without extension>` picks a poster from `wallpapers/index.json`.
