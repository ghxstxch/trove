# Trove

**A free, open-source journal for books, places, food, and everything you love.**

Log what you've read, where you've been, what you ate, and what you want to try next.
Your data stays on your device. You can optionally sync it through a server you host yourself.
There are no accounts, ads, or tracking.

## Features

- **Categories:** Books, Places, Food, Movies & TV, Games, and Music come built in. You can add, rename, or delete your own, each with an emoji.
- **Entries:** each one can have a title, a photo, a status (Want to, In progress, or Done), a 1–5 star rating, a date, a link, tags, and notes.
- **Search and filtering:** full-text search (type `#tag` to match tags), filters for category, status, and tag, and sorting by recent, top rated, or A–Z.
- **Works offline:** you can install it on your home screen like a regular app.
- **Optional sync:** a self-hosted server that resolves conflicts with "last write wins".
- **Sharing:** send one entry or a whole category to a friend as a small file. They add it with Import JSON, and it shows who it came from.
- **Backups:** export and import everything as JSON.
- **Optional 21+ section:** a Cannabis category with product type and kind, full cannabinoid and terpene breakdowns, detailed ratings, effects, smell and taste, and session notes. It's off by default and hidden unless switched on in Settings.
- **Dark mode:** follows your system setting.

## Google sign-in and Drive sync (web version)
The hosted web version opens with a sign-in screen. After signing in with Google, the journal syncs automatically through the user's own Google Drive (a hidden app folder, one small file per entry), so it shows up on every device they sign in on.

To use this on your own copy, create a Google Cloud project with the Drive API enabled and an OAuth web client, then put the client ID and your site's address in `web/config.js`. The Android app signs in through the phone's browser, using a second "Android" OAuth client (package name plus the signing key's SHA-1, with the custom URI scheme enabled) whose ID goes in `web/config.js` as `googleAndroidClientId`.

## Spotify (web version)
Connect Spotify in Settings to import saved albums, liked songs, playlists and top artists or tracks into the Music category, and to fill a music entry from a Spotify search. Re-importing only adds what's new. To use this on your own copy, create an app at developer.spotify.com and put its client ID and redirect address in `web/config.js`. Spotify limits small apps to five users, added by hand in its dashboard.

## Visits (optional)
Trove can find places you've been and turn them into entries. Choose in **Settings → Visits** whether visits are suggested for review or added automatically, and how short a stop is ignored.

- **Built-in tracking (Android app only):** notes where you stop while the app is running, with a notification while it's on. It stores stops, not your route.
- **Dawarich:** enter your Dawarich URL and API key to pull its visits. The Android app connects directly. In a browser the request goes through your Trove server, because Dawarich's API doesn't allow direct browser requests.
- **Google Maps Timeline:** import the JSON file exported from your phone.

Visit suggestions stay on the device and are not synced.

## Three ways to run it

All three use the same code in `web/`.

### 1. Installable web app (no server needed)
Serve the `web/` folder from any static host (GitHub Pages, Netlify, Nginx, and so on). It has to be served over HTTPS for the install option to appear.
Then, on Android, open it in Chrome and choose **⋮ → Add to Home screen / Install app**.

This repo publishes it to GitHub Pages automatically once you set **Settings → Pages → Source** to **GitHub Actions**.

**iPhone and iPad:** open the hosted page in Safari, tap **Share → Add to Home Screen**. Everything works except background visit tracking, which needs the Android app.

To try it locally: `npx serve web`, then open http://localhost:3000

### 2. Self-hosted on your homelab (Docker)
```bash
cp .env.example .env              # then set TROVE_TOKEN to a long random secret:
openssl rand -hex 24
docker compose up -d --build
```
- The app is at `http://<server>:8080`, and the sync API is at `/api/sync`.
- Your data is stored in `./data/trove.json`, which is plain JSON and easy to back up.
- On the first device, open **Settings → Sync** and enter the server URL and token. For every other device, tap **Show QR for another device** there, then on the new device tap **Scan QR to connect**.
- The same scanner reads the connection QR code that Dawarich shows on its own pages.
- For phones, put it behind HTTPS, for example with Caddy, Nginx Proxy Manager, or Tailscale (`tailscale serve`). The install option and offline mode both need HTTPS.

Without Docker: `TROVE_TOKEN=yoursecret node server/server.js`. This needs Node 18 or newer and has no npm dependencies.

### 3. Native Android app (APK)
This uses [Capacitor](https://capacitorjs.com) to wrap the web app.

**Easiest way:** every change pushed to `main` builds a new APK and publishes it under **Releases**. Open the latest release on your phone and tap `trove.apk`. You can also start a build by hand from **Actions → Build Android APK → Run workflow**.

**Permanent signing key:** add two repo secrets under **Settings → Secrets and variables → Actions**: `TROVE_KEYSTORE` (the keystore file encoded as base64) and `TROVE_KEYSTORE_PASSWORD`. Every build is then signed with the same key, so updates install over the old version. Without these secrets, builds fall back to a throwaway debug key.

**Building locally** requires Android Studio and JDK 21:
```bash
npm install
npx cap add android
npx cap sync android
npx cap open android   # then build or run it from Android Studio
```
After you edit anything in `web/`, run `npx cap sync android` again.

### 4. Native iPhone app (needs a Mac)
With Xcode installed, run `bash scripts/ios-setup.sh` from the repo folder and follow the steps it prints. A free Apple ID works for your own iPhone, but Apple makes free-account apps expire after 7 days, so you re-install from Xcode each week. A paid Apple Developer account removes that limit and allows TestFlight for sharing. This build has not been tested yet.

## How sync works
- Every item (entry or category) has an `id` and an `updatedAt` timestamp. When an item is deleted, it's kept as a marker (`deleted: true`) so the deletion syncs to your other devices.
- The app sends its local changes along with the last server sequence number it saw. The server keeps whichever version of an item is newer, then returns everything that changed since that number.
- Photos are resized to 1000 px JPEGs and stored inside the entries, so a single JSON file holds everything.

## Project layout
```
web/                 the app (HTML/CSS/JS, service worker, manifest, icons)
server/server.js     sync server + static file host (zero dependencies)
Dockerfile, docker-compose.yml
capacitor.config.json, package.json   Android wrapper
.github/workflows/android.yml         builds the APK in GitHub Actions
```

## License
MIT. See [LICENSE](LICENSE).
