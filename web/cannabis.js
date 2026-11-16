/* Trove — cannabis journal fields (21+ section). A personal log of what you tried; not medical advice. MIT License. */
'use strict';

const CANNA = {
  forms: {
    'Flower': ['Indoor', 'Outdoor', 'Greenhouse / mixed light', 'Living soil', 'Smalls / popcorn', 'Shake / trim', 'Pre-ground', 'Moon rocks', 'Infused flower'],
    'Pre-roll': ['Single', 'Multi-pack', 'Infused (kief)', 'Infused (hash)', 'Infused (rosin)', 'Infused (resin / distillate)', 'Infused (diamonds)', 'Blunt', 'Hash hole / donut', 'Mini / dogwalker'],
    'Concentrate': ['Live resin', 'Cured resin', 'Live rosin', 'Hash rosin', 'Flower rosin', 'Cold cure rosin', 'Fresh press rosin', 'Rosin jam', 'Budder', 'Badder / batter', 'Shatter', 'Wax', 'Crumble', 'Sugar', 'Sauce', 'Terp sauce (HTFSE)', 'Diamonds', 'Diamonds & sauce', 'THCa crystalline / isolate', 'Distillate', 'RSO / FECO', 'CO2 oil', 'Bubble hash / ice water hash', 'Full melt', 'Dry sift', 'Kief', 'Temple ball', 'Pressed hash', 'Piatella', 'Live hash', 'Pull-and-snap', 'Honeycomb', 'Caviar'],
    'Vape': ['Distillate cart', 'Live resin cart', 'Cured resin cart', 'Live rosin cart', 'Hash rosin cart', 'Liquid diamonds cart', 'CO2 cart', 'Full-spectrum cart', 'Disposable', 'Pod', 'All-in-one', 'Dry herb vape'],
    'Edible': ['Gummy', 'Chocolate', 'Hard candy', 'Chew / caramel', 'Mint', 'Baked good', 'Cookie', 'Brownie', 'Capsule', 'Tablet', 'Lozenge', 'Dissolvable strip', 'Powder / drink mix', 'Honey / syrup', 'Butter / oil', 'Savory snack', 'Rosin edible', 'Live resin edible', 'Nano / fast-acting'],
    'Drink': ['Seltzer', 'Soda', 'Tea', 'Coffee', 'Shot', 'Mocktail', 'Syrup', 'Drink enhancer'],
    'Tincture': ['Alcohol-based', 'MCT oil', 'Glycerin', 'Sublingual spray', 'Full-spectrum', 'Broad-spectrum', 'Isolate'],
    'Topical': ['Lotion', 'Balm / salve', 'Cream', 'Roll-on', 'Transdermal patch', 'Gel', 'Bath soak', 'Massage oil'],
    'Other': ['Seeds', 'Clone', 'Suppository', 'Inhaler', 'Hemp-derived'],
  },
  strains: ['Indica', 'Indica-dominant hybrid', 'Hybrid (balanced)', 'Sativa-dominant hybrid', 'Sativa', 'CBD-dominant', 'Balanced THC:CBD', 'Landrace', 'Unknown'],
  // [key, label, note]
  cannabinoids: [
    ['totalThc', 'Total THC', 'On the label. If blank, worked out as Δ9 + 0.877 × THCa'],
    ['thca', 'THCa'], ['d9', 'Δ9-THC'], ['d8', 'Δ8-THC'], ['d10', 'Δ10-THC'], ['thcv', 'THCV'], ['thcp', 'THCP'], ['hhc', 'HHC'],
    ['totalCbd', 'Total CBD', 'If blank, worked out as CBD + 0.877 × CBDa'],
    ['cbda', 'CBDa'], ['cbd', 'CBD'], ['cbdv', 'CBDV'],
    ['cbga', 'CBGa'], ['cbg', 'CBG'], ['cbn', 'CBN'], ['cbc', 'CBC'], ['cbca', 'CBCa'], ['cbl', 'CBL'], ['cbt', 'CBT'], ['cbe', 'CBE'],
    ['totalCann', 'Total cannabinoids'],
  ],
  terpenes: ['Myrcene', 'Limonene', 'β-Caryophyllene', 'Linalool', 'α-Pinene', 'β-Pinene', 'Humulene', 'Terpinolene', 'Ocimene', 'α-Bisabolol', 'Nerolidol', 'Guaiol', 'Camphene', 'Eucalyptol', 'Geraniol', 'Valencene', 'Terpineol', 'Borneol', 'Δ3-Carene', 'Farnesene', 'Fenchol', 'Phellandrene', 'Sabinene', 'Caryophyllene oxide', 'Isopulegol', 'Pulegone', 'Cymene', 'Phytol', 'Cedrene', 'Citronellol', 'Menthol', 'Camphor', 'γ-Terpinene', 'α-Terpinene', 'Geranyl acetate', 'Nerol'],
  ratings: [['potency', 'Potency'], ['effects', 'Effects'], ['flavor', 'Flavor'], ['aroma', 'Aroma'], ['smooth', 'Smoothness'], ['looks', 'Looks / bag appeal'], ['cure', 'Cure / freshness'], ['burn', 'Burn / ash'], ['value', 'Value'], ['again', 'Would buy again']],
  chips: {
    effects: ['Relaxed', 'Happy', 'Euphoric', 'Uplifted', 'Creative', 'Focused', 'Energetic', 'Talkative', 'Giggly', 'Hungry', 'Sleepy', 'Tingly', 'Aroused', 'Calm', 'Clear-headed', 'Motivated', 'Social', 'Introspective', 'Body high', 'Head high', 'Heavy', 'Couch-lock', 'Spacey', 'Mellow', 'Stoned', 'Buzzed'],
    negatives: ['Dry mouth', 'Dry eyes', 'Anxious', 'Paranoid', 'Dizzy', 'Headache', 'Racing heart', 'Coughing', 'Harsh throat', 'Groggy next day', 'Foggy', 'Nauseous', 'Too strong', 'Too weak', 'Short-lived'],
    aromas: ['Earthy', 'Pine', 'Woody', 'Citrus', 'Lemon', 'Lime', 'Orange', 'Grapefruit', 'Diesel', 'Gas', 'Skunk', 'Sweet', 'Berry', 'Blueberry', 'Strawberry', 'Grape', 'Tropical', 'Mango', 'Pineapple', 'Apple', 'Peach', 'Cherry', 'Floral', 'Lavender', 'Rose', 'Herbal', 'Sage', 'Mint', 'Menthol', 'Spicy', 'Pepper', 'Cheese', 'Funk', 'Chem', 'Ammonia', 'Pungent', 'Vanilla', 'Cream', 'Cake', 'Dough', 'Cookie', 'Candy', 'Honey', 'Butter', 'Nutty', 'Coffee', 'Chocolate', 'Tea', 'Tobacco', 'Hash', 'Incense', 'Musk', 'Hay / grassy'],
    goodFor: ['Morning', 'Daytime', 'Evening', 'Bedtime', 'Socializing', 'Movies / TV', 'Music', 'Gaming', 'Creative work', 'Chores', 'Outdoors', 'Exercise', 'Cooking / eating', 'Winding down', 'Solo time'],
  },
  methods: ['Joint', 'Blunt', 'Bowl / pipe', 'Bong', 'Bubbler', 'One-hitter', 'Dab rig', 'E-rig', 'Nectar collector', 'Vape pen / cart', 'Dry herb vaporizer', 'Edible', 'Drink', 'Tincture', 'Topical'],
};
CANNA.chips.flavors = CANNA.chips.aromas;
const CHIP_LABEL = { effects: 'Effects felt', negatives: 'Downsides', aromas: 'Smell', flavors: 'Taste', goodFor: 'Good for' };

