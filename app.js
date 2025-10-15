// Planer V2 – Tabela (fixed widths), uproszczone nazwy epok, GPC Czerwony/Niebieski

const STORAGE_KEY = "planer-v2-state";

// Epoki – skrócone polskie etykiety
const EPOCHS = [
  "Kamień","Brąz","Żelazo",
  "Wcz. Śred.","Rozkwit Śr.","Jesień Śr.",
  "Kolonialna","Przemysłowa","Postępowa","Modernizm",
  "Jutra","Oceaniczna","Wirtualna",
  "Pas","Mars","Wenus","Księżyc Jowisza","Tytan"
];

// Globalne mapy – można wybrać dowolną niezależnie od epoki
const MAPS = [
  ...EPOCHS,
  "Ocean 1","Ocean 2","Ocean 3",
  "Wirtual 1","Wirtual 2","Wirtual 3",
  "Pas 1","Pas 2",
  "Mars 1","Mars 2",
  "Wenus 1","Wenus 2",
  "Jowisz 1","Jowisz 2",
  "Tytan 1","Tytan 2"
];

const EVENT_MODES = ["Łączenie kluczy","Event letni/zimowy","Patryk/Drużynowy","Zbijanie/Klocki"];

// Koszty pakietów 1..20; po 20 (tylko srebrne) koszt 13600; złote max 20
const DIAMOND_COSTS = [4000,4200,4400,4600,4800,5200,5600,6000,6400,6800,7200,7600,8000,8800,9600,10400,11200,12000,12800,13600];

// Rundy
const ROUNDS = {
  base: new Date(2025, 9, 23, 8, 0, 0), // 23.10.2025 08:00
  firstDurationDays: 11,
  silverPeriodDays: 14,
  goldPeriodDays: 84
};

const defaultWorld = (name)=> ({
  id: crypto.randomUUID(),
  name,
  epoch: EPOCHS[0],
  map: MAPS[0],
  prBar: false,
  motif: false,
  eventMode: EVENT_MODES[0],
  taskNo: "",
  trial: "",
  opor: "",
  koniec: false,
  gpcColor: "", // "Czerwony" | "Niebieski" | ""
  silverCoins: 0,
  goldCoins: 0,
  silverBought: false,
  goldBought: false,
  nkChecked: false,
  nkCheckedAt: null,
  nkFullBarHHmm: "",
  wgStage: "1",
  wgLastResetAt: null,
  silverRoundStart: null,
  goldRoundStart: null,
  dailyMarker: null,
  updatedAt: new Date().toISOString()
});

let state = load();
if (!state.worlds?.length){
  state = { worlds: ["A","B","C","D","E","F","G","H","J","K","L","M"].map(defaultWorld) };
  save();
}

