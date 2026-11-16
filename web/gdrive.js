/* Trove — Google sign-in and automatic sync through the user's own Google Drive. MIT License.
 *
 * Each item (entry or category) is one small file in Drive's hidden per-app folder ("appDataFolder").
 * The file's appProperties.u holds the item's updatedAt, so a sync is: list files, download the ones
 * that are newer than ours, upload the ones of ours that are newer. Last write wins, same as the server sync.
 */
'use strict';

const GCFG = window.TROVE_CONFIG || {};
const G_SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file';
const G_API = 'https://www.googleapis.com';
const gNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const gAvailable = () => !!GCFG.googleClientId && !gNative() && (GCFG.googleOrigins || []).includes(location.origin);

let gTokenClient = null, gToken = null, gSyncing = false, gTimer = null, gAgain = false, gPendingAuth = null;

function gLoadToken() {
  try { const t = JSON.parse(localStorage.getItem('trove.gtoken')); if (t && t.exp > Date.now() + 60000) gToken = t; } catch {}
}
function gSaveToken(t) { gToken = t; try { t ? localStorage.setItem('trove.gtoken', JSON.stringify(t)) : localStorage.removeItem('trove.gtoken'); } catch {} }
const gTokenValid = () => !!(gToken && gToken.exp > Date.now() + 60000);

function gLoadLib() {
  return new Promise((res, rej) => {
    if (window.google && google.accounts && google.accounts.oauth2) return res();
    const el = document.createElement('script');
    el.src = 'https://accounts.google.com/gsi/client'; el.async = true;
    el.onload = () => res(); el.onerror = () => rej(new Error('Could not reach Google'));
    document.head.appendChild(el);
  });
}

// Ask Google for an access token. interactive=false tries quietly (no account picker).
function gAuth(interactive) {
  if (gTokenValid()) return Promise.resolve(gToken.token);
  if (gPendingAuth) return gPendingAuth;
  gPendingAuth = new Promise((res, rej) => {
    if (!gTokenClient) return rej(new Error('Google sign-in is still loading — try again in a moment'));
    const timer = setTimeout(() => rej(new Error('Sign-in timed out')), 120000);
    gTokenClient.callback = r => {
      clearTimeout(timer);
      if (r.error) return rej(new Error(r.error === 'access_denied' ? 'Sign-in was cancelled' : r.error_description || r.error));
      gSaveToken({ token: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 });
      res(r.access_token);
    };
    gTokenClient.error_callback = e => { clearTimeout(timer); rej(new Error(e.type === 'popup_failed_to_open' ? 'popup-blocked' : e.type === 'popup_closed' ? 'Sign-in was cancelled' : (e.message || 'Sign-in failed'))); };
    gTokenClient.requestAccessToken({ prompt: interactive && !settings.google ? 'select_account' : '', login_hint: settings.google ? settings.google.email : undefined });
  }).finally(() => { gPendingAuth = null; });
  return gPendingAuth;
}

async function gFetch(url, opts = {}, interactive = false) {
  const token = await gAuth(interactive);
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + token } });
  if (r.status === 401) { gSaveToken(null); throw new Error('reauth'); }
  if (!r.ok) {
    let msg = 'Google Drive error ' + r.status;
    try { msg = (await r.json()).error.message || msg; } catch {}
    throw new Error(msg);
  }
  return r;
}

/* ---------- Drive files ---------- */
async function gList(interactive) {
  const byName = new Map();
  let pageToken = '';
  do {
    const q = new URLSearchParams({ spaces: 'appDataFolder', pageSize: '1000', fields: 'nextPageToken,files(id,name,appProperties)' });
    if (pageToken) q.set('pageToken', pageToken);
    const d = await (await gFetch(`${G_API}/drive/v3/files?${q}`, {}, interactive)).json();
    for (const f of d.files || []) {
      if (!f.name.endsWith('.json')) continue;
      const rec = { fileId: f.id, u: Number(f.appProperties && f.appProperties.u) || 0 };
      const cur = byName.get(f.name);
      if (!cur || rec.u > cur.u) byName.set(f.name, rec);   // if two devices raced, the newer copy wins
    }
    pageToken = d.nextPageToken || '';
  } while (pageToken);
  return byName;
}
const gName = id => encodeURIComponent(id) + '.json';

function gUpload(item, fileId) {
  const { dirty, ...clean } = item;
  const meta = { appProperties: { u: String(item.updatedAt || 0) } };
  if (!fileId) { meta.name = gName(item.id); meta.parents = ['appDataFolder']; }
  const b = 'trove' + Math.random().toString(36).slice(2);
  const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(clean)}\r\n--${b}--`;
  return gFetch(`${G_API}/upload/drive/v3/files${fileId ? '/' + fileId : ''}?uploadType=multipart&fields=id`,
    { method: fileId ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${b}` }, body });
}
async function gDownload(fileId) { return (await gFetch(`${G_API}/drive/v3/files/${fileId}?alt=media`)).json(); }

async function pool(list, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) await fn(list[i++]); }));
}

