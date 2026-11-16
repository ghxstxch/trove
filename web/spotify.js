/* Trove — Spotify: import your library into the Music category and fill entries from a Spotify search. MIT License.
 * Uses Spotify's sign-in for browser apps (authorization code + PKCE): no secret, tokens stay on this device. */
'use strict';

const SCFG = window.TROVE_CONFIG || {};
const SP_SCOPES = 'user-library-read playlist-read-private user-top-read';
const spNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const spAvailable = () => !!SCFG.spotifyClientId && !spNative() && !!SCFG.spotifyRedirect && SCFG.spotifyRedirect.startsWith(location.origin + '/');
const spGet = () => { try { return JSON.parse(localStorage.getItem('trove.spotify')) || null; } catch { return null; } };
const spSet = t => { try { t ? localStorage.setItem('trove.spotify', JSON.stringify(t)) : localStorage.removeItem('trove.spotify'); } catch {} };
const spCfg = () => ({ albums: true, tracks: false, playlists: true, topArtists: true, topTracks: false, auto: true, ...(settings.spotify || {}) });
const spSave = patch => { settings.spotify = { ...spCfg(), ...patch }; saveSettings(); };

/* ---------- Sign-in ---------- */
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function spConnect() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
  sessionStorage.setItem('trove.sp.pkce', JSON.stringify({ verifier, state }));
  location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
    client_id: SCFG.spotifyClientId, response_type: 'code', redirect_uri: SCFG.spotifyRedirect,
    code_challenge_method: 'S256', code_challenge: challenge, scope: SP_SCOPES, state });
}
async function spTokenRequest(params) {
  const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: SCFG.spotifyClientId, ...params }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.error || 'Spotify sign-in failed');
  const old = spGet() || {};
  spSet({ access: d.access_token, refresh: d.refresh_token || old.refresh, exp: Date.now() + (d.expires_in || 3600) * 1000 });
}
// Back from Spotify's sign-in page with ?code=…
async function spHandleReturn() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return false;
  let saved = null; try { saved = JSON.parse(sessionStorage.getItem('trove.sp.pkce')); } catch {}
  if (!saved || q.get('state') !== saved.state) return false;   // not ours
  sessionStorage.removeItem('trove.sp.pkce');
  history.replaceState(null, '', location.pathname);
  if (q.has('error')) { toast('Spotify: ' + (q.get('error') === 'access_denied' ? 'connection cancelled' : q.get('error'))); return true; }
  try {
    await spTokenRequest({ grant_type: 'authorization_code', code: q.get('code'), redirect_uri: SCFG.spotifyRedirect, code_verifier: saved.verifier });
    const me = await spApi('/me');
    spSave({ user: me.display_name || me.id || 'connected' });
    toast('Spotify connected — importing…');
    spImport({ loud: true });
  } catch (err) { toast('Spotify: ' + err.message); }
  return true;
}
async function spToken() {
  const t = spGet(); if (!t) throw new Error('Connect Spotify first');
  if (t.exp > Date.now() + 60000) return t.access;
  if (!t.refresh) throw new Error('Spotify needs you to connect again');
  await spTokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh });
  return spGet().access;
}
async function spApi(path, tries = 0) {
  const r = await fetch(path.startsWith('http') ? path : 'https://api.spotify.com/v1' + path, { headers: { Authorization: 'Bearer ' + await spToken() } });
  if (r.status === 429 && tries < 3) {       // asked too fast: wait as told, then retry
    await new Promise(res => setTimeout(res, (Number(r.headers.get('Retry-After')) || 2) * 1000));
    return spApi(path, tries + 1);
  }
  if (r.status === 401 && tries < 1) { const t = spGet(); if (t) { t.exp = 0; spSet(t); } return spApi(path, tries + 1); }
  if (!r.ok) { let m = `Spotify error ${r.status}`; try { m = (await r.json()).error.message || m; } catch {} throw new Error(m); }
  return r.json();
}
async function spPages(path, max) {
  const out = []; let url = path;
  while (url && out.length < max) {
    const d = await spApi(url);
    out.push(...(d.items || []));
    url = d.next;
  }
  return out.slice(0, max);
}

