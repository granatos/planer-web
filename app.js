// app.js — CORE v2 (clean interior) — works with auth-cloud.js + auth-ui.js
// No auth here. This file owns UI logic and local state. Cloud layer wraps window.save().

// ===== Utilities =====
const $ = (id) => document.getElementById(id);
const bySel = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const toInt = (v) => {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(',', '.').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const uid = () => (crypto?.randomUUID?.() || (`w_${Math.random().toString(36).slice(2)}_${Date.now()}`));

// ===== Event bus (tiny) =====
const bus = (()=>{
  const map = new Map();
  return {
    on(ev, fn){ if(!map.has(ev)) map.set(ev, []); map.get(ev).push(fn); },
    emit(ev, payload){ (map.get(ev)||[]).forEach(fn => { try{ fn(payload); }catch(e){ console.error(e);} }); }
  };
})();

// ===== State schema & normalization =====
window.STORAGE_KEY = 'planer-web-state';

function normalizeRow(r){
  return {
    id: r?.id || uid(),
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
  };
}

window.normalizeState = function(s){
  if (!s || typeof s !== 'object') s = {};
  if (!Array.isArray(s.rows)) s.rows = [];
  s.rows = s.rows.map(normalizeRow);
  // Column group visibility flags (default: all on)
  const dfltCols = { Event:true, GPC:true, NK:true, WG:true, Zbiory:true, Dane:true };
  s.columns = Object.assign(dfltCols, s.columns || {});
  return s;
};

// ===== Initial state =====
window.state = window.normalizeState(window.state || {
  rows: [ normalizeRow({ world: 'Świat-1', visible:true }) ],
  columns: { Event:true, GPC:true, NK:true, WG:true, Zbiory:true, Dane:true }
});

// ===== Rendering =====
function renderGroups(){
  // Respect group toggles by applying CSS classes to root
  const root = document.documentElement;
  const grp = window.state.columns;
  const classes = {
    Event: 'colgrp-event', GPC:'colgrp-gpc', NK:'colgrp-nk',
    WG:'colgrp-wg', Zbiory:'colgrp-zbiory', Dane:'colgrp-dane'
  };
  for (const [key, cls] of Object.entries(classes)){
    if (grp[key]) root.classList.remove(`hide-${cls}`);
    else root.classList.add(`hide-${cls}`);
  }
}

function renderHeaderToggles(){
  const ids = ['grp-Event','grp-GPC','grp-NK','grp-WG','grp-Zbiory','grp-Dane'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const key = id.split('-')[1];
    el.checked = !!window.state.columns[key];
  });
}

function rebuildHiddenSelect(){
  const sel = document.getElementById('hidden-select'); if (!sel) return;
  const hidden = window.state.rows.filter(r => !r.visible).map(r => ({id:r.id, label:r.world || `Wiersz ${r.id.slice(-4)}`}));
  sel.innerHTML = hidden.map(h => `<option value="${h.id}">${h.label}</option>`).join('');
}

function renderRows(){
  const root = document.getElementById('rows'); if (!root) return;
  root.innerHTML = '';
  const rows = window.state.rows;

  rows.forEach((r) => {
    const sec = document.createElement('section');
    sec.className = 'grid row';
    if (!r.visible) sec.style.display = 'none';
    sec.dataset.id = r.id;

    sec.innerHTML = `
      <div><input type="checkbox" ${r.visible?'checked':''} data-k="visible"></div>
      <div><input type="text" value="${r.world||''}" data-k="world" placeholder="Świat"></div>

      <div class="col-Event"><input type="text" value="${r.daily||''}" data-k="daily"></div>
      <div class="col-Event"><input type="text" value="${r.rival||''}" data-k="rival"></div>
      <div class="col-Event"><input type="text" value="${r.plans3||''}" data-k="plans3"></div>
      <div class="col-Event"><input type="text" value="${r.taskNo||''}" data-k="taskNo"></div>

      <div class="col-GPC"><input type="text" value="${r.trial||''}" data-k="trial"></div>
      <div class="col-GPC"><input type="text" value="${r.resistance||''}" data-k="resistance"></div>
      <div class="col-GPC"><input type="text" value="${r.end||''}" data-k="end"></div>

      <div class="col-Zbiory"><input type="text" value="${r.silver||''}" data-k="silver"></div>
      <div class="col-Zbiory"><input type="text" value="${r.silverPacks||''}" data-k="silverPacks" placeholder="0"></div>
      <div class="col-Zbiory"><input type="text" value="${r.gold||''}" data-k="gold"></div>
      <div class="col-Zbiory"><input type="text" value="${r.goldPacks||''}" data-k="goldPacks" placeholder="0"></div>

      <div class="col-NK"><input type="text" value="${r.nk||''}" data-k="nk"></div>
      <div class="col-WG"><input type="text" value="${r.wg||''}" data-k="wg"></div>

      <div class="col-Dane"><input type="text" value="${r.motif||''}" data-k="motif"></div>
      <div class="col-Dane"><input type="text" value="${r.pr||''}" data-k="pr"></div>
      <div class="col-Dane"><input type="text" value="${r.map||''}" data-k="map"></div>
      <div class="col-Dane"><input type="text" value="${r.era||''}" data-k="era"></div>
    `;
    root.appendChild(sec);
  });
}

