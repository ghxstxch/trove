/* Trove — share entries or a whole category with a friend as a small file. MIT License. */
'use strict';

function buildShare(list, title) {
  const catIds = [...new Set(list.map(e => e.categoryId))];
  return {
    app: 'trove', share: 1, from: (settings.shareName || '').trim(), title, sharedAt: new Date().toISOString(),
    cats: catIds.map(id => catById(id)).filter(Boolean).map(c => ({ id: c.id, name: c.name, emoji: c.emoji, special: c.special, adult: c.adult })),
    // Personal status and sync details stay behind; the friend gets the content.
    items: list.map(({ dirty, deleted, updatedAt, sharedBy, shareId, ...e }) => ({ ...e, kind: 'entry' })),
  };
}

async function deliverShare(data) {
  const name = `trove-${(data.title || 'share').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'share'}.json`;
  const text = JSON.stringify(data);
  const caption = `${data.from ? data.from + ' shared' : 'Shared'} "${data.title}" from Trove. Open Trove → Settings → Import JSON to add it.`;
  const cap = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins;
  if (cap && cap.Filesystem && cap.Share) {           // Android / iOS app: system share sheet
    const w = await cap.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
    await cap.Share.share({ title: data.title, text: caption, files: [w.uri], dialogTitle: 'Share with a friend' });
    return 'shared';
  }
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {   // browsers with a share sheet
    try { await navigator.share({ title: data.title, text: caption, files: [file] }); return 'shared'; }
    catch (err) { if (err.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a');             // everything else: save the file
  a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return 'saved';
}

async function shareEntries(list, title) {
  if (!list.length) return toast('Nothing to share');
  try {
    const how = await deliverShare(buildShare(list, title));
    if (how === 'saved') toast('Saved a share file — send it to your friend');
  } catch (err) { if (!/cancel/i.test(err.message || '')) toast('Could not share: ' + (err.message || err)); }
}

// A friend's share file: add its entries to this Trove (again later = update, not duplicate).
async function importShare(data) {
  const mapCat = {};
  for (const c of data.cats || []) {
    let mine = [...items.values()].find(x => x.kind === 'cat' && !x.deleted &&
      ((c.special && x.special === c.special) || x.name.trim().toLowerCase() === String(c.name || '').trim().toLowerCase()));
    if (!mine) {
      const order = Math.max(-1, ...[...items.values()].filter(x => x.kind === 'cat').map(x => x.order ?? 0)) + 1;
      mine = { id: uid(), kind: 'cat', emoji: c.emoji || '⭐', name: String(c.name || 'Shared').slice(0, 40), order, createdAt: now() };
      if (c.special) mine.special = c.special;
      if (c.adult) mine.adult = true;
      await save(mine);
    }
    mapCat[c.id] = mine;
  }
  const fallback = cats()[0];
  let n = 0, hidden = 0;
  for (const it of data.items) {
    if (!it || it.kind !== 'entry' || !it.title) continue;
    const cat = mapCat[it.categoryId] || fallback; if (!cat) continue;
    const origin = `${data.from || '?'}:${it.id}`;
    const existing = [...items.values()].find(x => x.kind === 'entry' && !x.deleted && x.shareId === origin);
    const { id, status, rating, ...content } = it; // their status and rating stay theirs; yours start empty
    await save({ ...(existing || { id: uid(), createdAt: now(), status: 'want', rating: 0 }), ...content, sharedRating: rating || 0, kind: 'entry', categoryId: cat.id,
      tags: Array.isArray(it.tags) ? it.tags.map(String) : [], sharedBy: data.from || 'a friend', shareId: origin });
    n++; if (hiddenCat(cat)) hidden++;
  }
  if (hidden) setTimeout(() => toast(`${hidden} of them are in a 21+ section — turn it on in Settings to see them`), 3000);
  return n;
}

function paintShareCat(list) {
  const b = $('#shareCatBtn'), c = ui.cat && catById(ui.cat);
  b.hidden = !c || ui.map || !list.length;
  if (c) b.textContent = `↗ Share ${list.length === 1 ? 'this entry' : `these ${list.length} entries`} from ${c.name}`;
}

(function bindShare() {
  $('#shareEntryBtn').addEventListener('click', () => { if (editing) shareEntries([editing], editing.title); });
  $('#shareCatBtn').addEventListener('click', () => { const c = catById(ui.cat); if (c) shareEntries(filtered(), c.name); });
  $('#shareName').addEventListener('change', e => { settings.shareName = e.target.value.trim(); saveSettings(); });
  $('#settingsBtn').addEventListener('click', () => { $('#shareName').value = settings.shareName || ''; });
})();