/* ---------- Turning Spotify things into entries ---------- */
const img = o => { const list = (o && o.images) || []; return (list.find(i => i.width && i.width <= 640) || list[0] || {}).url || null; };
const names = list => (list || []).map(a => a.name).filter(Boolean).join(', ');
function fromAlbum(a) {
  return { key: 'album:' + a.id, title: a.name, photo: img(a), link: a.external_urls && a.external_urls.spotify,
    music: { kind: 'Album', artists: names(a.artists), release: (a.release_date || '').slice(0, 4), tracks: a.total_tracks || 0 } };
}
function fromTrack(t, kind = 'Song') {
  return { key: 'track:' + t.id, title: t.name, photo: img(t.album), link: t.external_urls && t.external_urls.spotify,
    music: { kind, artists: names(t.artists), album: t.album && t.album.name, release: ((t.album && t.album.release_date) || '').slice(0, 4) } };
}
function fromArtist(a) {
  return { key: 'artist:' + a.id, title: a.name, photo: img(a), link: a.external_urls && a.external_urls.spotify,
    music: { kind: 'Artist', genres: (a.genres || []).slice(0, 3).join(', ') } };
}
function fromPlaylist(p) {
  const count = (p.items && p.items.total) ?? (p.tracks && p.tracks.total) ?? 0;
  return { key: 'playlist:' + p.id, title: p.name, photo: img(p), link: p.external_urls && p.external_urls.spotify,
    music: { kind: 'Playlist', artists: p.owner && p.owner.display_name ? 'by ' + p.owner.display_name : '', tracks: count } };
}
function musicLine(m) {
  return [m.kind, m.artists, m.album, m.release, m.genres, m.tracks ? `${m.tracks} tracks` : ''].filter(Boolean).join(' · ');
}

async function musicCatId() {
  let c = cats().find(x => /music/i.test(x.name));
  if (!c) {
    const order = Math.max(-1, ...cats().map(x => x.order ?? 0)) + 1;
    c = { id: uid(), kind: 'cat', emoji: '🎧', name: 'Music', order, createdAt: now() };
    await save(c);
  }
  return c.id;
}

// Add what isn't in Trove yet; things you've already imported (or deleted) are left alone.
async function spAdd(list, tag, date) {
  const known = new Set([...items.values()].filter(i => i.kind === 'entry' && i.extId).map(i => i.extId));
  const catId = await musicCatId();
  let n = 0;
  for (const x of list) {
    const extId = 'sp:' + x.key;
    if (known.has(extId)) continue;
    known.add(extId);
    await save({ id: uid(), kind: 'entry', createdAt: now(), title: x.title || 'Untitled', categoryId: catId, status: 'done', rating: 0,
      date: (x.addedAt || date || '').slice(0, 10), link: x.link || '', tags: ['spotify', tag], notes: '',
      photo: x.photo, photos: x.photo ? [x.photo] : [], music: x.music, extId });
    n++;
  }
  return n;
}

let spBusy = false;
async function spImport({ loud = false } = {}) {
  if (spBusy || !spGet()) return; spBusy = true;
  const cfg = spCfg(), today = new Date().toISOString().slice(0, 10), done = [], failed = [];
  const step = async (on, label, fn) => {
    if (!on) return;
    paintSpotify(`Importing ${label}…`);
    try { const n = await fn(); if (n) done.push(`${n} ${label}`); } catch (err) { failed.push(`${label} (${err.message})`); }
  };
  try {
    await step(cfg.albums, 'albums', async () => spAdd((await spPages('/me/albums?limit=50', 2000)).map(i => ({ ...fromAlbum(i.album), addedAt: i.added_at })), 'album', today));
    await step(cfg.tracks, 'liked songs', async () => spAdd((await spPages('/me/tracks?limit=50', 500)).map(i => ({ ...fromTrack(i.track), addedAt: i.added_at })), 'liked-song', today));
    await step(cfg.playlists, 'playlists', async () => spAdd((await spPages('/me/playlists?limit=50', 500)).filter(Boolean).map(fromPlaylist), 'playlist', today));
    await step(cfg.topArtists, 'top artists', async () => spAdd((await spPages('/me/top/artists?limit=50&time_range=medium_term', 50)).map(fromArtist), 'top-artist', today));
    await step(cfg.topTracks, 'top tracks', async () => spAdd((await spPages('/me/top/tracks?limit=50&time_range=medium_term', 50)).map(t => fromTrack(t)), 'top-track', today));
    const msg = (done.length ? 'Added ' + done.join(', ') : 'Nothing new') + (failed.length ? '. Could not get: ' + failed.join('; ') : '');
    spSave({ lastAt: Date.now(), lastMsg: msg });
    if (done.length) withTransition(render);
    if (loud || failed.length) toast('Spotify: ' + msg);
  } finally { spBusy = false; paintSpotify(); }
}