/* ---------- Sync ---------- */
async function driveSync({ loud = false, interactive = false } = {}) {
  if (!settings.google || !gAvailable()) return;
  if (gSyncing) { gAgain = true; return; }
  gSyncing = true; $('#syncBtn').classList.add('spin');
  try {
    const remote = await gList(interactive);
    const pull = [], push = [];
    for (const [name, r] of remote) {
      const local = items.get(decodeURIComponent(name.slice(0, -5)));
      if (!local || r.u > (local.updatedAt || 0)) pull.push(r);
    }
    for (const it of items.values()) {
      if (it.kind !== 'cat' && it.kind !== 'entry') continue;
      const r = remote.get(gName(it.id));
      if (!r ? (it.updatedAt || 0) > 0 : (it.updatedAt || 0) > r.u) push.push([it, r && r.fileId]);
    }
    const got = [];
    await pool(pull, 4, async r => {
      const it = await gDownload(r.fileId);
      if (!it || !it.id || !['cat', 'entry'].includes(it.kind)) return;
      const cur = items.get(it.id);
      if (cur && (cur.updatedAt || 0) >= (it.updatedAt || 0)) return;   // changed here while downloading
      got.push({ ...it, dirty: cur ? cur.dirty : !!settings.serverUrl });
    });
    got.forEach(it => items.set(it.id, it));
    if (got.length) { await dbPutMany(got); withTransition(render); }
    await pool(push, 4, ([it, fileId]) => gUpload(it, fileId));
    settings.google = { ...settings.google, lastSyncAt: Date.now(), needsSignIn: false };
    saveSettings();
    if (loud) toast(`Synced ✓ (${push.length} sent, ${got.length} received)`);
  } catch (err) {
    const quiet = err.message === 'reauth' || err.message === 'popup-blocked' || /cancel|timed out/i.test(err.message);
    if (quiet && settings.google) { settings.google.needsSignIn = true; saveSettings(); armReauth(); }
    if (loud) toast(quiet ? 'Tap Sign in to reconnect Google' : 'Sync failed: ' + err.message);
  } finally {
    gSyncing = false; $('#syncBtn').classList.remove('spin');
    paintAccount();
    if (gAgain) { gAgain = false; scheduleDrive(500); }
  }
}
// Google's web sign-in lasts about an hour and can only be renewed during a tap (browsers block
// pop-ups otherwise). So when it lapses, renew on the user's next tap: a Google window flashes and closes.
let reauthArmed = false;
function armReauth() {
  if (reauthArmed) return; reauthArmed = true;
  document.addEventListener('pointerup', () => { reauthArmed = false; if (settings.google && !gTokenValid()) driveSync(); }, { once: true, capture: true });
}
function scheduleDrive(delay = 2500) {
  if (!settings.google || !gAvailable()) return;
  clearTimeout(gTimer);
  gTimer = setTimeout(() => driveSync().catch(() => {}), delay);
}

/* ---------- Sign in / out ---------- */
async function googleSignIn() {
  const msg = $('#gateMsg'); msg.textContent = '';
  try {
    await gAuth(true);
    const me = (await (await gFetch(`${G_API}/drive/v3/about?fields=user(displayName,emailAddress)`)).json()).user || {};
    settings.google = { email: me.emailAddress || '', name: me.displayName || '', lastSyncAt: 0 };
    if (!settings.shareName && me.displayName) settings.shareName = me.displayName.split(' ')[0];
    saveSettings();
    $('#gate').hidden = true;
    render(); paintAccount();
    await driveSync({ loud: true });
  } catch (err) {
    const text = err.message === 'popup-blocked' ? 'Your browser blocked the Google window. Allow pop-ups for this site and try again.' : err.message;
    msg.textContent = text; if ($('#gate').hidden) toast(text);
    paintAccount();
  }
}
function googleSignOut() {
  if (!confirm('Sign out? Your journal stays on this device and in your Google Drive.')) return;
  try { if (gToken && window.google) google.accounts.oauth2.revoke(gToken.token, () => {}); } catch {}
  gSaveToken(null); delete settings.google; saveSettings();
  document.querySelectorAll('dialog[open]').forEach(d => d.close()); // the sign-in screen sits under open sheets
  render(); paintAccount(); showGate();
}

function paintAccount() {
  const box = $('#acctBox'); box.hidden = !gAvailable(); if (box.hidden) return;
  const g = settings.google;
  $('#acctSignIn').hidden = !!g && !g.needsSignIn;
  $('#acctSignIn').textContent = g ? 'Sign in again' : 'Sign in with Google';
  $('#acctSync').hidden = !g; $('#acctSignOut').hidden = !g;
  $('#acctStatus').textContent = !g ? 'Sign in to sync your journal across your devices with your own Google Drive.'
    : g.needsSignIn ? `${g.email} — Google needs you to sign in again to keep syncing.`
    : `Signed in as ${g.email}. ${g.lastSyncAt ? 'Last synced ' + new Date(g.lastSyncAt).toLocaleString() + '.' : 'Syncing…'} Changes sync automatically.`;
}
function showGate() { $('#gate').hidden = !gAvailable() || !!settings.google || !!settings.gateSkipped; }

(function bootGoogle() {
  if (!gAvailable()) return;
  gLoadToken();
  showGate(); paintAccount();
  $('#gateSignIn').addEventListener('click', googleSignIn);
  $('#acctSignIn').addEventListener('click', googleSignIn);
  $('#gateSkip').addEventListener('click', () => { settings.gateSkipped = true; saveSettings(); showGate(); });
  $('#acctSync').addEventListener('click', () => driveSync({ loud: true, interactive: true }));
  $('#acctSignOut').addEventListener('click', googleSignOut);
  $('#settingsBtn').addEventListener('click', paintAccount);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleDrive(800); });
  window.addEventListener('online', () => scheduleDrive(800));
  gLoadLib().then(() => {
    gTokenClient = google.accounts.oauth2.initTokenClient({ client_id: GCFG.googleClientId, scope: G_SCOPES, callback: () => {} });
    if (settings.google) scheduleDrive(600);
  }).catch(() => { $('#gateMsg').textContent = 'Could not reach Google. Check your connection.'; });
})();
