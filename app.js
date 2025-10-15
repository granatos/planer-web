// Planer V2 – M1 (core). Brak auth w tym pliku – cloud może podmienić save().

// ===== Konfiguracja epok/map (statyczny snapshot – łatwo edytowalny) =====
const EPOCHS = [
  "Epoka Kamienia","Epoka Brązu","Epoka Żelaza",
  "Wczesne Średniowiecze","Rozkwit Średniowiecza","Jesień Średniowiecza",
  "Epoka Kolonialna","Epoka Przemysłowa","Epoka Postępowa","Modernizm",
  "Epoka Jutra","Epoka Oceaniczna","Epoka Wirtualna",
  "Space Age Mars","Space Age Asteroid Belt","Space Age Venus","Space Age Jupiter Moon","Space Age Titan"
];

const MAPS_BY_EPOCH = {
  "Epoka Oceaniczna": ["Ocean 1","Ocean 2","Ocean 3"],
  "Epoka Wirtualna": ["Wirtual 1","Wirtual 2","Wirtual 3"],
  "Space Age Mars": ["Mars 1","Mars 2"],
  "Space Age Asteroid Belt": ["Pas 1","Pas 2"],
  "Space Age Venus": ["Wenus 1","Wenus 2"],
  "Space Age Jupiter Moon": ["Jowisz 1","Jowisz 2"],
  "Space Age Titan": ["Tytan 1","Tytan 2"]
};

const DIAMOND_COSTS = [
  4000, 4200, 4400, 4600, 4800,
  5200, 5600, 6000, 6400, 6800,
  7200, 7600, 8000, 8800, 9600,
  10400, 11200, 12000, 12800, 13600
];

const ROUNDS = {
  base: new Date(2025, 9, 23, 8, 0, 0), // 23.10.2025 08:00
  firstDurationDays: 11,
  silverPeriodDays: 14,
  goldPeriodDays: 84
};

// ===== State =====
const STORAGE_KEY = "planer-v2-state";
const defaultModules = { GPC:true, NK:true, WG:true, Events:true, Collections:true };

function newWorld(name){
  return {
    id: crypto.randomUUID(),
    name,
    modules: {...defaultModules},
    epoch: EPOCHS[0],
    map: (MAPS_BY_EPOCH[EPOCHS[0]]||[EPOCHS[0]])[0],
    collections: { prBar:false, motif:false },
    event: { mode:"Łączenie kluczy", taskNo:"" },
    wg: { stage:"1", lastResetAt:null },
    nk: { checked:false, checkedAt:null, fullBarHHmm:"" },
    gpc: {
      trial:"", opor:"", koniec:false,
      silverCoins:0, goldCoins:0,
      silverPacks:0, goldPacks:0,
      silverBought:false, goldBought:false,
      silverRoundStart:null, goldRoundStart:null,
      dailyMarker: null
    },
    updatedAt: new Date().toISOString()
  };
}

let state = load();
if (!state.worlds?.length){
  const baseWorlds = ["A","B","C","D","E","F","G","H","J","K","L","M"].map(newWorld);
  state = { worlds: baseWorlds };
  save();
}

// ===== Helpers =====
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
function save(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch{}
  if (typeof window !== "undefined" && typeof window.onAfterLocalSave === "function"){
    window.onAfterLocalSave(state);
  }
}
function load(){
  try{ const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw); }catch{}
  return { worlds: [] };
}
function todayStr(){
  const d = new Date();
  return d.toISOString().slice(0,10);
}
function addDays(date, days){ const d=new Date(date); d.setDate(d.getDate()+days); return d; }
function currentRoundStart(now, base, firstDurationDays, periodDays){
  const afterFirst = addDays(base, firstDurationDays);
  if (now < afterFirst) return base;
  const msPerDay = 86400000;
  const diffDays = Math.floor((now - afterFirst)/msPerDay);
  const steps = Math.floor(diffDays / periodDays);
  return addDays(afterFirst, steps * periodDays);
}

// ===== UI =====
function render(){
  const app = $("#app");
  app.innerHTML = "";
  state.worlds.forEach(w => app.appendChild(renderWorldCard(w)));
  renderSummary();
}