/* ---------- Search to fill an entry ---------- */
let spFound = [], spSearchT;
function paintSpotifyFind(cat) { $('#spFind').hidden = !(spAvailable() && spGet() && /music|album|song|artist|playlist/i.test((cat && cat.name) || '')); }
async function spRunSearch(q) {
  const box = $('#spResults');
  if (q.trim().length < 2) { box.innerHTML = ''; return; }
  box.innerHTML = '<p class="muted">Searching…</p>';
  try {
    const d = await spApi('/search?' + new URLSearchParams({ q, type: 'album,track,artist', limit: '10' }));
    spFound = [...((d.albums && d.albums.items) || []).filter(Boolean).map(fromAlbum), ...((d.tracks && d.tracks.items) || []).filter(Boolean).map(t => fromTrack(t)),
      ...((d.artists && d.artists.items) || []).filter(Boolean).map(fromArtist)];
    box.innerHTML = spFound.length ? spFound.map((x, i) => `<button type="button" class="sp-hit" data-i="${i}">
      ${x.photo ? `<img src="${safeImg(x.photo)}" alt="" loading="lazy">` : '<span class="sp-noimg">🎧</span>'}
      <span><b>${esc(x.title)}</b><small>${esc(musicLine(x.music))}</small></span></button>`).join('') : '<p class="muted">No results.</p>';
  } catch (err) { box.innerHTML = `<p class="muted">${esc(err.message)}</p>`; }
}
/* ---------- Settings UI ---------- */
function paintSpotify(busyText) {
  const box = $('#spBox'); box.hidden = !spAvailable(); if (box.hidden) return;
  const on = !!spGet(), cfg = spCfg();
  $('#spConnect').hidden = on; $('#spImport').hidden = !on; $('#spOff').hidden = !on; $('#spOpts').hidden = !on;
  $('#spImport').disabled = spBusy;
  document.querySelectorAll('[data-sp]').forEach(el => { el.checked = !!cfg[el.dataset.sp]; });
  $('#spStatus').textContent = busyText || (!on ? 'Bring your Spotify library into the Music category, and fill in music entries from a Spotify search.'
    : `Connected${cfg.user ? ' as ' + cfg.user : ''}.${cfg.lastAt ? ` Last checked ${new Date(cfg.lastAt).toLocaleString()}: ${cfg.lastMsg}.` : ''}`);
}

(function bootSpotify() {
  if (!spAvailable()) return;
  $('#spConnect').addEventListener('click', () => spConnect().catch(err => toast(err.message)));
  $('#spImport').addEventListener('click', () => spImport({ loud: true }));
  $('#spOff').addEventListener('click', () => { spSet(null); delete settings.spotify; saveSettings(); paintSpotify(); toast('Spotify disconnected. Imported entries stay.'); });
  $('#spOpts').addEventListener('change', e => { if (e.target.dataset.sp) spSave({ [e.target.dataset.sp]: e.target.checked }); });
  $('#settingsBtn').addEventListener('click', () => paintSpotify());
  $('#spFind').addEventListener('click', () => {
    $('#spQuery').value = $('#entryForm').title.value; $('#spSearch').showModal(); spRunSearch($('#spQuery').value);
  });
  $('#spQuery').addEventListener('input', e => { clearTimeout(spSearchT); spSearchT = setTimeout(() => spRunSearch(e.target.value), 400); });
  $('#spResults').addEventListener('click', e => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const x = spFound[+b.dataset.i], f = $('#entryForm');
    f.title.value = x.title; if (x.link) f.link.value = x.link;
    if (x.photo && !edPhotos.includes(x.photo)) { edPhotos.unshift(x.photo); edPhotoIdx = 0; paintPhoto(); }
    edExtra = { ...(edExtra || {}), music: x.music, extId: 'sp:' + x.key };
    closeSheet($('#spSearch'));
  });
  spHandleReturn().then(handled => {
    paintSpotify();
    const cfg = spCfg();
    if (!handled && spGet() && cfg.auto && (!cfg.lastAt || Date.now() - cfg.lastAt > 86400000)) setTimeout(() => spImport().catch(() => {}), 3000);
  });
})();
