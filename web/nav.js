/* Trove — back button steps back through the app; drag shelves to reorder categories. MIT License. */
'use strict';

/* ---------- Back button ----------
 * Every "place" you can go (an open sheet, a category, the map, a tag filter) adds one step to the
 * browser history. Android's back button walks those steps; with none left it leaves the app as usual. */
const navStack = [];
let navIgnore = 0;
function navPush(entry) { navStack.push(entry); history.pushState({ trove: navStack.length }, ''); }
function navDrop(entry) {            // closed from the screen (not with Back): remove its history step
  const i = navStack.lastIndexOf(entry); if (i < 0) return;
  navStack.splice(i, 1); navIgnore++; history.back();
}
window.addEventListener('popstate', () => {
  if (navIgnore) { navIgnore--; return; }
  const top = navStack.pop();
  if (top) top.back();
});

// Android app: the hardware Back button. Step back if there is somewhere to go, otherwise send
// Trove to the background (so visit tracking keeps running) instead of closing it.
(function hardwareBack() {
  const App = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (!App || !App.addListener) return;
  App.addListener('backButton', () => { if (navStack.length) history.back(); else if (App.minimizeApp) App.minimizeApp(); });
})();

// Sheets (dialogs)
const _showModal = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function () {
  _showModal.call(this);
  this._nav = { back: () => closeSheet(this) };
  navPush(this._nav);
};
document.querySelectorAll('dialog').forEach(d => d.addEventListener('close', () => { if (d._nav) { navDrop(d._nav); d._nav = null; } }));

// Views on the main screen
const viewNav = {
  map: { on: () => ui.map, entry: { back: () => { ui.map = false; withTransition(render); } } },
  cat: { on: () => !!ui.cat, entry: { back: () => { ui.cat = ''; withTransition(render); } } },
  tag: { on: () => !!ui.tag, entry: { back: () => { ui.tag = ''; withTransition(render); } } },
};
function syncViewNav() {
  for (const v of Object.values(viewNav)) {
    const inStack = navStack.includes(v.entry);
    if (v.on() && !inStack) navPush(v.entry);
    else if (!v.on() && inStack) navDrop(v.entry);
  }
}

/* ---------- Drag shelves to reorder categories ---------- */
(function shelfDrag() {
  const list = $('#list');
  let drag = null;
  const shelves = () => [...list.querySelectorAll('.shelf')];

  function place(y) {
    const el = drag.el;
    el.style.transform = '';
    const natural = el.getBoundingClientRect().top;
    el.style.transform = `translateY(${y - drag.grab - natural}px) scale(1.02)`;
  }
  function move(e) {
    if (!drag) return;
    e.preventDefault();
    drag.y = e.clientY;
    const mid = e.clientY - drag.grab + drag.h / 2;
    for (const other of shelves()) {
      if (other === drag.el) continue;
      const r = other.getBoundingClientRect(), half = r.top + r.height / 2;
      const before = drag.el.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING; // other is below
      if (before && mid > half) { other.after(drag.el); break; }
      if (!before && mid < half) { other.before(drag.el); break; }
    }
    place(e.clientY);
  }
  function autoScroll() {
    if (!drag) return;
    const edge = 90, y = drag.y;
    const dy = y < edge ? -(edge - y) / 6 : y > innerHeight - edge ? (y - (innerHeight - edge)) / 6 : 0;
    if (dy) { scrollBy(0, dy); place(y); }
    drag.raf = requestAnimationFrame(autoScroll);
  }
  async function end() {
    if (!drag) return;
    const el = drag.el; cancelAnimationFrame(drag.raf);
    el.classList.remove('dragging'); el.style.transform = ''; document.body.classList.remove('reordering');
    drag = null;
    const ids = shelves().map(s => s.dataset.shelf);
    const before = cats().map(c => c.id);
    if (ids.join() === before.join()) return;
    for (const [i, id] of ids.entries()) {
      const c = items.get(id);
      if (c && c.order !== i) await save({ ...c, order: i });
    }
    renderChips();
    if (navigator.vibrate) navigator.vibrate(15);
  }
  list.addEventListener('pointerdown', e => {
    const grip = e.target.closest('[data-grip]'); if (!grip) return;
    const el = grip.closest('.shelf'), r = el.getBoundingClientRect();
    e.preventDefault();
    drag = { el, grab: e.clientY - r.top, h: r.height, y: e.clientY };
    el.classList.add('dragging'); document.body.classList.add('reordering');
    grip.setPointerCapture(e.pointerId);
    if (navigator.vibrate) navigator.vibrate(10);
    place(e.clientY);
    drag.raf = requestAnimationFrame(autoScroll);
  });
  list.addEventListener('pointermove', move);
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);
})();

