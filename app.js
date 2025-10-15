// app.js — przywrócona logika planera + normalizacja
// Współpracuje z auth-cloud.js (compat). Nic o auth tutaj.

// --- Normalizacja stanu ---
window.normalizeState = function (s) {
  if (!s || typeof s !== 'object') s = {};
  if (!Array.isArray(s.rows)) s.rows = [];
  // Pola domyślne dla wierszy
  s.rows = s.rows.map(r => ({
    visible: r?.visible !== false,
    world: r?.world ?? '',
    daily: r?.daily ?? '',
    rival: r?.rival ?? '',
    plans3: r?.plans3 ?? '',
    taskNo: r?.taskNo ?? '',
    trial: r?.trial ?? '',
    resistance: r?.resistance ?? '',
    end: r?.end ?? '',
    silver: r?.silver ?? '',
    silverPacks: r?.silverPacks ?? '',
    gold: r?.gold ?? '',
    goldPacks: r?.goldPacks ?? '',
    nk: r?.nk ?? '',
    wg: r?.wg ?? '',
    motif: r?.motif ?? '',
    pr: r?.pr ?? '',
    map: r?.map ?? '',
    era: r?.era ?? ''
  }));
  return s;
};

window.STORAGE_KEY = 'planer-web-state';

// Startowy stan
window.state = window.normalizeState(window.state || {
  rows: []
});

// --- Helpers ---
const $ = (id) => document.getElementById(id);
function toNumber(v){ const n = parseInt(String(v).replace(',', '.')); return Number.isFinite(n) ? n : 0; }

// --- Render UI ---
window.renderAll = function(){
  const root = $('rows'); if (!root) return;
  const rows = window.state?.rows || [];
  root.innerHTML = '';

  rows.forEach((r, i) => {
    const sec = document.createElement('section');
    sec.className = 'grid row';
    if (!r.visible) sec.style.display = 'none';
    sec.innerHTML = `
      <div><input type="checkbox" ${r.visible?'checked':''} data-k="visible" data-i="${i}"></div>
      <div><input type="text" value="${r.world||''}" data-k="world" data-i="${i}" placeholder="Świat"></div>
      <div><input type="text" value="${r.daily||''}" data-k="daily" data-i="${i}"></div>
      <div><input type="text" value="${r.rival||''}" data-k="rival" data-i="${i}"></div>
      <div><input type="text" value="${r.plans3||''}" data-k="plans3" data-i="${i}"></div>
      <div><input type="text" value="${r.taskNo||''}" data-k="taskNo" data-i="${i}"></div>
      <div><input type="text" value="${r.trial||''}" data-k="trial" data-i="${i}"></div>
      <div><input type="text" value="${r.resistance||''}" data-k="resistance" data-i="${i}"></div>
      <div><input type="text" value="${r.end||''}" data-k="end" data-i="${i}"></div>
      <div><input type="text" value="${r.silver||''}" data-k="silver" data-i="${i}"></div>
      <div><input type="text" value="${r.silverPacks||''}" data-k="silverPacks" data-i="${i}" placeholder="0"></div>
      <div><input type="text" value="${r.gold||''}" data-k="gold" data-i="${i}"></div>
      <div><input type="text" value="${r.goldPacks||''}" data-k="goldPacks" data-i="${i}" placeholder="0"></div>
      <div><input type="text" value="${r.nk||''}" data-k="nk" data-i="${i}"></div>
      <div><input type="text" value="${r.wg||''}" data-k="wg" data-i="${i}"></div>
      <div><input type="text" value="${r.motif||''}" data-k="motif" data-i="${i}"></div>
      <div><input type="text" value="${r.pr||''}" data-k="pr" data-i="${i}"></div>
      <div><input type="text" value="${r.map||''}" data-k="map" data-i="${i}"></div>
      <div><input type="text" value="${r.era||''}" data-k="era" data-i="${i}"></div>
    `;
    root.appendChild(sec);
  });

  // Hidden select rebuild
  const sel = $('hidden-select');
  if (sel){
    const hidden = rows.map((r, i)=>({label: r.world||(`Wiersz ${i+1}`), idx:i})).filter(x => window.state.rows[x.idx].visible === false);
    sel.innerHTML = hidden.map(h => `<option value="${h.idx}">${h.label}</option>`).join('');
  }

  // Totals badge
  updateTotalsBadge();
};

