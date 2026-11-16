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
const gAndroid = () => gNative() && !!GCFG.googleAndroidClientId && (!window.Capacitor.getPlatform || window.Capacitor.getPlatform() === 'android');
const gAvailable = () => gAndroid() || (!!GCFG.googleClientId && !gNative() && (GCFG.googleOrigins || []).includes(location.origin));
const gPlugin = n => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[n]) || null;

let gTokenClient = null, gToken = null, gSyncing = false, gTimer = null, gAgain = false, gPendingAuth = null;

function gLoadToken() {
  try { const t = JSON.parse(localStorage.getItem('trove.gtoken')); if (t && (t.exp > Date.now() + 60000 || t.refresh)) gToken = t; } catch {}
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

/* ---------- Android app sign-in ----------
 * Google doesn't allow its sign-in page inside an app's own web view, so the app opens it in the phone's
 * browser and Google hands the result back through a private link (the "custom URI scheme" of the Android
 * OAuth client). That yields a refresh token, so the app stays signed in without asking again. */
const G_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const gRedirect = () => `com.googleusercontent.apps.${GCFG.googleAndroidClientId.replace('.apps.googleusercontent.com', '')}:/oauth2redirect`;
const gB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let gNativeWait = null;

async function gPostForm(url, params) {
  let r;
  try {
    r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  } catch (err) {                       // blocked by the web view: send it natively instead
    const Http = gPlugin('CapacitorHttp'); if (!Http) throw err;
    const n = await Http.request({ url, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, data: params });
    const d = typeof n.data === 'string' ? JSON.parse(n.data || '{}') : (n.data || {});
    if (n.status >= 400) throw new Error(d.error_description || d.error || 'Google sign-in failed');
    return d;
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error_description || d.error || 'Google sign-in failed'), { code: d.error });
  return d;
}
function gStoreNative(d) {
  gSaveToken({ token: d.access_token, exp: Date.now() + (Number(d.expires_in) || 3600) * 1000, refresh: d.refresh_token || (gToken && gToken.refresh) });
  return d.access_token;
}
async function gNativeStart() {
  const verifier = gB64(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = gB64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = gB64(crypto.getRandomValues(new Uint8Array(12)));
  localStorage.setItem('trove.g.pkce', JSON.stringify({ verifier, state }));
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: GCFG.googleAndroidClientId, redirect_uri: gRedirect(), response_type: 'code', scope: G_SCOPES,
    code_challenge: challenge, code_challenge_method: 'S256', state, ...(settings.google ? { login_hint: settings.google.email } : {}) });
  const Browser = gPlugin('Browser');
  if (Browser) await Browser.open({ url }); else window.open(url, '_system');
}
// Called when Google sends the phone back to Trove.
async function gNativeReturn(link) {
  if (!link || !link.startsWith(gRedirect().split(':')[0] + ':')) return false;
  const q = new URLSearchParams(link.split('?')[1] || '');
  let saved = null; try { saved = JSON.parse(localStorage.getItem('trove.g.pkce')); } catch {}
  localStorage.removeItem('trove.g.pkce');
  const wait = gNativeWait; gNativeWait = null;
  const B = gPlugin('Browser'); if (B && B.close) { try { await B.close(); } catch {} }
  try {
    if (q.get('error')) throw new Error(q.get('error') === 'access_denied' ? 'Sign-in was cancelled' : q.get('error'));
    if (!saved || q.get('state') !== saved.state || !q.get('code')) throw new Error('Sign-in did not complete — try again');
    const token = gStoreNative(await gPostForm(G_TOKEN_URL, { client_id: GCFG.googleAndroidClientId, code: q.get('code'),
      code_verifier: saved.verifier, grant_type: 'authorization_code', redirect_uri: gRedirect() }));
    if (wait) wait.res(token); else googleSignIn();     // app was restarted while the browser was open: finish signing in
  } catch (err) { if (wait) wait.rej(err); else toast(err.message); }
  return true;
}
async function gNativeAuth(interactive) {
  if (gToken && gToken.refresh) {
    try { return gStoreNative(await gPostForm(G_TOKEN_URL, { client_id: GCFG.googleAndroidClientId, grant_type: 'refresh_token', refresh_token: gToken.refresh })); }
    catch (err) { if (err.code !== 'invalid_grant') throw err; gSaveToken(null); }   // Google ended the session: sign in again
  }
  if (!interactive) throw new Error('reauth');
  return new Promise((res, rej) => {
    gNativeWait = { res, rej };
    setTimeout(() => { if (gNativeWait && gNativeWait.rej === rej) { gNativeWait = null; rej(new Error('Sign-in timed out')); } }, 300000);
    gNativeStart().catch(rej);
  });
}

// Ask Google for an access token. interactive=false tries quietly (no account picker).
function gAuth(interactive) {
  if (gTokenValid()) return Promise.resolve(gToken.token);
  if (gPendingAuth) return gPendingAuth;
  if (gAndroid()) { gPendingAuth = gNativeAuth(interactive).finally(() => { gPendingAuth = null; }); return gPendingAuth; }
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

async function gFetch(url, opts = {}, interactive = false, retried = false) {
  const token = await gAuth(interactive);
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + token } });
  if (r.status === 401) {
    if (gToken && gToken.refresh && !retried) { gToken.exp = 0; return gFetch(url, opts, interactive, true); }   // refresh and try once more
    gSaveToken(gToken && gToken.refresh ? { ...gToken, exp: 0 } : null); throw new Error('reauth');
  }
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
    const text = err.message === 'reauth' ? 'Sign-in did not complete — try again' : err.message === 'popup-blocked' ? 'Your browser blocked the Google window. Allow pop-ups for this site and try again.' : err.message;
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
function showGate() { $('#gate').hidden = gNative() || !gAvailable() || !!settings.google || !!settings.gateSkipped; }   // the app itself opens straight to your journal

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
  if (gAndroid()) {
    const App = gPlugin('App');
    if (App && App.addListener) App.addListener('appUrlOpen', e => { gNativeReturn(e && e.url); });
    if (App && App.getLaunchUrl) App.getLaunchUrl().then(r => { if (r && r.url && localStorage.getItem('trove.g.pkce')) gNativeReturn(r.url); }).catch(() => {});
    if (settings.google) scheduleDrive(600);
    return;
  }
  gLoadLib().then(() => {
    gTokenClient = google.accounts.oauth2.initTokenClient({ client_id: GCFG.googleClientId, scope: G_SCOPES, callback: () => {} });
    if (settings.google) scheduleDrive(600);
  }).catch(() => { $('#gateMsg').textContent = 'Could not reach Google. Check your connection.'; });
})();