let cn = null; // the cannabis record being edited

const blank = () => ({ form: '', sub: '', strain: '', brand: '', grower: '', lineage: '', batch: '', harvest: '', packaged: '', tested: '', lab: '',
  amount: '', amountUnit: 'g', price: '', cannUnit: '%', cann: {}, terpTotal: '', terps: {}, ratings: {},
  effects: [], negatives: [], aromas: [], flavors: [], goodFor: [], method: '', dose: '', onset: '', duration: '', temp: '' });

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const trimNum = n => String(Math.round(n * 100) / 100);
function totalThc(c) {
  const t = num(c.cann.totalThc); if (t != null) return t;
  const a = num(c.cann.thca), d = num(c.cann.d9);
  return a == null && d == null ? null : (d || 0) + 0.877 * (a || 0);
}
function totalCbd(c) {
  const t = num(c.cann.totalCbd); if (t != null) return t;
  const a = num(c.cann.cbda), d = num(c.cann.cbd);
  return a == null && d == null ? null : (d || 0) + 0.877 * (a || 0);
}
function normCanna(c) {
  const out = { ...blank(), ...(c || {}) };
  out.cann = { ...(c && c.cann) }; out.terps = { ...(c && c.terps) }; out.ratings = { ...(c && c.ratings) };
  if (c && c.thc && !out.cann.totalThc) out.cann.totalThc = c.thc; // entries saved by the first, simpler version
  if (c && c.cbd && !out.cann.totalCbd) out.cann.totalCbd = c.cbd;
  for (const k of Object.keys(CANNA.chips)) out[k] = [...(out[k] || [])];
  return out;
}