function updateTotalsBadge(){
  let silverSum=0, goldSum=0;
  for (const r of window.state.rows){
    if (!r.visible) continue;
    silverSum += toNumber(r.silverPacks);
    goldSum   += toNumber(r.goldPacks);
  }
  let badge = document.getElementById('totals-badge');
  if (!badge){
    badge = document.createElement('span');
    badge.id = 'totals-badge';
    badge.style.marginLeft = '8px';
    const exportBtn = $('btn-export');
    if (exportBtn) exportBtn.after(badge);
  }
  badge.textContent = `Pakiety: S=${silverSum} | Z=${goldSum}`;
}

// --- Edycja pól ---
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.matches('input[data-k]')) return;
  const i = +el.dataset.i, k = el.dataset.k;
  window.state = window.normalizeState(window.state);
  if (!window.state.rows[i]) return;
  window.state.rows[i][k] = (el.type==='checkbox') ? el.checked : el.value;
  window.save();
  if (k === 'silverPacks' || k === 'goldPacks' || k === 'visible') updateTotalsBadge();
});

// --- Dodawanie / Usuwanie światów wg pola „Świat” ---
$('btn-add')?.addEventListener('click', () => {
  window.state = window.normalizeState(window.state);
  const world = ($('world-input')?.value || '').trim();
  const base = { visible: true, world, daily: '', rival: '', plans3: '', taskNo: '', trial:'', resistance:'', end:'',
    silver:'', silverPacks:'', gold:'', goldPacks:'', nk:'', wg:'', motif:'', pr:'', map:'', era:'' };
  window.state.rows.push(base);
  window.save(); window.renderAll();
});

$('btn-del')?.addEventListener('click', () => {
  window.state = window.normalizeState(window.state);
  const world = ($('world-input')?.value || '').trim();
  if (world){
    const idx = window.state.rows.findIndex(r => (r.world||'').trim() === world);
    if (idx >= 0) window.state.rows.splice(idx, 1);
  } else {
    window.state.rows.pop();
  }
  window.save(); window.renderAll();
});

// --- Ukrywanie przez checkbox + Przywracanie ---
$('btn-restore')?.addEventListener('click', () => {
  window.state = window.normalizeState(window.state);
  const sel = $('hidden-select'); if (!sel) return;
  const idx = +sel.value;
  if (!Number.isFinite(idx)) return;
  if (window.state.rows[idx]) window.state.rows[idx].visible = true;
  window.save(); window.renderAll();
});

// --- Bulk apply ---
$('bulk-apply')?.addEventListener('click', () => {
  const target = $('bulk-target')?.value;
  const wgVal  = $('bulk-wg')?.value;
  const onoff  = $('bulk-onoff')?.value;
  const text   = $('bulk-text')?.value;

  window.state = window.normalizeState(window.state);
  const rows = window.state.rows.filter(r => r.visible);

  if (target === 'WG'){
    rows.forEach(r => r.wg = wgVal);
  } else if (target === 'Motywka'){
    rows.forEach(r => r.motif = text || '');
  } else if (target === 'PR'){
    rows.forEach(r => r.pr = text || '');
  } else if (target === 'nr zadania'){
    rows.forEach(r => r.taskNo = text || '');
  }
  window.save(); window.renderAll();
});

// --- Save (localStorage) — chmura dopina auth-cloud.js ---
window.save = function(){
  try { localStorage.setItem(window.STORAGE_KEY, JSON.stringify(window.normalizeState(window.state))); } catch {}
};

// --- Boot ---
(function(){
  try { const raw = localStorage.getItem(window.STORAGE_KEY); if (raw) window.state = JSON.parse(raw); } catch {}
  window.state = window.normalizeState(window.state);
  // jeśli nie ma żadnego wiersza — dodaj startowy
  if (!window.state.rows.length){
    window.state.rows.push({ visible: true, world: 'Świat-1', daily: '', rival: '', plans3: '', taskNo: '', trial:'', resistance:'', end:'',
      silver:'', silverPacks:'', gold:'', goldPacks:'', nk:'', wg:'', motif:'', pr:'', map:'', era:'' });
  }
  window.renderAll();
})();