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
- **Backups:** export and import everything as JSON.
- **Dark mode:** follows your system setting.

## Three ways to run it

All three use the same code in `web/`.

### 1. Installable web app (no server needed)
Serve the `web/` folder from any static host (GitHub Pages, Netlify, Nginx, and so on). It has to be served over HTTPS for the install option to appear.
Then, on Android, open it in Chrome and choose **⋮ → Add to Home screen / Install app**.

To try it locally: `npx serve web`, then open http://localhost:3000

### 2. Self-hosted on your homelab (Docker)
```bash
cp .env.example .env              # then set TROVE_TOKEN to a long random secret:
openssl rand -hex 24
docker compose up -d --build
```
- The app is at `http://<server>:8080`, and the sync API is at `/api/sync`.
- Your data is stored in `./data/trove.json`, which is plain JSON and easy to back up.
- On each device, open **Settings → Sync** and enter the server URL and token.
- For phones, put it behind HTTPS, for example with Caddy, Nginx Proxy Manager, or Tailscale (`tailscale serve`). The install option and offline mode both need HTTPS.

Without Docker: `TROVE_TOKEN=yoursecret node server/server.js`. This needs Node 18 or newer and has no npm dependencies.

### 3. Native Android app (APK)
This uses [Capacitor](https://capacitorjs.com) to wrap the web app.

**Easiest way:** every change pushed to `main` builds a new APK and publishes it under **Releases**. Open the latest release on your phone and tap `trove.apk`. You can also start a build by hand from **Actions → Build Android APK → Run workflow**.

**Building locally** requires Android Studio and JDK 21:
```bash
npm install
npx cap add android
npx cap sync android
npx cap open android   # then build or run it from Android Studio
```
After you edit anything in `web/`, run `npx cap sync android` again.

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