// One-line summary shown on cards.
function cannaSummary(raw) {
  const c = normCanna(raw), u = c.cannUnit || '%', t = totalThc(c), d = totalCbd(c);
  const top = Object.entries(c.terps).sort((a, b) => (num(b[1]) || 0) - (num(a[1]) || 0)).slice(0, 2).map(x => x[0]);
  return [c.strain.replace(' hybrid', '').replace(' (balanced)', ''), c.sub || c.form, t != null ? `${trimNum(t)}${u} THC` : '',
    d != null && d >= 1 ? `${trimNum(d)}${u} CBD` : '', top.join(' + ')].filter(Boolean).join(' · ');
}
function cannaSearchText(raw) {
  const c = normCanna(raw);
  return [c.form, c.sub, c.strain, c.brand, c.grower, c.lineage, c.batch, c.lab, c.method, ...Object.keys(c.terps),
    ...c.effects, ...c.negatives, ...c.aromas, ...c.flavors, ...c.goodFor].join(' ');
}

/* ---------- Editor UI ---------- */
const opt = (list, cur) => ['<option value="">—</option>', ...list.map(v => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`)].join('');
const tin = (k, label, ph = '', extra = '') => `<label>${label}<input data-c="${k}" value="${esc(cn[k] || '')}" placeholder="${esc(ph)}" maxlength="120" ${extra}></label>`;
const section = (id, title, body, open) => `<details class="cx" data-sec="${id}" ${open ? 'open' : ''}><summary>${title}<span class="cx-sum" data-sum="${id}"></span></summary><div class="cx-body">${body}</div></details>`;

function chipGroup(k) {
  const all = [...new Set([...CANNA.chips[k], ...cn[k]])];
  return `<div class="field"><span class="lbl">${CHIP_LABEL[k]}</span><div class="cchips" data-chips="${k}">
    ${all.map(v => `<button type="button" class="chip ${cn[k].includes(v) ? 'on' : ''}" data-v="${esc(v)}">${esc(v)}</button>`).join('')}
    <input class="chip-add" data-add="${k}" placeholder="+ add your own" maxlength="30"></div></div>`;
}
function terpRows() {
  const picked = Object.keys(cn.terps);
  return picked.length ? picked.map(t => `<div class="terp-row"><span>${esc(t)}</span><input data-terp="${esc(t)}" value="${esc(cn.terps[t] || '')}" inputmode="decimal" placeholder="%" maxlength="7"><span>%</span></div>`).join('')
    : '<p class="muted">Tap the terpenes on the label. Add the % for each if you have it.</p>';
}
function starRow(k, label) {
  const v = cn.ratings[k] || 0;
  return `<div class="rate-row"><span>${label}</span><div class="mini-stars" data-rate="${k}">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-n="${n}" class="${n <= v ? 'on' : ''}">★</button>`).join('')}</div></div>`;
}

function cannaRender(openSecs) {
  const open = openSecs || new Set(['product']);
  const u = cn.cannUnit || '%';
  const product = `
    <div class="two"><label>Type<select data-c="form">${opt(Object.keys(CANNA.forms), cn.form)}</select></label>
      <label>Kind<select data-c="sub">${opt(CANNA.forms[cn.form] || [], cn.sub)}</select></label></div>
    <label>Strain type<select data-c="strain">${opt(CANNA.strains, cn.strain)}</select></label>
    <div class="two">${tin('brand', 'Brand', 'e.g. Aeriz')}${tin('grower', 'Grower / processor')}</div>
    ${tin('lineage', 'Lineage / genetics', 'e.g. Blueberry × Haze')}
    <div class="two"><label>Amount<span class="inline"><input data-c="amount" value="${esc(cn.amount)}" inputmode="decimal" maxlength="8">
      <select data-c="amountUnit">${['g', 'mg', 'oz', 'ml', 'pieces', 'pack'].map(x => `<option${x === cn.amountUnit ? ' selected' : ''}>${x}</option>`).join('')}</select></span></label>
      ${tin('price', 'Price', '$', 'inputmode="decimal"')}</div>
    <div class="two">${tin('batch', 'Batch / lot #')}${tin('lab', 'Testing lab')}</div>
    <div class="two"><label>Harvested<input type="date" data-c="harvest" value="${esc(cn.harvest)}"></label><label>Packaged<input type="date" data-c="packaged" value="${esc(cn.packaged)}"></label></div>
    <label>Tested on<input type="date" data-c="tested" value="${esc(cn.tested)}"></label>
    <div class="row"><button type="button" class="btn ghost" data-look="leafly">Look up on Leafly</button><button type="button" class="btn ghost" data-look="allbud">Look up on AllBud</button></div>`;
  const cann = `
    <div class="field"><span class="lbl">Numbers on the label are in</span><div class="seg small" data-unit>
      ${['%', 'mg/g', 'mg'].map(x => `<button type="button" data-u="${x}" class="${x === u ? 'on' : ''}">${x === 'mg' ? 'mg (edibles)' : x}</button>`).join('')}</div></div>
    <div class="cann-grid">${CANNA.cannabinoids.map(([k, label, note]) => `<label class="${note ? 'wide' : ''}">${label}
      <input data-cann="${k}" value="${esc(cn.cann[k] || '')}" inputmode="decimal" maxlength="8" placeholder="${u}">${note ? `<small>${note}</small>` : ''}</label>`).join('')}</div>
    <p class="muted" data-calc></p>`;
  const terps = `
    <label>Total terpenes %<input data-c="terpTotal" value="${esc(cn.terpTotal)}" inputmode="decimal" maxlength="7"></label>
    <div class="cchips" data-terpchips>${[...new Set([...CANNA.terpenes, ...Object.keys(cn.terps)])].map(t => `<button type="button" class="chip ${t in cn.terps ? 'on' : ''}" data-t="${esc(t)}">${esc(t)}</button>`).join('')}
      <input class="chip-add" data-addterp placeholder="+ add your own" maxlength="30"></div>
    <div data-terprows>${terpRows()}</div>`;
  const review = `<p class="muted">The stars at the bottom of this form are your overall rating. These break it down.</p>${CANNA.ratings.map(([k, l]) => starRow(k, l)).join('')}`;
  const feel = chipGroup('effects') + chipGroup('negatives') + chipGroup('goodFor');
  const senses = chipGroup('aromas') + chipGroup('flavors');
  const session = `
    <label>How you had it<select data-c="method">${opt(CANNA.methods, cn.method)}</select></label>
    <div class="two">${tin('dose', 'How much', 'e.g. 2 hits, 10 mg')}${tin('temp', 'Temp', 'e.g. 520°F')}</div>
    <div class="two">${tin('onset', 'Kicked in after', 'e.g. 10 min')}${tin('duration', 'Lasted', 'e.g. 2 h')}</div>`;
  $('#cannaFields').innerHTML =
    section('product', 'Product', product, open.has('product')) +
    section('cann', 'Cannabinoids', cann, open.has('cann')) +
    section('terps', 'Terpenes', terps, open.has('terps')) +
    section('review', 'Detailed ratings', review, open.has('review')) +
    section('feel', 'Effects', feel, open.has('feel')) +
    section('senses', 'Smell & taste', senses, open.has('senses')) +
    section('session', 'Usual way you have it', session, open.has('session'));
  paintSums();
}

function paintSums() {
  const set = (id, t) => { const el = $(`[data-sum="${id}"]`); if (el) el.textContent = t; };
  const t = totalThc(cn), d = totalCbd(cn), u = cn.cannUnit || '%';
  set('product', [cn.sub || cn.form, cn.brand].filter(Boolean).join(' · '));
  set('cann', [t != null ? `THC ${trimNum(t)}${u}` : '', d != null ? `CBD ${trimNum(d)}${u}` : ''].filter(Boolean).join(' · '));
  set('terps', Object.keys(cn.terps).length ? `${Object.keys(cn.terps).length} picked` : '');
  set('review', Object.values(cn.ratings).filter(Boolean).length ? `${Object.values(cn.ratings).filter(Boolean).length} rated` : '');
  set('feel', cn.effects.slice(0, 3).join(', '));
  set('senses', [...new Set([...cn.aromas, ...cn.flavors])].slice(0, 3).join(', '));
  set('session', cn.method);
  const calc = $('[data-calc]');
  if (calc) {
    const parts = [];
    if (num(cn.cann.totalThc) == null && t != null) parts.push(`Total THC ≈ ${trimNum(t)}${u}`);
    if (num(cn.cann.totalCbd) == null && d != null) parts.push(`Total CBD ≈ ${trimNum(d)}${u}`);
    calc.textContent = parts.length ? 'Worked out from the acid forms: ' + parts.join(' · ') : '';
  }
}

let cannaTitle = '';
function cannaLoad(raw, title) { cn = normCanna(raw); cannaTitle = title || ''; cannaRender(); }
function cannaRead() {
  const c = JSON.parse(JSON.stringify(cn));
  for (const k of Object.keys(c.cann)) if (!String(c.cann[k]).trim()) delete c.cann[k];
  for (const k of Object.keys(c.ratings)) if (!c.ratings[k]) delete c.ratings[k];
  return c;
}
const openSections = () => new Set([...document.querySelectorAll('#cannaFields details[open]')].map(d => d.dataset.sec));

(function bindCanna() {
  const root = $('#cannaFields');
  root.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.c) cn[t.dataset.c] = t.value;
    else if (t.dataset.cann) cn.cann[t.dataset.cann] = t.value.trim();
    else if (t.dataset.terp) cn.terps[t.dataset.terp] = t.value.trim();
    else return;
    paintSums();
  });
  root.addEventListener('change', e => {
    if (e.target.dataset.c === 'form') { cn.sub = ''; cannaRender(openSections()); }
  });
  const addCustom = input => {
    const v = input.value.trim(); if (!v) return;
    if (input.dataset.add) { if (!cn[input.dataset.add].includes(v)) cn[input.dataset.add].push(v); }
    else if (!(v in cn.terps)) cn.terps[v] = '';
    cannaRender(openSections());
  };
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.classList.contains('chip-add')) { e.preventDefault(); addCustom(e.target); }
  });
  root.addEventListener('focusout', e => { if (e.target.classList.contains('chip-add') && e.target.value.trim()) addCustom(e.target); });
  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const chips = b.closest('[data-chips]');
    if (chips && b.dataset.v) {
      const k = chips.dataset.chips, i = cn[k].indexOf(b.dataset.v);
      i >= 0 ? cn[k].splice(i, 1) : cn[k].push(b.dataset.v);
      b.classList.toggle('on', i < 0); return paintSums();
    }
    if (b.dataset.t) {
      const t = b.dataset.t;
      if (t in cn.terps) delete cn.terps[t]; else cn.terps[t] = '';
      b.classList.toggle('on', t in cn.terps);
      $('[data-terprows]').innerHTML = terpRows(); return paintSums();
    }
    const rate = b.closest('[data-rate]');
    if (rate) {
      const k = rate.dataset.rate, n = +b.dataset.n;
      cn.ratings[k] = cn.ratings[k] === n ? 0 : n;
      rate.querySelectorAll('button').forEach(x => x.classList.toggle('on', +x.dataset.n <= cn.ratings[k]));
      return paintSums();
    }
    if (b.dataset.u) { cn.cannUnit = b.dataset.u; return cannaRender(openSections()); }
    if (b.dataset.look) {
      const name = ($('#entryForm').title.value || cannaTitle).trim();
      if (!name) return toast('Type the strain name first');
      const q = encodeURIComponent(name);
      window.open(b.dataset.look === 'leafly' ? `https://www.leafly.com/search?q=${q}` : `https://www.allbud.com/marijuana-strains/search?q=${q}`, '_blank', 'noopener');
    }
  });
})();