function renderSummary(){
  const el = $("#summary-packs");
  let s=0,g=0;
  state.worlds.forEach(w => { s += +w.gpc.silverPacks||0; g += +w.gpc.goldPacks||0; });
  el.textContent = `Pakiety (globalnie): S=${s} | Z=${g}`;
  if (s>=20 || g>=20) el.classList.add("badge","warn"); else el.classList.remove("badge","warn");
}

function renderWorldCard(w){
  const card = document.createElement("div");
  card.className = "card";

  const header = document.createElement("div");
  header.className = "world-header";
  header.innerHTML = `
    <h3>Świat ${w.name}</h3>
    <div>
      ${Object.keys(defaultModules).map(m => (
        `<label class="inline"><input data-act="toggle-module" data-mod="${m}" type="checkbox" ${w.modules[m]?'checked':''}> ${m}</label>`
      )).join("")}
      <button class="secondary" data-act="remove-world">Usuń</button>
    </div>
  `;
  card.appendChild(header);

  // Epoka / Mapa
  const maps = (MAPS_BY_EPOCH[w.epoch] || [w.epoch]);
  if (!maps.includes(w.map)) w.map = maps[0];
  const row1 = document.createElement("div");
  row1.className = "row";
  row1.innerHTML = `
    <div>Epoka</div>
    <div><select data-act="set-epoch">${EPOCHS.map(e=>`<option ${e===w.epoch?'selected':''}>${e}</option>`).join("")}</select></div>
    <div><select data-act="set-map">${maps.map(m=>`<option ${m===w.map?'selected':''}>${m}</option>`).join("")}</select></div>
  `;
  card.appendChild(row1);

  if (w.modules.Collections){
    const sec = document.createElement("div");
    sec.className = "row";
    sec.innerHTML = `
      <div class="section-title">Zbiory</div>
      <label class="inline"><input data-act="toggle-pr" type="checkbox" ${w.collections.prBar?'checked':''}> Pasek PR</label>
      <label class="inline"><input data-act="toggle-motif" type="checkbox" ${w.collections.motif?'checked':''}> Motywka</label>
    `;
    card.appendChild(sec);
  }

  if (w.modules.Events){
    const sec = document.createElement("div");
    sec.className = "row";
    sec.innerHTML = `
      <div class="section-title">Eventy</div>
      <div>
        <select data-act="set-event-mode">
          ${["Łączenie kluczy","Event letni/zimowy","Patryk/Drużynowy","Zbijanie/Klocki"].map(m=>`<option ${m===w.event.mode?'selected':''}>${m}</option>`).join("")}
        </select>
      </div>
      <div><input data-act="set-event-task" placeholder="nr zadania" value="${w.event.taskNo||''}"></div>
    `;
    card.appendChild(sec);
  }

  if (w.modules.GPC){
    const sec = document.createElement("div");
    sec.className = "card";
    sec.innerHTML = `
      <div class="section-title">GPC</div>
      <div class="col-3">
        <label>Trial<br><input data-act="gpc-trial" ${w.gpc.koniec?'disabled':''} value="${w.gpc.trial||''}"></label>
        <label>Opór<br><input data-act="gpc-opor" ${w.gpc.koniec?'disabled':''} value="${w.gpc.opor||''}"></label>
        <label class="inline" style="margin-top:20px"><input type="checkbox" data-act="gpc-koniec" ${w.gpc.koniec?'checked':''}> Koniec (blokuje Trial/Opór)</label>
      </div>
      <hr>
      <div class="col-3">
        <label>Srebrne monety<br><input type="number" min="0" data-act="gpc-silver-coins" ${w.gpc.silverBought?'disabled':''} value="${w.gpc.silverCoins||0}"></label>
        <label>Pakiety S<br><input type="number" min="0" data-act="gpc-silver-packs" ${w.gpc.silverBought?'disabled':''} value="${w.gpc.silverPacks||0}"></label>
        <label class="inline" style="margin-top:20px"><input type="checkbox" data-act="gpc-silver-bought" ${w.gpc.silverBought?'checked':''}> Wykupione?</label>
      </div>
      <div class="col-3" style="margin-top:8px">
        <label>Złote monety<br><input type="number" min="0" data-act="gpc-gold-coins" ${w.gpc.goldBought?'disabled':''} value="${w.gpc.goldCoins||0}"></label>
        <label>Pakiety Z<br><input type="number" min="0" data-act="gpc-gold-packs" ${w.gpc.goldBought?'disabled':''} value="${w.gpc.goldPacks||0}"></label>
        <label class="inline" style="margin-top:20px"><input type="checkbox" data-act="gpc-gold-bought" ${w.gpc.goldBought?'checked':''}> Wykupione?</label>
      </div>
      <div class="help">Pakiety liczone jak w V1 (tu możesz wstawić swój przelicznik). Próg ≥20 ⇒ podświetlenie w topbarze.</div>
    `;
    card.appendChild(sec);
  }

  if (w.modules.NK){
    const sec = document.createElement("div");
    sec.className = "row";
    const left = w.nk.checkedAt ? timeLeft10h(w.nk.checkedAt) : "";
    sec.innerHTML = `
      <div class="section-title">NK</div>
      <label class="inline"><input type="checkbox" data-act="nk-toggle" ${w.nk.checked?'checked':''}> NK</label>
      <input data-act="nk-fullbar" placeholder="Pełny Pasek (HH:mm)" value="${w.nk.fullBarHHmm||''}">
      <span class="help">${left ? `Pozostało: ${left}` : ''}</span>
    `;
    card.appendChild(sec);
  }

  if (w.modules.WG){
    const sec = document.createElement("div");
    sec.className = "row";
    sec.innerHTML = `
      <div class="section-title">WG</div>
      <div>
        <select data-act="wg-stage">
          ${["1","2","3","4","5","Koniec"].map(s=>`<option ${s===w.wg.stage?'selected':''}>${s}</option>`).join("")}
        </select>
      </div>
      <div class="help">Reset: wtorki 08:00 ⇒ Etap 1</div>
    `;
    card.appendChild(sec);
  }

  card.addEventListener("change", (e)=>handleChange(e,w));
  card.addEventListener("input", (e)=>handleInput(e,w));
  header.addEventListener("click",(e)=>{ if (e.target.dataset.act==="remove-world") removeWorld(w.id); });

  return card;
}

