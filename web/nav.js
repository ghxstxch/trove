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
