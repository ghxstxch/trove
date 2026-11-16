/* Trove — log every time you come back to something: sessions, watches, reads, listens, visits. MIT License. */
'use strict';

let edLog = [], logWord = ['time', 'times'], logIsCanna = false;

// What one "time" is called for a category: [singular, plural, verb for the button].
function logWords(cat) {
  const n = (cat && cat.name) || '';
  if (cat && cat.special === 'cannabis') return ['session', 'sessions'];
  if (/movie|tv|show|film|anime|video/i.test(n)) return ['watch', 'watches'];
  if (/book|comic|manga|read/i.test(n)) return ['read', 'reads'];
  if (/music|album|song|podcast|audio/i.test(n)) return ['listen', 'listens'];
  if (/game/i.test(n)) return ['play', 'plays'];
  if (/place|travel|trip|food|restaurant|drink|coffee|bar/i.test(n)) return ['visit', 'visits'];
  return ['time', 'times'];
}
const cap = s => s[0].toUpperCase() + s.slice(1);
const todayStr = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const nowTime = () => new Date().toTimeString().slice(0, 5);

function logLine(e) {
  const [one, many] = logWords(catById(e.categoryId)), n = e.log.length;
  const last = e.log.map(l => l.date).filter(Boolean).sort().pop();
  const when = last ? new Date(last + 'T12:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: last.slice(0, 4) === String(new Date().getFullYear()) ? undefined : 'numeric' }) : '';
  return `${n} ${n === 1 ? one : many}${when ? ' · last ' + when : ''}`;
}

function logRender() {
  edLog.sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
  $('#logLabel').textContent = `${cap(logWord[1])}${edLog.length ? ` (${edLog.length})` : ''}`;
  $('#logAdd').textContent = `+ Log a ${logWord[0]}`;
  $('#logList').innerHTML = edLog.map((l, i) => `
    <div class="log-row" data-i="${i}">
      <div class="log-top">
        <input type="date" data-l="date" value="${esc(l.date || '')}">
        <input type="time" data-l="time" value="${esc(l.time || '')}">
        <button type="button" class="link danger" data-rm title="Remove">✕</button>
      </div>
      ${logIsCanna ? `<div class="two">
        <select data-l="method"><option value="">How</option>${CANNA.methods.map(m => `<option${m === l.method ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select>
        <input data-l="dose" value="${esc(l.dose || '')}" placeholder="How much" maxlength="40"></div>` : ''}
      <input data-l="note" value="${esc(l.note || '')}" placeholder="Note (optional)" maxlength="300">
      <div class="mini-stars" data-lr>${[1, 2, 3, 4, 5].map(n => `<button type="button" data-n="${n}" class="${n <= (l.rating || 0) ? 'on' : ''}">★</button>`).join('')}</div>
    </div>`).join('');
}

function logLoad(raw) { edLog = Array.isArray(raw) ? raw.map(l => ({ ...l })) : []; logRender(); }
function logRead() { return edLog.filter(l => l.date).map(l => ({ ...l })); }
function logPaint(cat) { logWord = logWords(cat); logIsCanna = !!(cat && cat.special === 'cannabis'); logRender(); }

(function bindLog() {
  $('#logAdd').addEventListener('click', () => {
    edLog.push({ id: uid(), date: todayStr(), time: nowTime(), note: '', rating: 0 });
    logRender();
    if (edStatus === 'want') { edStatus = 'done'; paintStatus(); }   // you've had it now
  });
  const list = $('#logList');
  list.addEventListener('input', e => {
    const row = e.target.closest('.log-row'), k = e.target.dataset.l;
    if (row && k) edLog[+row.dataset.i][k] = e.target.value;
  });
  list.addEventListener('click', e => {
    const row = e.target.closest('.log-row'); if (!row) return;
    const l = edLog[+row.dataset.i];
    if (e.target.closest('[data-rm]')) { edLog.splice(+row.dataset.i, 1); return logRender(); }
    const star = e.target.closest('[data-lr] button');
    if (star) {
      const n = +star.dataset.n; l.rating = l.rating === n ? 0 : n;
      row.querySelectorAll('[data-lr] button').forEach(x => x.classList.toggle('on', +x.dataset.n <= l.rating));
    }
  });
})();