// Handlers
function handleChange(e,w){
  const act = e.target.dataset.act;
  switch(act){
    case "toggle-module": w.modules[e.target.dataset.mod] = e.target.checked; break;
    case "set-epoch": w.epoch = e.target.value; w.map = (MAPS_BY_EPOCH[w.epoch]||[w.epoch])[0]; break;
    case "set-map": w.map = e.target.value; break;
    case "gpc-koniec": w.gpc.koniec = e.target.checked; break;
    case "gpc-silver-bought": w.gpc.silverBought = e.target.checked; break;
    case "gpc-gold-bought": w.gpc.goldBought = e.target.checked; break;
    case "nk-toggle": w.nk.checked = e.target.checked; w.nk.checkedAt = w.nk.checked ? new Date().toISOString() : null; break;
    case "wg-stage": w.wg.stage = e.target.value; break;
    case "set-event-mode": w.event.mode = e.target.value; break;
  }
  w.updatedAt = new Date().toISOString();
  save(); render();
}
function handleInput(e,w){
  const act = e.target.dataset.act;
  switch(act){
    case "toggle-pr": w.collections.prBar = e.target.checked; break;
    case "toggle-motif": w.collections.motif = e.target.checked; break;
    case "set-event-task": w.event.taskNo = e.target.value; break;
    case "gpc-trial": if (!w.gpc.koniec) w.gpc.trial = e.target.value; break;
    case "gpc-opor": if (!w.gpc.koniec) w.gpc.opor = e.target.value; break;
    case "gpc-silver-coins": if (!w.gpc.silverBought) w.gpc.silverCoins = clampInt(e.target.value); break;
    case "gpc-gold-coins": if (!w.gpc.goldBought) w.gpc.goldCoins = clampInt(e.target.value); break;
    case "gpc-silver-packs": if (!w.gpc.silverBought) w.gpc.silverPacks = clampInt(e.target.value); break; // podmień algorytm jeśli trzeba
    case "gpc-gold-packs": if (!w.gpc.goldBought) w.gpc.goldPacks = clampInt(e.target.value); break;
    case "nk-fullbar": w.nk.fullBarHHmm = e.target.value; break;
  }
  w.updatedAt = new Date().toISOString();
  save(); renderSummary();
}
function clampInt(v){ v = parseInt(v||0,10); return isFinite(v)&&v>=0 ? v : 0; }
function removeWorld(id){ state.worlds = state.worlds.filter(w => w.id !== id); save(); render(); }

