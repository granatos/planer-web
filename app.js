// app.js — czysta, działająca logika planera + localStorage
window.STORAGE_KEY = 'planer-web-state';

window.state = window.state || {
  rows: [
    { visible: true, world: 'Świat-1', daily: '', rival: '', plans3: '', taskNo: '', trial:'', resistance:'', end:'',
      silver:'', silverPacks:'', gold:'', goldPacks:'', nk:'', wg:'', motif:'', pr:'', map:'', era:'' }
  ]
};

window.renderAll = function(){
  const root = document.getElementById('rows'); if (!root) return;
  const rows = window.state?.rows || [];
  root.innerHTML = '';
  rows.forEach((r, i) => {
    const sec = document.createElement('section');
    sec.className = 'grid row';
    sec.innerHTML = `
      <div><input type="checkbox" ${r.visible?'checked':''} data-k="visible" data-i="${i}"></div>
      <div><input type="text" value="${r.world||''}" data-k="world" data-i="${i}"></div>
      <div><input type="text" value="${r.daily||''}" data-k="daily" data-i="${i}"></div>
      <div><input type="text" value="${r.rival||''}" data-k="rival" data-i="${i}"></div>
      <div><input type="text" value="${r.plans3||''}" data-k="plans3" data-i="${i}"></div>
      <div><input type="text" value="${r.taskNo||''}" data-k="taskNo" data-i="${i}"></div>
      <div><input type="text" value="${r.trial||''}" data-k="trial" data-i="${i}"></div>
      <div><input type="text" value="${r.resistance||''}" data-k="resistance" data-i="${i}"></div>
      <div><input type="text" value="${r.end||''}" data-k="end" data-i="${i}"></div>
      <div><input type="text" value="${r.silver||''}" data-k="silver" data-i="${i}"></div>
      <div><input type="text" value="${r.silverPacks||''}" data-k="silverPacks" data-i="${i}"></div>
      <div><input type="text" value="${r.gold||''}" data-k="gold" data-i="${i}"></div>
      <div><input type="text" value="${r.goldPacks||''}" data-k="goldPacks" data-i="${i}"></div>
      <div><input type="text" value="${r.nk||''}" data-k="nk" data-i="${i}"></div>
      <div><input type="text" value="${r.wg||''}" data-k="wg" data-i="${i}"></div>
      <div><input type="text" value="${r.motif||''}" data-k="motif" data-i="${i}"></div>
      <div><input type="text" value="${r.pr||''}" data-k="pr" data-i="${i}"></div>
      <div><input type="text" value="${r.map||''}" data-k="map" data-i="${i}"></div>
      <div><input type="text" value="${r.era||''}" data-k="era" data-i="${i}"></div>
    `;
    root.appendChild(sec);
  });
};

document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.matches('input[data-k]')) return;
  const i = +el.dataset.i, k = el.dataset.k;
  if (!window.state.rows[i]) return;
  window.state.rows[i][k] = (el.type==='checkbox') ? el.checked : el.value;
  window.save();
});

document.getElementById('btn-add')?.addEventListener('click', () => {
  window.state.rows.push({ visible: true, world: '', daily: '', rival: '' });
  window.save(); window.renderAll();
});
document.getElementById('btn-del')?.addEventListener('click', () => {
  window.state.rows.pop();
  window.save(); window.renderAll();
});

document.getElementById('btn-export')?.addEventListener('click', () => {
  const rows = window.state.rows||[];
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')].concat(rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(',')));
  const blob = new Blob([lines.join('\\n')], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'planer.csv';
  document.body.appendChild(a); a.click(); a.remove();
});

window.save = function(){
  try { localStorage.setItem(window.STORAGE_KEY, JSON.stringify(window.state)); } catch {}
};

(function(){
  try { const raw = localStorage.getItem(window.STORAGE_KEY); if (raw) window.state = JSON.parse(raw); } catch {}
  window.renderAll();
})();