// ===== Helpers =====
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
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
function clampInt(v){ v = parseInt(v||0,10); return isFinite(v)&&v>=0 ? v : 0; }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function addDays(d,days){ const x=new Date(d); x.setDate(x.getDate()+days); return x; }
function currentRoundStart(now, base, firstDurationDays, periodDays){
  const afterFirst = addDays(base, firstDurationDays);
  if (now < afterFirst) return base;
  const msPerDay=86400000;
  const diffDays = Math.floor((now - afterFirst)/msPerDay);
  const steps = Math.floor(diffDays / periodDays);
  return addDays(afterFirst, steps*periodDays);
}
function calcPossiblePacks(coins, max20Only){
  let remaining = clampInt(coins);
  let count = 0;
  for (let i=0; i<DIAMOND_COSTS.length; i++){
    const cost = DIAMOND_COSTS[i];
    if (remaining >= cost){ remaining -= cost; count++; } else break;
  }
  if (!max20Only){
    const tailCost = DIAMOND_COSTS[DIAMOND_COSTS.length-1]; // 13600
    if (tailCost>0 && remaining >= tailCost){
      count += Math.floor(remaining / tailCost);
      remaining = remaining % tailCost;
    }
  }
  return { count, remaining };
}
function timeLeft10h(iso){
  const start = new Date(iso);
  const end = new Date(start.getTime() + 10*3600*1000);
  const ms = end - new Date();
  if (ms<=0) return "00:00";
  const h = Math.floor(ms/3600000);
  const m = Math.floor((ms%3600000)/60000);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function isTuesday0800(d){ return d.getDay()===2 && d.getHours()===8 && d.getMinutes()<10; }
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

// ===== Render =====
function render(){
  const body = document.getElementById("worlds-body");
  body.innerHTML = "";
  state.worlds.forEach(w => body.appendChild(renderRow(w)));
  renderSummary();
}
function renderSummary(){
  const el = document.getElementById("summary-packs");
  let s=0,g=0;
  state.worlds.forEach(w => {
    s += calcPossiblePacks(w.silverCoins, false).count;
    g += calcPossiblePacks(w.goldCoins, true).count;
  });
  el.textContent = `Pakiety możliwe (globalnie): S=${s} | Z=${g}`;
  if (s>=20 || g>=20) el.classList.add("badge","warn"); else el.classList.remove("badge","warn");
}

function renderRow(w){
  const tr = document.createElement("tr");
  const sPacks = calcPossiblePacks(w.silverCoins, false).count;
  const gPacks = calcPossiblePacks(w.goldCoins, true).count;
  const left = w.nkCheckedAt ? timeLeft10h(w.nkCheckedAt) : "";
  tr.innerHTML = `
    <td><strong>${w.name}</strong></td>
    <td>
      <select data-act="set-epoch" data-id="${w.id}">
        ${EPOCHS.map(e=>`<option ${e===w.epoch?'selected':''}>${e}</option>`).join("")}
      </select>
    </td>
    <td>
      <select data-act="set-map" data-id="${w.id}">
        ${MAPS.map(m=>`<option ${m===w.map?'selected':''}>${m}</option>`).join("")}
      </select>
    </td>
    <td class="checkbox-center"><input type="checkbox" data-act="toggle-pr" data-id="${w.id}" ${w.prBar?'checked':''}></td>
    <td class="checkbox-center"><input type="checkbox" data-act="toggle-motif" data-id="${w.id}" ${w.motif?'checked':''}></td>
    <td>
      <select data-act="set-event-mode" data-id="${w.id}">
        ${EVENT_MODES.map(m=>`<option ${m===w.eventMode?'selected':''}>${m}</option>`).join("")}
      </select>
    </td>
    <td><input data-act="set-task" data-id="${w.id}" value="${w.taskNo||''}" placeholder="nr zadania"></td>
    <td><input data-act="set-trial" data-id="${w.id}" value="${w.trial||''}" ${w.koniec?'disabled':''}></td>
    <td><input data-act="set-opor" data-id="${w.id}" value="${w.opor||''}" ${w.koniec?'disabled':''}></td>
    <td class="checkbox-center"><input type="checkbox" data-act="toggle-koniec" data-id="${w.id}" ${w.koniec?'checked':''}></td>
    <td><input type="number" min="0" data-act="set-silver-coins" data-id="${w.id}" value="${w.silverCoins||0}" ${w.silverBought?'disabled':''}></td>
    <td>${sPacks}</td>
    <td class="checkbox-center"><input type="checkbox" data-act="toggle-silver-bought" data-id="${w.id}" ${w.silverBought?'checked':''}></td>
    <td><input type="number" min="0" data-act="set-gold-coins" data-id="${w.id}" value="${w.goldCoins||0}" ${w.goldBought?'disabled':''}></td>
    <td>${gPacks}</td>
    <td class="checkbox-center"><input type="checkbox" data-act="toggle-gold-bought" data-id="${w.id}" ${w.goldBought?'checked':''}></td>
    <td class="checkbox-center"><input type="checkbox" data-act="nk-toggle" data-id="${w.id}" ${w.nkChecked?'checked':''} title="${left?`Pozostało: ${left}`:''}"></td>
    <td><input data-act="nk-fullbar" data-id="${w.id}" placeholder="HH:mm" value="${w.nkFullBarHHmm||''}"></td>
    <td>
      <select data-act="set-wg" data-id="${w.id}">
        ${["1","2","3","4","5","Koniec"].map(s=>`<option ${s===w.wgStage?'selected':''}>${s}</option>`).join("")}
      </select>
    </td>
    <td><button class="del-btn" data-act="remove-world" data-id="${w.id}">Usuń</button></td>
  `;

  // Wstrzyknięcie przycisków GPC Czerwony/Niebieski do kolumny po "Koniec"
  const gpcBtnTd = document.createElement("td");
  const btnRed = document.createElement("button");
  btnRed.textContent = "Czerwony";
  btnRed.className = "btn-toggle" + (w.gpcColor==="Czerwony" ? " active" : "");
  btnRed.dataset.act = "gpc-color-red"; btnRed.dataset.id = w.id;

  const btnBlue = document.createElement("button");
  btnBlue.textContent = "Niebieski";
  btnBlue.className = "btn-toggle" + (w.gpcColor==="Niebieski" ? " active" : "");
  btnBlue.dataset.act = "gpc-color-blue"; btnBlue.dataset.id = w.id;

  // Wstaw po 10. kolumnie (po 'Koniec')
  const cells = tr.querySelectorAll("td");
  tr.insertBefore(gpcBtnTd, cells[10].nextSibling);
  gpcBtnTd.appendChild(btnRed);
  gpcBtnTd.appendChild(btnBlue);

  // Zaktualizuj headery (dodamy kolumnę w thead na tym samym miejscu)
  return tr;
}

// Wstaw nagłówek dla kolumny kolorów GPC (po render Table head initial creation in index.html)
// Tu modyfikujemy thead tylko raz
(function ensureGpcColorHeader(){
  const thead = document.querySelector("#worlds-table thead tr");
  if (!thead) return;
  const ths = thead.querySelectorAll("th");
  if (ths.length===20){ // oczekiwany stary układ
    const th = document.createElement("th");
    th.textContent = "GPC – Kolor";
    thead.insertBefore(th, ths[10].nextSibling); // po 'GPC – Koniec'
  }
})();

// ===== Handlers =====
document.addEventListener("change", (e)=>{
  const act = e.target.dataset.act; if (!act) return;
  const id = e.target.dataset.id;
  const w = state.worlds.find(x => x.id===id); if (!w) return;

  switch(act){
    case "set-epoch": w.epoch = e.target.value; break;
    case "set-map": w.map = e.target.value; break;
    case "toggle-pr": w.prBar = e.target.checked; break;
    case "toggle-motif": w.motif = e.target.checked; break;
    case "set-event-mode": w.eventMode = e.target.value; break;
    case "toggle-koniec": w.koniec = e.target.checked; break;
    case "toggle-silver-bought": w.silverBought = e.target.checked; break;
    case "toggle-gold-bought": w.goldBought = e.target.checked; break;
    case "nk-toggle":
      w.nkChecked = e.target.checked;
      w.nkCheckedAt = w.nkChecked ? new Date().toISOString() : null;
      break;
    case "set-wg": w.wgStage = e.target.value; break;
  }
  w.updatedAt = new Date().toISOString();
  save(); render();
});

document.addEventListener("input", (e)=>{
  const act = e.target.dataset.act; if (!act) return;
  const id = e.target.dataset.id;
  const w = state.worlds.find(x => x.id===id); if (!w) return;

  switch(act){
    case "set-task": w.taskNo = e.target.value; break;
    case "set-trial": if (!w.koniec) w.trial = e.target.value; break;
    case "set-opor": if (!w.koniec) w.opor = e.target.value; break;
    case "set-silver-coins": if (!w.silverBought) w.silverCoins = clampInt(e.target.value); break;
    case "set-gold-coins": if (!w.goldBought) w.goldCoins = clampInt(e.target.value); break;
    case "nk-fullbar": w.nkFullBarHHmm = e.target.value; break;
  }
  w.updatedAt = new Date().toISOString();
  save();
  if (act==="set-silver-coins" || act==="set-gold-coins") renderSummary();
});

// GPC kolor buttons (mutually exclusive)
document.addEventListener("click", (e)=>{
  const act = e.target.dataset.act;
  if (act==="remove-world"){
    const id = e.target.dataset.id;
    state.worlds = state.worlds.filter(w => w.id!==id);
    save(); render(); return;
  }
  if (act==="gpc-color-red" || act==="gpc-color-blue"){
    const id = e.target.dataset.id;
    const w = state.worlds.find(x=>x.id===id); if (!w) return;
    w.gpcColor = (act==="gpc-color-red") ? "Czerwony" : "Niebieski";
    w.updatedAt = new Date().toISOString();
    save(); render(); // odśwież, by ustawić .active
  }
});

// Dodawanie świata
document.getElementById("btn-add-world").addEventListener("click", ()=>{
  const el = document.getElementById("new-world");
  let name = (el.value||"").trim().toUpperCase();
  if (!/^[A-Z0-9]{1,5}$/.test(name)) return alert("Nazwa: A–Z, 0–9, max 5 znaków, bez spacji.");
  if (state.worlds.some(w => w.name === name)) return alert("Taki świat już istnieje.");
  state.worlds.push(defaultWorld(name));
  el.value=""; save(); render();
});

// Resety / timery
function maybeResets(){
  const now = new Date();
  const today = todayStr();

  // GPC dzienny reset 00:00
  state.worlds.forEach(w => {
    if (w.dailyMarker !== today){
      w.trial = ""; w.opor = ""; w.koniec = false;
      w.dailyMarker = today;
    }
  });

  // Rundy
  const sStart = currentRoundStart(now, ROUNDS.base, ROUNDS.firstDurationDays, ROUNDS.silverPeriodDays);
  const gStart = currentRoundStart(now, ROUNDS.base, ROUNDS.firstDurationDays, ROUNDS.goldPeriodDays);
  state.worlds.forEach(w => {
    const sISO = sStart.toISOString();
    const gISO = gStart.toISOString();
    if (w.silverRoundStart !== sISO){ w.silverRoundStart = sISO; w.silverCoins=0; w.silverBought=false; }
    if (w.goldRoundStart !== gISO){ w.goldRoundStart = gISO; w.goldCoins=0; w.goldBought=false; }
  });

  // NK 10h
  state.worlds.forEach(w => {
    if (w.nkChecked && w.nkCheckedAt){
      const end = new Date(new Date(w.nkCheckedAt).getTime() + 10*3600*1000);
      if (now >= end){ w.nkChecked=false; w.nkCheckedAt=null; }
    }
  });

  // WG wt 08:00
  if (isTuesday0800(now)){
    state.worlds.forEach(w => {
      const last = w.wgLastResetAt ? new Date(w.wgLastResetAt) : null;
      if (!last || last < nearestTue0800OnOrBefore(now)){
        w.wgStage = "1"; w.wgLastResetAt = now.toISOString();
      }
    });
  }

  save(); render();
}

setInterval(maybeResets, 60*1000);
maybeResets();
render();