// Topbar buttons
document.getElementById("btn-add-world").addEventListener("click", () => {
  const el = document.getElementById("new-world");
  let name = (el.value||"").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,5}$/.test(name)) return alert("Nazwa: A–Z, 0–9, max 5 znaków, bez spacji.");
  if (state.worlds.some(w => w.name === name)) return alert("Taki świat już istnieje.");
  state.worlds.push(newWorld(name)); el.value=""; save(); render();
});
document.getElementById("btn-export").addEventListener("click", () => {
  const rows=[];
  state.worlds.forEach(w => rows.push({
    world:w.name, epoch:w.epoch, map:w.map,
    prBar:w.collections.prBar, motif:w.collections.motif,
    eventMode:w.event.mode, taskNo:w.event.taskNo,
    wgStage:w.wg.stage, nkChecked:w.nk.checked, nkFullBar:w.nk.fullBarHHmm,
    trial:w.gpc.trial, opor:w.gpc.opor, koniec:w.gpc.koniec,
    silverCoins:w.gpc.silverCoins, silverPacks:w.gpc.silverPacks, silverBought:w.gpc.silverBought,
    goldCoins:w.gpc.goldCoins, goldPacks:w.gpc.goldPacks, goldBought:w.gpc.goldBought
  }));
  const headers = Object.keys(rows[0]||{world:""});
  const csv = [headers.join(",")].concat(rows.map(r => headers.map(h => JSON.stringify(r[h]??"")).join(","))).join("\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "planer_v2.csv"; document.body.appendChild(a); a.click(); a.remove();
});

// Timers / resets
function timeLeft10h(checkedAtISO){
  const start = new Date(checkedAtISO);
  const end = new Date(start.getTime() + 10*3600*1000);
  const ms = end - new Date();
  if (ms <= 0) return "00:00";
  const h = Math.floor(ms/3600000);
  const m = Math.floor((ms%3600000)/60000);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function maybeResets(){
  const now = new Date();
  const today = todayStr();

  // GPC daily
  state.worlds.forEach(w => {
    if (w.gpc.dailyMarker !== today){
      w.gpc.trial = ""; w.gpc.opor = ""; w.gpc.koniec = false;
      w.gpc.dailyMarker = today;
    }
  });

  // Rounds
  const sStart = currentRoundStart(now, ROUNDS.base, ROUNDS.firstDurationDays, ROUNDS.silverPeriodDays);
  const gStart = currentRoundStart(now, ROUNDS.base, ROUNDS.firstDurationDays, ROUNDS.goldPeriodDays);
  state.worlds.forEach(w => {
    const sISO = sStart.toISOString(); const gISO = gStart.toISOString();
    if (w.gpc.silverRoundStart !== sISO){
      w.gpc.silverRoundStart = sISO; w.gpc.silverCoins=0; w.gpc.silverPacks=0; w.gpc.silverBought=false;
    }
    if (w.gpc.goldRoundStart !== gISO){
      w.gpc.goldRoundStart = gISO; w.gpc.goldCoins=0; w.gpc.goldPacks=0; w.gpc.goldBought=false;
    }
  });

  // NK 10h from checked
  state.worlds.forEach(w => {
    if (w.nk.checked && w.nk.checkedAt){
      const end = new Date(new Date(w.nk.checkedAt).getTime() + 10*3600*1000);
      if (now >= end){ w.nk.checked=false; w.nk.checkedAt=null; }
    }
  });

  // WG Tuesday 08:00
  if (isTuesday0800(now)){
    state.worlds.forEach(w => {
      const last = w.wg.lastResetAt ? new Date(w.wg.lastResetAt) : null;
      if (!last || last < nearestTue0800OnOrBefore(now)){
        w.wg.stage = "1"; w.wg.lastResetAt = now.toISOString();
      }
    });
  }

  save(); render();
}
function isTuesday0800(d){
  return d.getDay()===2 && d.getHours()===8 && d.getMinutes()<10;
}
function nearestTue0800OnOrBefore(d){
  const x = new Date(d); x.setSeconds(0,0);
  while (true){
    const isTue = x.getDay()===2;
    const is0800 = (x.getHours()===8 && x.getMinutes()===0);
    if (isTue && is0800 && x <= d) break;
    x.setMinutes(x.getMinutes()-1);
  }
  return x;
}
setInterval(maybeResets, 60*1000);
maybeResets();
render();
