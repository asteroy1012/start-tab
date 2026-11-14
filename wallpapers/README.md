# Your wallpapers

The easy way to add wallpapers is **Settings → Add wallpaper** on the new tab page. Those are saved in Chrome.

You can also ship pictures with your copy of the extension:

1. Put the image files in this folder.
2. Copy `index.example.json` to `index.json` and list them:

   ```json
   [
     { "file": "mountains.jpg", "name": "Mountains" },
     { "file": "poster.png", "name": "My poster" }
   ]
   ```

3. Open a new tab (or reload the extension at `chrome://extensions`).

Everything in this folder except this note and the example is ignored by git, so your pictures never end up in the repo.