function updateTotals(){
  let s=0,g=0;
  for (const r of window.state.rows){
    if (!r.visible) continue;
    s += toInt(r.silverPacks);
    g += toInt(r.goldPacks);
  }
  let badge = document.getElementById('totals-badge');
  if (!badge){
    badge = document.createElement('span');
    badge.id = 'totals-badge';
    badge.style.marginLeft = '8px';
    const btn = document.getElementById('btn-export'); if (btn) btn.after(badge);
  }
  badge.textContent = `Pakiety: S=${s} | Z=${g}`;
}

window.renderAll = function(){
  window.state = window.normalizeState(window.state);
  renderGroups();
  renderHeaderToggles();
  renderRows();
  rebuildHiddenSelect();
  updateTotals();
};

// ===== Persistence =====
window.save = function(){
  try {
    const clean = window.normalizeState(window.state);
    localStorage.setItem(window.STORAGE_KEY, JSON.stringify(clean));
    bus.emit('saved', { at: Date.now() });
  } catch(e){ console.error(e); }
};

(function boot(){
  try {
    const raw = localStorage.getItem(window.STORAGE_KEY);
    if (raw) window.state = JSON.parse(raw);
  } catch {}
  window.state = window.normalizeState(window.state);
  if (!window.state.rows.length) window.state.rows.push(normalizeRow({ world:'Świat-1', visible:true }));
  window.renderAll();
})();

// ===== Interactions =====
['Event','GPC','NK','WG','Zbiory','Dane'].forEach(key => {
  const el = document.getElementById(`grp-${key}`);
  el?.addEventListener('change', () => {
    window.state.columns[key] = !!el.checked;
    window.save(); window.renderAll();
  });
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.matches('section.row input[data-k]')) return;
  const sec = el.closest('section.row'); if (!sec) return;
  const id = sec.dataset.id;
  const row = window.state.rows.find(r => r.id === id); if (!row) return;
  const k = el.dataset.k;
  row[k] = (el.type === 'checkbox') ? el.checked : el.value;
  if (k === 'visible') { rebuildHiddenSelect(); }
  if (k === 'silverPacks' || k === 'goldPacks' || k === 'visible') updateTotals();
  window.save();
});

document.getElementById('btn-add')?.addEventListener('click', () => {
  const world = (document.getElementById('world-input')?.value || '').trim();
  const row = normalizeRow({ world, visible:true });
  window.state.rows.push(row);
  window.save(); window.renderAll();
});

document.getElementById('btn-del')?.addEventListener('click', () => {
  const world = (document.getElementById('world-input')?.value || '').trim();
  if (world){
    const idx = window.state.rows.findIndex(r => (r.world||'').trim() === world);
    if (idx >= 0) window.state.rows.splice(idx, 1);
  } else {
    window.state.rows.pop();
  }
  window.save(); window.renderAll();
});

document.getElementById('btn-restore')?.addEventListener('click', () => {
  const sel = document.getElementById('hidden-select'); if (!sel) return;
  const id = sel.value; if (!id) return;
  const row = window.state.rows.find(r => r.id === id); if (!row) return;
  row.visible = true;
  window.save(); window.renderAll();
});

document.getElementById('bulk-apply')?.addEventListener('click', () => {
  const target = document.getElementById('bulk-target')?.value;
  const wgVal  = document.getElementById('bulk-wg')?.value;
  const onoff  = document.getElementById('bulk-onoff')?.value;
  const text   = document.getElementById('bulk-text')?.value;

  const rows = window.state.rows.filter(r => r.visible);

  switch (target){
    case 'WG':
      rows.forEach(r => r.wg = wgVal);
      break;
    case 'Motywka':
      rows.forEach(r => r.motif = text || '');
      break;
    case 'PR':
      rows.forEach(r => r.pr = text || '');
      break;
    case 'nr zadania':
      rows.forEach(r => r.taskNo = text || '');
      break;
    default: break;
  }
  window.save(); window.renderAll();
});

document.getElementById('btn-export')?.addEventListener('click', () => {
  const rows = window.state.rows; if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')].concat(rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(',')));
  const blob = new Blob([lines.join('\n')], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'planer.csv';
  document.body.appendChild(a); a.click(); a.remove();
});

// ===== End CORE v2 =====