/* ---------- Drag the category chips to reorder (press and hold, then drag sideways) ---------- */
(function chipDrag() {
  const row = $('#catChips');
  let st = null, justDragged = false;
  const chips = () => [...row.querySelectorAll('.chip[data-cat]')].filter(c => c.dataset.cat);

  function begin() {
    if (!st) return;
    st.active = true; st.el.classList.add('dragging'); row.classList.add('reordering');
    try { st.el.setPointerCapture(st.id); } catch {}
    if (navigator.vibrate) navigator.vibrate(10);
  }
  function place(x) {
    st.el.style.transform = '';
    const natural = st.el.getBoundingClientRect().left;
    st.el.style.transform = `translateX(${x - st.grab - natural}px) scale(1.06)`;
  }
  row.addEventListener('pointerdown', e => {
    const el = e.target.closest('.chip[data-cat]'); if (!el || !el.dataset.cat) return;   // "All" stays first
    const r = el.getBoundingClientRect();
    st = { el, id: e.pointerId, x: e.clientX, y: e.clientY, grab: e.clientX - r.left, w: r.width, active: false,
      timer: setTimeout(begin, e.pointerType === 'mouse' ? 180 : 320) };
  });
  row.addEventListener('pointermove', e => {
    if (!st) return;
    if (!st.active) {      // moved before the hold finished: it's a scroll or a tap, not a drag
      if (Math.abs(e.clientX - st.x) > 8 || Math.abs(e.clientY - st.y) > 8) { clearTimeout(st.timer); st = null; }
      return;
    }
    e.preventDefault();
    const mid = e.clientX - st.grab + st.w / 2;
    for (const other of chips()) {
      if (other === st.el) continue;
      const r = other.getBoundingClientRect(), half = r.left + r.width / 2;
      const after = st.el.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING;
      if (after && mid > half) { other.after(st.el); break; }
      if (!after && mid < half) { other.before(st.el); break; }
    }
    place(e.clientX);
    const rr = row.getBoundingClientRect();       // scroll the row when dragging near its ends
    if (e.clientX > rr.right - 40) row.scrollLeft += 12; else if (e.clientX < rr.left + 40) row.scrollLeft -= 12;
  });
  async function end() {
    if (!st) return;
    clearTimeout(st.timer);
    const was = st.active, el = st.el; st = null;
    if (!was) return;
    el.classList.remove('dragging'); el.style.transform = ''; row.classList.remove('reordering');
    justDragged = true; setTimeout(() => { justDragged = false; }, 350);
    const ids = chips().map(c => c.dataset.cat);
    if (ids.join() === cats().map(c => c.id).join()) return;
    for (const [i, id] of ids.entries()) { const c = items.get(id); if (c && c.order !== i) await save({ ...c, order: i }); }
    render();
  }
  row.addEventListener('pointerup', end);
  row.addEventListener('pointercancel', end);
  row.addEventListener('click', e => { if (justDragged) { e.stopPropagation(); e.preventDefault(); } }, true);
  row.addEventListener('contextmenu', e => { if (st) e.preventDefault(); });
  // Once a drag has started, stop the page or the row from scrolling under the finger.
  document.addEventListener('touchmove', e => { if (st && st.active) e.preventDefault(); }, { passive: false });
})();
