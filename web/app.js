/* Trove — open-source journal for everything you love. MIT License. */
'use strict';

/* ---------- Storage (IndexedDB) ---------- */
const DB_NAME = 'trove', STORE = 'items';
let db;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx(mode, fn) {
  if (!db) return Promise.resolve([]); // in-memory fallback when IndexedDB is blocked
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), s = t.objectStore(STORE);
    const out = fn(s);
    t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
    t.onerror = () => rej(t.error);
  });
}
const dbAll = () => tx('readonly', s => s.getAll());
const dbPutMany = items => tx('readwrite', s => items.forEach(i => s.put(i)));

/* ---------- State ---------- */
const items = new Map();            // id -> item (categories + entries, incl. tombstones)
const ui = { cat: '', status: '', tag: '', q: '', sort: 'recent', map: false };
const settings = loadSettings();

const DEFAULT_CATS = [
  ['📚', 'Books'], ['📍', 'Places'], ['🍜', 'Food'], ['🎬', 'Movies & TV'], ['🎮', 'Games'], ['🎧', 'Music'],
];
const STATUS = { want: 'Want to', doing: 'In progress', done: 'Done' };

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const now = () => Date.now();
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function loadSettings() {
  try { return JSON.parse(localStorage.getItem('trove.settings')) || {}; } catch { return {}; }
}
function saveSettings() {
  try { localStorage.setItem('trove.settings', JSON.stringify(settings)); } catch {}
}

const cats = () => [...items.values()].filter(i => i.kind === 'cat' && !i.deleted).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
const entries = () => [...items.values()].filter(i => i.kind === 'entry' && !i.deleted);
const catById = id => items.get(id);

async function save(item) {
  item.updatedAt = now();
  item.dirty = true;
  items.set(item.id, item);
  await dbPutMany([item]);
  scheduleSync();
}

/* ---------- Rendering ---------- */
function renderChips() {
  const el = $('#catChips');
  const all = [{ id: '', emoji: '✨', name: 'All' }, ...cats()];
  el.innerHTML = all.map(c =>
    `<button class="chip ${ui.cat === c.id ? 'on' : ''}" data-cat="${esc(c.id)}">${esc(c.emoji)} ${esc(c.name)}</button>`
  ).join('');
}

function stars(n) { return n ? '★'.repeat(n) + '☆'.repeat(5 - n) : ''; }

function filtered() {
  let list = entries();
  if (ui.cat) list = list.filter(e => e.categoryId === ui.cat);
  if (ui.status) list = list.filter(e => e.status === ui.status);
  if (ui.tag) list = list.filter(e => (e.tags || []).includes(ui.tag));
  const q = ui.q.trim().toLowerCase();
  if (q) {
    const terms = q.split(/\s+/);
    list = list.filter(e => {
      const hay = [e.title, e.notes, e.link, e.location?.name, e.location?.address, ...(e.tags || []).map(t => '#' + t), catById(e.categoryId)?.name].join(' ').toLowerCase();
      return terms.every(t => hay.includes(t));
    });
  }
  const by = {
    recent: (a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt,
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title),
    title: (a, b) => a.title.localeCompare(b.title),
  }[ui.sort];
  return list.sort(by);
}

