/* Trove — visits: suggestions inbox, built-in tracking, Dawarich + Google Timeline import. MIT License. */
'use strict';

/* Visits are kept on this device only (IndexedDB store "visits"); they are never synced.
 * A visit: { key, source, name, address, lat, lng, startedAt, endedAt, state }
 * state: 'new' (waiting in the inbox) | 'added' | 'dismissed' | 'known' (place already in Trove) | 'short' | 'ignored'
 */
const visits = new Map();
const NEAR_M = 90;           // two points closer than this are "the same place"
const STAY_RADIUS_M = 80;    // tracker: staying within this radius counts as one stop
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const plugin = name => (isNative() && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null;

function vtx(mode, fn) {
  if (!db) return Promise.resolve();
  return new Promise((res, rej) => {
    const t = db.transaction('visits', mode), s = t.objectStore('visits');
    const out = fn(s);
    t.oncomplete = () => res(out && out.result);
    t.onerror = () => rej(t.error);
  });
}
const visitsPut = list => vtx('readwrite', s => list.forEach(v => s.put(v)));

function distM(a, b, c, d) {
  const R = 6371000, r = Math.PI / 180;
  const x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const vs = () => ({ mode: 'suggest', minMin: 10, ...(settings.visits || {}) });
function setVs(patch) { settings.visits = { ...vs(), ...patch }; saveSettings(); }
function visitCatId() {
  const want = vs().catId;
  if (want && catById(want) && !catById(want).deleted) return want;
  return (cats().find(c => /place/i.test(c.name)) || cats()[0] || {}).id;
}
const localDate = ms => { const d = new Date(ms); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
function fmtDur(ms) {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim();
}

/* ---------- Turning visits into entries ---------- */
function nearExistingEntry(v) {
  return entries().some(e => e.location && Number.isFinite(e.location.lat) && distM(v.lat, v.lng, e.location.lat, e.location.lng) < NEAR_M);
}
function isIgnoredPlace(v) {
  return (vs().ignored || []).some(p => distM(v.lat, v.lng, p.lat, p.lng) < (p.r || 150));
}

async function addVisitAsEntry(v) {
  const catId = visitCatId();
  if (!catId) throw new Error('Add a category first');
  const title = v.name || (v.address || '').split(',')[0] || 'Visited place';
  await save({
    id: uid(), kind: 'entry', createdAt: now(), title, categoryId: catId, status: 'done', rating: 0,
    date: localDate(v.startedAt), link: '', tags: [], notes: '', photo: null,
    location: { lat: v.lat, lng: v.lng, name: v.name || '', address: v.address || '' },
  });
  v.state = 'added';
}

// Everything that finds visits (tracker, Dawarich, Timeline file) feeds them through here.
async function lookupName(v) {
  try { const r = await geo(`reverse?lat=${v.lat}&lon=${v.lng}&zoom=18`); v.name = r.name || ''; v.address = shortAddr(r.display_name); } catch {}
  v.lookedUp = true;
}

async function ingestVisits(list, { forceSuggest = false } = {}) {
  const cfg = vs();
  const fresh = [];
  let added = 0, suggested = 0;
  for (const v of list) {
    if (!v || !Number.isFinite(v.lat) || !Number.isFinite(v.lng) || !v.startedAt || visits.has(v.key)) continue;
    v.endedAt = v.endedAt || v.startedAt;
    if (isIgnoredPlace(v)) v.state = 'ignored';
    else if (v.endedAt - v.startedAt < cfg.minMin * 60000) v.state = 'short';
    else if (nearExistingEntry(v)) v.state = 'known';
    else if ([...fresh, ...visits.values()].some(o => o.state === 'new' && distM(v.lat, v.lng, o.lat, o.lng) < NEAR_M)) v.state = 'known'; // one suggestion per place
    else if (cfg.mode === 'auto' && !forceSuggest) {
      if (!v.name && !v.address) { await lookupName(v); await new Promise(r => setTimeout(r, 1100)); }
      try { await addVisitAsEntry(v); added++; } catch { v.state = 'new'; suggested++; }
    } else { v.state = 'new'; suggested++; }
    visits.set(v.key, v); fresh.push(v);
  }
  if (fresh.length) await visitsPut(fresh);
  if (added) withTransition(render);
  renderInboxBanner();
  nameUnnamed(); // fill in place names in the background
  return { found: fresh.length, added, suggested };
}

// Look up names for visits that only have coordinates (the built-in tracker). Nominatim allows ~1 request/second.
let naming = false;
async function nameUnnamed() {
  if (naming || !navigator.onLine) return;
  naming = true;
  try {
    for (const v of [...visits.values()].filter(x => x.state === 'new' && !x.name && !x.address && !x.lookedUp).slice(0, 20)) {
      try {
        const r = await geo(`reverse?lat=${v.lat}&lon=${v.lng}&zoom=18`);
        v.name = r.name || ''; v.address = shortAddr(r.display_name);
      } catch { /* try again another time */ break; }
      v.lookedUp = true;
      await visitsPut([v]);
      if ($('#inbox').open) renderInbox();
      await new Promise(r => setTimeout(r, 1200));
    }
  } finally { naming = false; }
}

/* ---------- Inbox ---------- */
const pending = () => [...visits.values()].filter(v => v.state === 'new').sort((a, b) => b.startedAt - a.startedAt);

function renderInboxBanner() {
  const n = pending().length, b = $('#inboxBanner');
  b.hidden = n === 0;
  b.innerHTML = `<span>📍</span><b>${n} visit suggestion${n === 1 ? '' : 's'}</b><span class="chev">Review ›</span>`;
}

function renderInbox() {
  const list = pending();
  $('#inboxEmpty').hidden = list.length > 0;
  $('#inboxAddAll').hidden = list.length === 0;
  $('#inboxList').innerHTML = list.map(v => `
    <div class="visit" data-key="${esc(v.key)}">
      <div class="visit-main">
        <b>${esc(v.name || (v.address || '').split(',')[0] || 'Unnamed place')}</b>
        <small>${esc(v.address || `${v.lat.toFixed(5)}, ${v.lng.toFixed(5)}`)}</small>
        <small>${new Date(v.startedAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          · ${new Date(v.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · ${fmtDur(v.endedAt - v.startedAt)}</small>
      </div>
      <div class="visit-actions">
        <button class="btn" data-act="add">Add</button>
        <button class="btn ghost" data-act="dismiss">Dismiss</button>
        <button class="link danger small" data-act="never">Never here</button>
      </div>
    </div>`).join('');
}

async function actOnVisit(key, act) {
  const v = visits.get(key); if (!v) return;
  if (act === 'add') { await addVisitAsEntry(v); }
  else if (act === 'dismiss') v.state = 'dismissed';
  else if (act === 'never') {
    setVs({ ignored: [...(vs().ignored || []), { lat: v.lat, lng: v.lng, name: v.name || v.address || '', r: 150 }] });
    for (const o of visits.values()) if (o.state === 'new' && isIgnoredPlace(o)) o.state = 'ignored';
    await visitsPut([...visits.values()].filter(o => o.state === 'ignored'));
  }
  await visitsPut([v]);
}

/* ---------- Built-in tracking (Android app) ---------- */
let watcherId = null;
const stayLoad = () => { try { return JSON.parse(localStorage.getItem('trove.stay')) || null; } catch { return null; } };
const staySave = s => { try { s ? localStorage.setItem('trove.stay', JSON.stringify(s)) : localStorage.removeItem('trove.stay'); } catch {} };

// Called for every location fix. Works out where you stopped, without storing your route.
function onFix(loc) {
  if (!loc || !Number.isFinite(loc.latitude) || (loc.accuracy && loc.accuracy > 100)) return;
  const t = loc.time || Date.now(), lat = loc.latitude, lng = loc.longitude;
  let s = stayLoad();
  setVs({ lastFix: t });
  if (s && distM(lat, lng, s.lat, s.lng) <= STAY_RADIUS_M) {
    s.lat = (s.lat * s.n + lat) / (s.n + 1); s.lng = (s.lng * s.n + lng) / (s.n + 1); s.n++; s.last = t;
    return staySave(s);
  }
  // Moved away: the previous stop ended about now. Ignore gaps too long to trust (phone off, app closed).
  if (s && t - s.last < 12 * 3600000) {
    ingestVisits([{ key: 'tr:' + s.start, source: 'tracker', lat: s.lat, lng: s.lng, startedAt: s.start, endedAt: t }]).catch(() => {});
  }
  staySave({ lat, lng, n: 1, start: t, last: t });
}

async function startTracking() {
  const BG = plugin('BackgroundGeolocation');
  if (!BG) throw new Error('Tracking only works in the Trove Android app');
  if (watcherId) return;
  const LN = plugin('LocalNotifications');
  if (LN) { try { await LN.requestPermissions(); } catch {} } // Android 13+: needed to show the tracking notification
  watcherId = await Promise.resolve(BG.addWatcher(
    { backgroundTitle: 'Trove is noting your visits', backgroundMessage: 'Turn off in Trove → Settings → Visits.',
      requestPermissions: true, stale: false, distanceFilter: 30 },
    (loc, err) => {
      if (err) {
        if (err.code === 'NOT_AUTHORIZED') { setVs({ track: false }); toast('Location permission is off — tracking stopped'); renderVisitSettings(); }
        return;
      }
      onFix(loc);
    }));
}
async function stopTracking() {
  const BG = plugin('BackgroundGeolocation');
  if (BG && watcherId) { try { await BG.removeWatcher({ id: watcherId }); } catch {} }
  watcherId = null; staySave(null);
}

/* ---------- Dawarich ---------- */
async function dwRequest(params) {
  const { url, key } = settings.dawarich || {};
  const base = String(url || '').replace(/\/+$/, '');
  const Http = plugin('CapacitorHttp');
  if (Http) { // Android app: native request, no browser restrictions
    const r = await Http.request({ url: base + '/api/v1/visits', method: 'GET', params: Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' } });
    if (r.status === 401) throw new Error('Wrong Dawarich API key');
    if (r.status >= 400) throw new Error('Dawarich error ' + r.status);
    return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  }
  if (!settings.serverUrl) throw new Error('In a browser this needs your Trove server (Settings → Sync). The Android app can connect directly.');
  const r = await fetch(settings.serverUrl.replace(/\/+$/, '') + '/api/dawarich/visits', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (settings.token || '') },
    body: JSON.stringify({ url: base, apiKey: key, params }) });
  if (r.status === 401) throw new Error('Wrong Dawarich API key or Trove token');
  if (!r.ok) { let m = 'Dawarich error ' + r.status; try { m = (await r.json()).error || m; } catch {} throw new Error(m); }
  return r.json();
}

function dwToVisit(d) {
  const lat = Number(d.place?.latitude ?? d.center?.latitude), lng = Number(d.place?.longitude ?? d.center?.longitude);
  return { key: 'dw:' + d.id, source: 'dawarich', lat, lng, name: d.name || d.place?.name || '', address: d.place?.address || '',
    startedAt: Date.parse(d.started_at), endedAt: Date.parse(d.ended_at) };
}

async function dawarichImport({ loud = false } = {}) {
  const cfg = settings.dawarich;
  if (!cfg || !cfg.url || !cfg.key) return;
  try {
    // First time: last 90 days. After that: from a little before the last import.
    const from = new Date(cfg.lastAt ? cfg.lastAt - 3 * 86400000 : Date.now() - 90 * 86400000).toISOString();
    const to = new Date().toISOString();
    const all = [];
    for (let page = 1; page <= 20; page++) {
      const batch = await dwRequest({ start_at: from, end_at: to, page, per_page: 500 });
      if (!Array.isArray(batch)) throw new Error('Unexpected reply from Dawarich');
      all.push(...batch);
      if (batch.length < 500) break;
    }
    const res = await ingestVisits(all.filter(d => d.status !== 'declined').map(dwToVisit));
    settings.dawarich = { ...cfg, lastAt: Date.now(), lastMsg: `${res.found} new visit${res.found === 1 ? '' : 's'}` };
    saveSettings();
    if (loud) toast(res.found ? `Dawarich: ${res.added} added, ${res.suggested} to review` : 'Dawarich: nothing new');
  } catch (err) {
    if (loud) toast('Dawarich: ' + (err.message || err));
  } finally { if ($('#settings').open) renderVisitSettings(); }
}

/* ---------- Google Maps Timeline file ---------- */
function parseTimeline(data) {
  const segs = Array.isArray(data) ? data : (data.semanticSegments || []);
  const out = [];
  for (const s of segs) {
    const cand = s.visit && s.visit.topCandidate; if (!cand) continue;
    const raw = typeof cand.placeLocation === 'string' ? cand.placeLocation : cand.placeLocation && cand.placeLocation.latLng;
    const m = String(raw || '').match(/(-?\d+(?:\.\d+)?)[^\d-]+(-?\d+(?:\.\d+)?)/); // "41.7°, -89.3°" or "geo:41.7,-89.3"
    const a = Date.parse(s.startTime), b = Date.parse(s.endTime);
    if (!m || !a) continue;
    out.push({ key: `tl:${a}:${(+m[1]).toFixed(4)},${(+m[2]).toFixed(4)}`, source: 'timeline', lat: +m[1], lng: +m[2], startedAt: a, endedAt: b || a });
  }
  return out;
}

/* ---------- Settings UI ---------- */
function renderVisitSettings() {
  const cfg = vs();
  document.querySelectorAll('#visitMode button').forEach(b => b.classList.toggle('on', b.dataset.v === cfg.mode));
  $('#visitMin').value = String(cfg.minMin);
  $('#visitCat').innerHTML = cats().map(c => `<option value="${esc(c.id)}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('');
  $('#visitCat').value = visitCatId() || '';
  const can = !!plugin('BackgroundGeolocation');
  $('#trackToggle').checked = !!cfg.track && can;
  $('#trackToggle').disabled = !can;
  $('#trackNote').textContent = can
    ? 'Notes where you stop while Trove is open or in the background. Shows a notification while on. It does not save your route.'
    : 'Only available in the Trove Android app.';
  $('#trackStatus').textContent = cfg.track && can
    ? (cfg.lastFix ? `Tracking on · last location ${new Date(cfg.lastFix).toLocaleString()}` : 'Tracking on · waiting for the first location')
    : '';
  const dw = settings.dawarich || {};
  $('#dwUrl').value = dw.url || ''; $('#dwKey').value = dw.key || ''; $('#dwAuto').checked = dw.auto !== false;
  $('#dwStatus').textContent = dw.url ? (dw.lastAt ? `Last checked ${new Date(dw.lastAt).toLocaleString()} · ${dw.lastMsg || ''}` : 'Not checked yet') : '';
  const ig = (cfg.ignored || []).length;
  $('#ignoredRow').innerHTML = ig ? `${ig} place${ig === 1 ? '' : 's'} set to "never suggest". <button class="link small" id="ignoredClear">Reset</button>` : '';
  const n = pending().length;
  $('#inboxOpen').textContent = n ? `Review suggestions (${n})` : 'Review suggestions';
}

function openInbox() { renderInbox(); if (!$('#inbox').open) $('#inbox').showModal(); }

function bindVisits() {
  $('#inboxBanner').addEventListener('click', openInbox);
  $('#inboxOpen').addEventListener('click', openInbox);
  $('#inboxList').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const row = b.closest('.visit');
    try { await actOnVisit(row.dataset.key, b.dataset.act); } catch (err) { toast(err.message); return; }
    row.classList.add('leaving');
    setTimeout(() => { renderInbox(); renderInboxBanner(); if (b.dataset.act === 'add') withTransition(render); }, 220);
  });
  $('#inboxAddAll').addEventListener('click', async () => {
    const list = pending();
    if (!list.length || !confirm(`Add all ${list.length} places to Trove?`)) return;
    try { for (const v of list) await addVisitAsEntry(v); } catch (err) { toast(err.message); }
    await visitsPut(list);
    renderInbox(); renderInboxBanner(); withTransition(render);
    toast(`Added ${list.filter(v => v.state === 'added').length} places`);
  });

  $('#visitMode').addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    setVs({ mode: b.dataset.v }); renderVisitSettings();
    const n = pending().length;
    if (b.dataset.v === 'auto' && n) toast(`${n} earlier suggestion${n === 1 ? ' is' : 's are'} still waiting for review`);
  });
  $('#visitMin').addEventListener('change', e => setVs({ minMin: +e.target.value }));
  $('#visitCat').addEventListener('change', e => setVs({ catId: e.target.value }));
  $('#trackToggle').addEventListener('change', async e => {
    try {
      if (e.target.checked) { await startTracking(); setVs({ track: true }); toast('Tracking on'); }
      else { await stopTracking(); setVs({ track: false }); toast('Tracking off'); }
    } catch (err) { setVs({ track: false }); toast(err.message || String(err)); }
    renderVisitSettings();
  });
  $('#dwSave').addEventListener('click', () => {
    const url = $('#dwUrl').value.trim(), key = $('#dwKey').value.trim();
    if (!url || !key) { toast('Enter the Dawarich URL and API key'); return; }
    const old = settings.dawarich || {};
    settings.dawarich = { url, key, auto: $('#dwAuto').checked, lastAt: url === old.url ? old.lastAt : 0 };
    saveSettings(); dawarichImport({ loud: true });
  });
  $('#dwAuto').addEventListener('change', e => { if (settings.dawarich) { settings.dawarich.auto = e.target.checked; saveSettings(); } });
  $('#dwOff').addEventListener('click', () => { delete settings.dawarich; saveSettings(); renderVisitSettings(); toast('Dawarich disconnected'); });
  $('#tlInput').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const found = parseTimeline(JSON.parse(await file.text()));
      if (!found.length) throw new Error('No visits found in that file');
      const big = found.length > 25; // big files always go to review, so hundreds of entries aren't added at once
      const res = await ingestVisits(found, { forceSuggest: big });
      toast(`Timeline: ${res.added} added, ${res.suggested} to review`);
    } catch (err) { toast('Import failed: ' + err.message); }
    e.target.value = ''; renderVisitSettings();
  });
  $('#ignoredRow').addEventListener('click', e => { if (e.target.id === 'ignoredClear') { setVs({ ignored: [] }); renderVisitSettings(); } });
}

async function visitsBoot() {
  try { (await vtx('readonly', s => s.getAll()) || []).forEach(v => visits.set(v.key, v)); } catch {}
  bindVisits();
  renderInboxBanner();
  if (vs().track) startTracking().catch(() => {});
  if (settings.dawarich && settings.dawarich.auto !== false) dawarichImport().catch(() => {});
  nameUnnamed();
}
