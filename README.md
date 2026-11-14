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
- **Edit** opens Chrome's bookmark manager at that folder, where you can rename, remove or reorder.
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

**Moving the song to another device.** The speaker button at the right of the player lists every device on your account that's online: phone, computer, speakers, web players. Pick one and the song moves there and carries on from the same spot.

- **Spotify desktop app open on this computer:** it shows by your computer's name. Pick it.
- **No Spotify app on the computer:** pick **This browser**. It opens Spotify's web player in a pinned background tab and moves the song there once it's ready (a few seconds). If you aren't logged in to Spotify in Chrome, log in in that tab and pick it again. Chrome sometimes blocks sound from a tab you haven't clicked yet; if it stays silent, click the pinned tab once.

## Wallpapers

- The poster changes **daily** by default. Switch to **Every new tab** in Settings.
- The arrows and dots on the poster switch the picture; your pick holds for the rest of the day.
- **Add wallpaper** in Settings takes any image. Tall pictures look best, since they hang uncropped. They're saved in Chrome on your computer.
- Each poster colours the page: the background matches the poster's left edge, and the accent is its strongest colour.
- To ship pictures with your copy of the extension instead, see [wallpapers/README.md](wallpapers/README.md). That folder is ignored by git, so your pictures stay private.

## Daily quote

87 quotes, one per day, all bundled locally so it works offline. Edit `js/quotes.js` to add your own: each entry is `['quote', 'author']`.

## Files

| Path | What it is |
| --- | --- |
| `newtab.html` | The page |
| `css/style.css` | All styling |
| `js/app.js` | Clock, search, apps, wallpapers, player UI, settings |
| `js/spotify.js` | Spotify sign-in (PKCE) and playback calls |
| `js/theme.js` | Reads a poster and derives the page colours |
| `js/quotes.js` | The quote list |
| `js/platform.js` | Chrome APIs, with stand-ins so the page also opens as a plain file |
| `wallpapers/` | Your own pictures and `index.json` (kept out of git) |

To preview without installing, serve the folder with any static server (for example `npx serve .`) and open `newtab.html?demo`. `?wall=<file name without extension>` picks a poster from `wallpapers/index.json`.