const vtName = id => 'c' + String(id).replace(/[^a-zA-Z0-9_-]/g, '');
function cardHTML(e, i = 0) {
  const c = catById(e.categoryId);
  const media = e.photo
    ? `<img class="thumb" src="${e.photo}" alt="" loading="lazy">`
    : `<div class="ph">${esc(c?.emoji || '✨')}</div>`;
  return `<button class="card" data-id="${esc(e.id)}" style="--d:${Math.min(i, 12) * 35}ms;view-transition-name:${vtName(e.id)}">
    ${media}
    <div class="body">
      <h4>${esc(e.title)}</h4>
      ${e.location ? `<div class="place">📍 ${esc(e.location.name || e.location.address || 'Pinned')}</div>` : ''}
      <div class="meta"><span class="stars">${stars(e.rating)}</span><span class="badge ${e.status}">${STATUS[e.status] || ''}</span></div>
      ${e.tags?.length ? `<div class="tags">${e.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
    </div></button>`;
}

// "Shelves": one row per category, entries shown as a swipeable card deck.
function shelfMode() { return !ui.map && !ui.cat && !ui.q.trim() && !ui.tag && entries().length > 0; }

function renderShelves(list) {
  const collapsed = new Set(settings.collapsed || []);
  return cats().map(c => {
    const mine = list.filter(e => e.categoryId === c.id);
    const closed = collapsed.has(c.id);
    const cards = mine.map((e, i) => cardHTML(e, i)).join('') +
      `<button class="card add-card" data-add="${esc(c.id)}" style="--d:${Math.min(mine.length, 12) * 35}ms"><span>＋</span><small>Add to ${esc(c.name)}</small></button>`;
    return `<section class="shelf ${closed ? 'closed' : ''}" data-shelf="${esc(c.id)}">
      <div class="shelf-head">
        <button class="shelf-title" data-open-cat="${esc(c.id)}">${esc(c.emoji)} ${esc(c.name)} <span class="chev">›</span></button>
        <span class="count">${mine.length} ${mine.length === 1 ? 'entry' : 'entries'}</span>
        <button class="shelf-toggle" data-toggle="${esc(c.id)}" aria-label="Collapse">⌄</button>
      </div>
      <div class="shelf-body"><div class="deck"><div class="deck-track">${cards}</div></div></div>
    </section>`;
  }).join('');
}

// Deck effect: cards that run off the right edge stack up into a fanned pile.
const DECK = { w: 150, gap: 12, peek: 14, maxStack: 6 };
function layoutDeck(deck) {
  const track = deck.firstElementChild; if (!track) return;
  const cardsEls = [...track.children];
  const step = DECK.w + DECK.gap;
  track.style.width = (cardsEls.length * step + DECK.gap) + 'px';
  const vw = deck.clientWidth, sl = deck.scrollLeft;
  const edge = Math.max(0, vw - DECK.w - DECK.gap - DECK.peek * 3);
  cardsEls.forEach((el, i) => {
    let x = DECK.gap + i * step - sl, scale = 1, z = 100, op = 1;
    if (x > edge) {
      const k = (x - edge) / step;                         // how many cards "past" the edge
      x = edge + Math.min(k, DECK.maxStack) * DECK.peek;
      scale = 1 - Math.min(k, DECK.maxStack) * 0.045;
      z = 100 - Math.ceil(k);
      op = k > DECK.maxStack ? 0 : 1;
    } else if (x < 0) {
      const k = -x / step;                                 // cards scrolled away on the left
      x = -Math.min(k, 3) * 8;
      scale = 1 - Math.min(k, 3) * 0.05;
      z = 100 - Math.ceil(k);
      op = k > 3 ? 0 : 1;
    }
    el.style.transform = `translateX(${x + sl}px) scale(${scale})`;
    el.style.zIndex = z;
    el.style.opacity = op;
  });
}
function layoutAllDecks() { document.querySelectorAll('.deck').forEach(layoutDeck); }

// Smoothly animate between list states where the browser supports it.
function withTransition(fn) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.startViewTransition && !reduce) document.startViewTransition(fn); else fn();
}

function render() {
  renderChips();
  const list = filtered();
  const shelves = shelfMode();
  const el = $('#list');
  el.className = shelves ? 'shelves' : 'grid';
  el.innerHTML = shelves ? renderShelves(list) : list.map((e, i) => cardHTML(e, i)).join('');
  if (shelves) {
    el.querySelectorAll('.deck').forEach(d => {
      d.addEventListener('scroll', () => requestAnimationFrame(() => layoutDeck(d)), { passive: true });
    });
    layoutAllDecks();
  }
  const empty = $('#empty');
  empty.hidden = shelves || list.length > 0;
  empty.textContent = entries().length ? 'Nothing matches those filters.' : 'Your trove is empty. Tap + to add your first book, place, or meal.';
  const at = $('#activeTag');
  at.hidden = !ui.tag;
  at.innerHTML = ui.tag ? `Tag: <b>#${esc(ui.tag)}</b> <button id="clearTag">✕ clear</button>` : '';
  $('#syncBtn').hidden = !settings.serverUrl;
  $('#list').hidden = ui.map;
  $('#placesMapWrap').hidden = !ui.map;
  $('#mapToggle').classList.toggle('on', ui.map);
  if (ui.map) { empty.hidden = true; renderPlacesMap(list); }
}

/* ---------- Maps (Leaflet + OpenStreetMap) ---------- */
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const hasLeaflet = () => typeof L !== 'undefined';
let placesMap, placesLayer;

function renderPlacesMap(list) {
  if (!hasLeaflet()) { $('#mapEmptyNote').hidden = false; $('#mapEmptyNote').textContent = 'Map could not load (offline?).'; return; }
  if (!placesMap) {
    placesMap = L.map('placesMap', { zoomControl: true }).setView([39.5, -98.35], 4);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(placesMap);
    placesLayer = L.featureGroup().addTo(placesMap);
  }
  setTimeout(() => placesMap.invalidateSize(), 0);
  placesLayer.clearLayers();
  const withLoc = list.filter(e => e.location && Number.isFinite(e.location.lat));
  $('#mapEmptyNote').hidden = withLoc.length > 0;
  $('#mapEmptyNote').textContent = 'No entries with a location match these filters yet.';
  for (const e of withLoc) {
    const c = catById(e.categoryId);
    const pop = document.createElement('div');
    pop.className = 'map-pop';
    pop.innerHTML = (e.photo ? `<img src="${e.photo}" alt="">` : `<span class="e">${esc(c?.emoji || '📍')}</span>`) +
      `<div><b>${esc(e.title)}</b><br><small>${stars(e.rating) || esc(STATUS[e.status] || '')}</small></div>`;
    pop.addEventListener('click', () => openEditor(items.get(e.id)));
    L.marker([e.location.lat, e.location.lng]).bindPopup(pop).addTo(placesLayer);
  }
  if (withLoc.length) {
    setTimeout(() => placesMap.fitBounds(placesLayer.getBounds().pad(0.2), { maxZoom: 15 }), 50);
  }
}

// --- Location picker ---
let pickMap, pickMarker, pick = null, searchT, searchAbort;

async function geo(path) {
  const r = await fetch('https://nominatim.openstreetmap.org/' + path + '&format=jsonv2&addressdetails=0',
    { headers: { 'Accept-Language': navigator.language || 'en' }, signal: searchAbort?.signal });
  if (!r.ok) throw new Error('Search unavailable');
  return r.json();
}
function shortAddr(full) { return (full || '').split(',').slice(0, 4).join(',').trim(); }

function setPick(lat, lng, { name, address, zoom } = {}) {
  pick = { lat: +lat.toFixed(6), lng: +lng.toFixed(6), name: name ?? pick?.name ?? '', address: address ?? '' };
  if (!pickMarker) {
    pickMarker = L.marker([lat, lng], { draggable: true }).addTo(pickMap);
    pickMarker.on('dragend', () => { const p = pickMarker.getLatLng(); setPick(p.lat, p.lng); reverse(p.lat, p.lng); });
  } else pickMarker.setLatLng([lat, lng]);
  pickMap.setView([lat, lng], zoom || Math.max(pickMap.getZoom(), 15));
  if (name !== undefined) $('#locLabel').value = name;
  $('#locChosenAddr').textContent = pick.address || `${pick.lat}, ${pick.lng}`;
}

async function reverse(lat, lng) {
  $('#locChosenAddr').textContent = 'Looking up address…';
  try {
    const r = await geo(`reverse?lat=${lat}&lon=${lng}&zoom=18`);
    if (pick) { pick.address = shortAddr(r.display_name); $('#locChosenAddr').textContent = pick.address; }
    if (!$('#locLabel').value && r.name) $('#locLabel').value = r.name;
  } catch { $('#locChosenAddr').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
}

function openLocPicker() {
  if (!hasLeaflet()) { toast('Map needs an internet connection the first time'); return; }
  $('#locPicker').showModal();
  $('#locQuery').value = ''; $('#locResults').hidden = true;
  if (!pickMap) {
    pickMap = L.map('pickMap').setView([39.5, -98.35], 4);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 }).addTo(pickMap);
    pickMap.on('click', ev => { setPick(ev.latlng.lat, ev.latlng.lng, { name: '' }); reverse(ev.latlng.lat, ev.latlng.lng); });
  }
  setTimeout(() => pickMap.invalidateSize(), 50);
  const cur = edLocation;
  if (cur) { setPick(cur.lat, cur.lng, { name: cur.name, address: cur.address, zoom: 16 }); }
  else {
    pick = null; $('#locLabel').value = '';
    if (pickMarker) { pickMarker.remove(); pickMarker = null; }
    $('#locChosenAddr').textContent = 'Search, tap the map, or drag the pin.';
    locateMe(true);
  }
}

