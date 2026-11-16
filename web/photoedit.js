/* Trove — view a photo full size, and crop or rotate it. MIT License. */
'use strict';

/* ---------- Full-size viewer ---------- */
let viewOnEdit = null;
function viewPhoto(src, onEdit) {
  $('#photoViewImg').src = src; viewOnEdit = onEdit || null;
  $('#photoViewEdit').hidden = !onEdit;
  $('#photoView').showModal();
}

/* ---------- Crop / rotate ---------- */
const crop = { img: null, rot: 0, box: { x: 0, y: 0, w: 1, h: 1 }, aspect: 0, done: null };
const MIN = 0.1;

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    if (!src.startsWith('data:')) im.crossOrigin = 'anonymous';   // needed to edit pictures from other sites
    im.onload = () => res(im); im.onerror = () => rej(new Error("This picture can't be edited"));
    im.src = src;
  });
}
// The whole image, rotated, drawn at up to `max` pixels on its long side.
function drawRotated(canvas, max) {
  const { img, rot } = crop, side = rot % 2 === 1;
  const W = side ? img.naturalHeight : img.naturalWidth, H = side ? img.naturalWidth : img.naturalHeight;
  const s = Math.min(1, max / Math.max(W, H));
  canvas.width = Math.round(W * s); canvas.height = Math.round(H * s);
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(rot * Math.PI / 2);
  ctx.drawImage(img, -img.naturalWidth * s / 2, -img.naturalHeight * s / 2, img.naturalWidth * s, img.naturalHeight * s);
  ctx.restore();
}
function paintCrop() {
  const b = crop.box, el = $('#cropBox');
  el.style.left = b.x * 100 + '%'; el.style.top = b.y * 100 + '%'; el.style.width = b.w * 100 + '%'; el.style.height = b.h * 100 + '%';
}
function fitAspect() {      // largest centred box with the chosen shape
  const c = $('#cropCanvas'), a = crop.aspect;
  if (!a) { crop.box = { x: 0, y: 0, w: 1, h: 1 }; return paintCrop(); }
  const imgA = c.width / c.height;
  const w = a > imgA ? 1 : a / imgA, h = a > imgA ? imgA / a : 1;
  crop.box = { x: (1 - w) / 2, y: (1 - h) / 2, w, h }; paintCrop();
}
function redrawCrop() { drawRotated($('#cropCanvas'), 1200); fitAspect(); }

function editPhoto(src) {
  return new Promise(async resolve => {
    try { crop.img = await loadImage(src); } catch (err) { toast(err.message); return resolve(null); }
    crop.rot = 0; crop.aspect = 0; crop.done = resolve;
    document.querySelectorAll('#cropAspect button').forEach(b => b.classList.toggle('on', b.dataset.a === '0'));
    $('#cropper').showModal();
    redrawCrop();
  });
}
function finishCrop(result) { const d = crop.done; crop.done = null; closeSheet($('#cropper')); if (d) d(result); }

(function bindPhotoEdit() {
  $('#photoViewEdit').addEventListener('click', async () => {
    const cb = viewOnEdit, src = $('#photoViewImg').src;
    $('#photoView').close();
    const out = await editPhoto(src);
    if (out && cb) cb(out);
  });
  $('#photoEdit').addEventListener('click', async () => {
    const i = edPhotoIdx, out = await editPhoto(edPhotos[i]);
    if (out) { edPhotos[i] = out; paintPhoto(); }
  });
  $('#cropLeft').addEventListener('click', () => { crop.rot = (crop.rot + 3) % 4; redrawCrop(); });
  $('#cropRight').addEventListener('click', () => { crop.rot = (crop.rot + 1) % 4; redrawCrop(); });
  $('#cropAspect').addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    crop.aspect = +b.dataset.a;
    document.querySelectorAll('#cropAspect button').forEach(x => x.classList.toggle('on', x === b));
    fitAspect();
  });
  $('#cropCancel').addEventListener('click', () => finishCrop(null));
  $('#cropper').addEventListener('close', () => { if (crop.done) { const d = crop.done; crop.done = null; d(null); } });
  $('#cropSave').addEventListener('click', () => {
    try {
      const full = document.createElement('canvas'); drawRotated(full, 2000);
      const b = crop.box, sx = b.x * full.width, sy = b.y * full.height, sw = b.w * full.width, sh = b.h * full.height;
      const s = Math.min(1, 1000 / Math.max(sw, sh)), out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(sw * s)); out.height = Math.max(1, Math.round(sh * s));
      out.getContext('2d').drawImage(full, sx, sy, sw, sh, 0, 0, out.width, out.height);
      finishCrop(out.toDataURL('image/jpeg', 0.85));
    } catch { toast("This picture can't be edited"); finishCrop(null); }
  });

  // Dragging the crop box and its corners
  const stage = $('#cropStage'), boxEl = $('#cropBox');
  let drag = null;
  boxEl.addEventListener('pointerdown', e => {
    e.preventDefault();
    drag = { h: e.target.dataset.h || 'move', x: e.clientX, y: e.clientY, start: { ...crop.box }, r: stage.getBoundingClientRect() };
    boxEl.setPointerCapture(e.pointerId);
  });
  boxEl.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) / drag.r.width, dy = (e.clientY - drag.y) / drag.r.height, s = drag.start;
    let { x, y, w, h } = s;
    if (drag.h === 'move') {
      x = Math.min(1 - w, Math.max(0, s.x + dx)); y = Math.min(1 - h, Math.max(0, s.y + dy));
    } else {
      let l = s.x, t = s.y, r = s.x + s.w, bt = s.y + s.h;
      if (drag.h.includes('w')) l = Math.min(r - MIN, Math.max(0, l + dx));
      if (drag.h.includes('e')) r = Math.max(l + MIN, Math.min(1, r + dx));
      if (drag.h.includes('n')) t = Math.min(bt - MIN, Math.max(0, t + dy));
      if (drag.h.includes('s')) bt = Math.max(t + MIN, Math.min(1, bt + dy));
      if (crop.aspect) {      // keep the chosen shape: width leads, height follows, anchored at the opposite corner
        const c = $('#cropCanvas'), k = (c.width / c.height) / crop.aspect;   // h = w * k in box units
        let nw = r - l, nh = nw * k;
        const room = drag.h.includes('n') ? bt : 1 - t;
        if (nh > room) { nh = room; nw = nh / k; }
        if (drag.h.includes('w')) l = r - nw; else r = l + nw;
        if (drag.h.includes('n')) t = bt - nh; else bt = t + nh;
      }
      x = l; y = t; w = r - l; h = bt - t;
    }
    crop.box = { x, y, w, h }; paintCrop();
  });
  const stop = () => { drag = null; };
  boxEl.addEventListener('pointerup', stop); boxEl.addEventListener('pointercancel', stop);
})();