function locateMe(quiet) {
  if (!navigator.geolocation) { if (!quiet) toast('Location not available'); return; }
  navigator.geolocation.getCurrentPosition(
    p => {
      const { latitude: lat, longitude: lng } = p.coords;
      if (quiet && !pick) { pickMap.setView([lat, lng], 14); return; } // just center the map
      setPick(lat, lng, { name: '' }); reverse(lat, lng);
    },
    () => { if (!quiet) toast('Could not get your location — check permissions'); },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

function runSearch(q) {
  clearTimeout(searchT);
  if (q.trim().length < 3) { $('#locResults').hidden = true; return; }
  searchT = setTimeout(async () => {
    searchAbort?.abort(); searchAbort = new AbortController();
    try {
      // Bias results toward what's visible on the map.
      const b = pickMap.getBounds();
      const vb = `${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}`;
      const res = await geo(`search?q=${encodeURIComponent(q)}&limit=8&viewbox=${vb}`);
      const ul = $('#locResults');
      ul.innerHTML = res.length ? res.map((r, i) =>
        `<li data-i="${i}"><b>${esc(r.name || r.display_name.split(',')[0])}</b><small>${esc(shortAddr(r.display_name))}</small></li>`).join('')
        : '<li><small>No results. Try adding a city.</small></li>';
      ul.hidden = false;
      ul.onclick = ev => {
        const li = ev.target.closest('[data-i]'); if (!li) return;
        const r = res[+li.dataset.i];
        setPick(+r.lat, +r.lon, { name: r.name || r.display_name.split(',')[0], address: shortAddr(r.display_name), zoom: 16 });
        ul.hidden = true;
      };
    } catch (err) { if (err.name !== 'AbortError') toast(err.message); }
  }, 450);
}

let edLocation = null;
function paintLocation() {
  $('#locName').textContent = edLocation ? (edLocation.name || 'Pinned location') : 'Add a location';
  $('#locAddr').textContent = edLocation ? (edLocation.address || `${edLocation.lat}, ${edLocation.lng}`) : '';
  $('#locClear').hidden = !edLocation;
}

/* ---------- Editor ---------- */
let editing = null, edPhoto = null, edRating = 0, edStatus = 'want';

function openEditor(entry, presetCat) {
  editing = entry || null;
  const f = $('#entryForm');
  f.reset();
  $('#editorTitle').textContent = entry ? 'Edit entry' : 'New entry';
  $('#catSelect').innerHTML = cats().map(c => `<option value="${esc(c.id)}">${esc(c.emoji)} ${esc(c.name)}</option>`).join('');
  f.title.value = entry?.title || '';
  f.categoryId.value = entry?.categoryId || presetCat || ui.cat || cats()[0]?.id || '';
  f.date.value = entry?.date || new Date().toISOString().slice(0, 10);
  f.link.value = entry?.link || '';
  f.tags.value = (entry?.tags || []).join(', ');
  f.notes.value = entry?.notes || '';
  edPhoto = entry?.photo || null;
  edRating = entry?.rating || 0;
  edStatus = entry?.status || 'want';
  edLocation = entry?.location || null;
  paintPhoto(); paintRating(); paintStatus(); paintLocation();
  $('#deleteBtn').hidden = !entry;
  $('#editor').showModal();
}

function paintPhoto() {
  const img = $('#photoPreview');
  img.hidden = !edPhoto;
  if (edPhoto) img.src = edPhoto; else img.removeAttribute('src');
  $('#photoHint').hidden = !!edPhoto;
  $('#photoRemove').hidden = !edPhoto;
}
function paintRating() {
  $('#ratingPick').innerHTML = [1, 2, 3, 4, 5].map(n =>
    `<button type="button" data-r="${n}" style="--i:${n}" class="${n <= edRating ? 'on' : ''}" aria-label="${n} stars">★</button>`).join('');
}
function paintStatus() {
  document.querySelectorAll('#statusPick button').forEach(b => b.classList.toggle('on', b.dataset.v === edStatus));
}

function resizeImage(file, max = 1000, q = 0.8) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read image')); };
    img.src = url;
  });
}

async function submitEntry(ev) {
  ev.preventDefault();
  const f = ev.target;
  const title = f.title.value.trim();
  if (!title) return;
  const e = editing ? { ...editing } : { id: uid(), kind: 'entry', createdAt: now() };
  Object.assign(e, {
    title,
    categoryId: f.categoryId.value,
    status: edStatus,
    rating: edRating,
    date: f.date.value,
    link: f.link.value.trim(),
    tags: [...new Set(f.tags.value.split(',').map(t => t.trim().replace(/^#/, '').toLowerCase()).filter(Boolean))],
    notes: f.notes.value,
    photo: edPhoto,
    location: edLocation,
  });
  await save(e);
  closeSheet($('#editor'));
  withTransition(render);
  bump();
}

/* ---------- Settings / categories ---------- */
function renderSettings() {
  const counts = {};
  entries().forEach(e => counts[e.categoryId] = (counts[e.categoryId] || 0) + 1);
  $('#catManage').innerHTML = cats().map(c => `
    <div class="cat-row" data-id="${esc(c.id)}">
      <input class="emoji-in" value="${esc(c.emoji)}" maxlength="4" data-f="emoji">
      <input value="${esc(c.name)}" maxlength="40" data-f="name">
      <span class="count">${counts[c.id] || 0}</span>
      <button class="link danger" data-del="${esc(c.id)}" title="Delete">✕</button>
    </div>`).join('');
  $('#srvUrl').value = settings.serverUrl || '';
  $('#srvToken').value = settings.token || '';
  $('#syncStatus').textContent = settings.serverUrl
    ? (settings.lastSyncAt ? `Last synced ${new Date(settings.lastSyncAt).toLocaleString()}` : 'Not synced yet')
    : 'Sync is off — data stays on this device.';
  $('#stats').textContent = `${entries().length} entries in ${cats().length} categories.`;
}

async function ensureDefaults() {
  if ([...items.values()].some(i => i.kind === 'cat')) return;
  const list = DEFAULT_CATS.map(([emoji, name], i) => ({
    id: 'cat-' + name.toLowerCase().replace(/[^a-z]+/g, '-'), kind: 'cat', emoji, name, order: i,
    createdAt: 0, updatedAt: 0, dirty: false, // updatedAt 0 so any synced version wins
  }));
  list.forEach(c => items.set(c.id, c));
  await dbPutMany(list);
}

/* ---------- Export / import ---------- */
function exportJSON() {
  const data = { app: 'trove', version: 1, exportedAt: new Date().toISOString(),
    items: [...items.values()].filter(i => !i.deleted).map(({ dirty, ...rest }) => rest) };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `trove-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function importJSON(file) {
  const data = JSON.parse(await file.text());
  if (!Array.isArray(data.items)) throw new Error('Not a Trove backup file');
  let n = 0;
  const changed = [];
  for (const it of data.items) {
    if (!it.id || !['cat', 'entry'].includes(it.kind)) continue;
    const cur = items.get(it.id);
    if (!cur || (it.updatedAt || 0) > (cur.updatedAt || 0)) {
      const x = { ...it, dirty: true };
      items.set(x.id, x); changed.push(x); n++;
    }
  }
  await dbPutMany(changed);
  scheduleSync();
  return n;
}

/* ---------- Sync (optional, self-hosted server) ---------- */
let syncTimer = null, syncing = false;
function scheduleSync(delay = 1500) {
  if (!settings.serverUrl) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => sync().catch(() => {}), delay);
}

async function sync({ loud = false } = {}) {
  if (!settings.serverUrl || syncing) return;
  syncing = true;
  $('#syncBtn').classList.add('spin');
  try {
    const pending = [...items.values()].filter(i => i.dirty).map(({ dirty, ...rest }) => rest);
    const base = settings.serverUrl.replace(/\/+$/, '');
    const r = await fetch(base + '/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (settings.token || '') },
      body: JSON.stringify({ since: settings.lastSeq || 0, changes: pending }),
    });
    if (r.status === 401) throw new Error('Wrong access token');
    if (!r.ok) throw new Error('Server error ' + r.status);
    const { seq, items: remote } = await r.json();

    // Clear dirty flags for items we pushed that haven't changed since.
    const sent = new Map(pending.map(p => [p.id, p.updatedAt]));
    const write = [];
    for (const [id, at] of sent) {
      const cur = items.get(id);
      if (cur && cur.updatedAt === at) { cur.dirty = false; write.push(cur); }
    }
    // Apply remote changes (last write wins).
    for (const rem of remote) {
      const cur = items.get(rem.id);
      if (cur && cur.dirty && cur.updatedAt > rem.updatedAt) continue;
      const x = { ...rem, dirty: false };
      items.set(x.id, x); write.push(x);
    }
    await dbPutMany(write);
    settings.lastSeq = seq;
    settings.lastSyncAt = Date.now();
    saveSettings();
    render();
    if (loud) toast(`Synced ✓ (${pending.length} sent, ${remote.length} received)`);
  } catch (err) {
    if (loud) toast('Sync failed: ' + (err.message || err));
    throw err;
  } finally {
    syncing = false;
    $('#syncBtn').classList.remove('spin');
    if ($('#settings').open) renderSettings();
  }
}

/* ---------- Misc ---------- */
function closeSheet(d) {
  if (!d.open) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { d.close(); return; }
  d.classList.add('closing');
  const done = () => { d.classList.remove('closing'); d.close(); };
  d.addEventListener('animationend', done, { once: true });
  setTimeout(() => d.open && d.classList.contains('closing') && done(), 400);
}

function bump() {
  const f = $('#addBtn'); f.classList.remove('bump'); void f.offsetWidth; f.classList.add('bump');
}
let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2800);
}

/* ---------- Events ---------- */
function bind() {
  $('#catChips').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    withTransition(() => { ui.cat = b.dataset.cat; render(); });
  });
  $('#statusSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    withTransition(() => {
      ui.status = b.dataset.status;
      document.querySelectorAll('#statusSeg button').forEach(x => x.classList.toggle('on', x === b));
      render();
    });
  });
  $('#search').addEventListener('input', e => { ui.q = e.target.value; render(); });
  $('#sort').addEventListener('change', e => withTransition(() => { ui.sort = e.target.value; render(); }));
  $('#list').addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add) { ui.cat = ''; openEditor(null, add.dataset.add); return; }
    const oc = e.target.closest('[data-open-cat]');
    if (oc) { withTransition(() => { ui.cat = oc.dataset.openCat; render(); }); scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const tg = e.target.closest('[data-toggle]');
    if (tg) {
      const set = new Set(settings.collapsed || []), id = tg.dataset.toggle;
      set.has(id) ? set.delete(id) : set.add(id);
      settings.collapsed = [...set]; saveSettings();
      tg.closest('.shelf').classList.toggle('closed', set.has(id));
      return;
    }
    const tag = e.target.closest('.tag');
    if (tag) { ui.tag = tag.textContent.slice(1); render(); return; }
    const card = e.target.closest('.card'); if (!card) return;
    openEditor(items.get(card.dataset.id));
  });
  $('#activeTag').addEventListener('click', e => { if (e.target.id === 'clearTag') { ui.tag = ''; render(); } });
  $('#addBtn').addEventListener('click', () => {
    if (!cats().length) { toast('Add a category in Settings first'); return; }
    openEditor(null);
  });

  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeSheet(b.closest('dialog'))));
  $('#entryForm').addEventListener('submit', submitEntry);
  $('#ratingPick').addEventListener('click', e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    const n = +b.dataset.r; edRating = edRating === n ? 0 : n; paintRating();
  });
  $('#statusPick').addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    edStatus = b.dataset.v; paintStatus();
  });
  $('#photoInput').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try { edPhoto = await resizeImage(file); paintPhoto(); } catch (err) { toast(err.message); }
    e.target.value = '';
  });
  $('#locPickBtn').addEventListener('click', openLocPicker);
  $('#locClear').addEventListener('click', () => { edLocation = null; paintLocation(); });
  $('#locMe').addEventListener('click', () => locateMe(false));
  $('#locQuery').addEventListener('input', e => runSearch(e.target.value));
  $('#locQuery').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); runSearch(e.target.value); } });
  $('#locUse').addEventListener('click', () => {
    if (!pick) { toast('Pick a spot first'); return; }
    edLocation = { ...pick, name: $('#locLabel').value.trim() || pick.name || '' };
    paintLocation(); closeSheet($('#locPicker'));
  });
  $('#mapToggle').addEventListener('click', () => withTransition(() => { ui.map = !ui.map; render(); }));
  $('#photoRemove').addEventListener('click', () => { edPhoto = null; paintPhoto(); });
  $('#deleteBtn').addEventListener('click', async () => {
    if (!editing || !confirm(`Delete "${editing.title}"?`)) return;
    await save({ id: editing.id, kind: 'entry', deleted: true, createdAt: editing.createdAt });
    closeSheet($('#editor')); withTransition(render);
  });

  // Settings
  $('#settingsBtn').addEventListener('click', () => { renderSettings(); $('#settings').showModal(); });
  $('#catManage').addEventListener('change', async e => {
    const row = e.target.closest('.cat-row'); const f = e.target.dataset.f;
    if (!row || !f) return;
    const c = { ...items.get(row.dataset.id), [f]: e.target.value.trim() || items.get(row.dataset.id)[f] };
    await save(c); render();
  });
  $('#catManage').addEventListener('click', async e => {
    const id = e.target.dataset.del; if (!id) return;
    const c = items.get(id);
    const n = entries().filter(x => x.categoryId === id).length;
    if (n) { toast(`Move or delete its ${n} entries first`); return; }
    if (!confirm(`Delete category "${c.name}"?`)) return;
    await save({ id, kind: 'cat', deleted: true });
    if (ui.cat === id) ui.cat = '';
    renderSettings(); render();
  });
  $('#catAdd').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const order = Math.max(-1, ...cats().map(c => c.order ?? 0)) + 1;
    await save({ id: uid(), kind: 'cat', emoji: f.emoji.value.trim() || '⭐', name: f.name.value.trim(), order, createdAt: now() });
    f.reset(); renderSettings(); render();
  });
  $('#syncSave').addEventListener('click', async () => {
    const url = $('#srvUrl').value.trim();
    if (!url) { toast('Enter your server URL'); return; }
    if (url !== settings.serverUrl) settings.lastSeq = 0; // new server: full sync
    settings.serverUrl = url; settings.token = $('#srvToken').value.trim();
    // First sync with a server: push everything we have.
    if (!settings.lastSeq) [...items.values()].forEach(i => { if (i.updatedAt) i.dirty = true; });
    saveSettings(); render();
    sync({ loud: true }).catch(() => {});
  });
  $('#syncOff').addEventListener('click', () => {
    delete settings.serverUrl; delete settings.token; delete settings.lastSeq; delete settings.lastSyncAt;
    saveSettings(); renderSettings(); render(); toast('Sync turned off');
  });
  $('#syncBtn').addEventListener('click', () => sync({ loud: true }).catch(() => {}));
  $('#exportBtn').addEventListener('click', exportJSON);
  $('#importInput').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    try { const n = await importJSON(file); toast(`Imported ${n} items`); renderSettings(); render(); }
    catch (err) { toast('Import failed: ' + err.message); }
    e.target.value = '';
  });

  window.addEventListener('resize', () => requestAnimationFrame(layoutAllDecks));
  window.addEventListener('online', () => scheduleSync(500));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(500); });
}

/* ---------- Boot ---------- */
(async function init() {
  try {
    db = await openDB();
    (await dbAll()).forEach(i => items.set(i.id, i));
  } catch (err) {
    console.warn('IndexedDB unavailable, running in memory only', err);
    db = null;
  }
  await ensureDefaults().catch(() => {});
  bind();
  render();
  scheduleSync(300);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    try { navigator.serviceWorker.register('sw.js'); } catch {}
  }
})();
