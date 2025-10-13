// ---- konfiguracja ----
const INITIAL_WORLDS = ["A","B","C","E","F","G","H","J","K","L","M"];
const WG_VALUES = ["1 Etap","2 Etap","3 Etap","4 Etap","5 Etap","Koniec"];
const MAPA_VALUES = ["Ocean 3","Wirtual 1","Wirtual 2","Wirtual 3","Mars 1","Mars 2","Pas 1","Pas 2","Wenus 1","Wenus 2","Jowisz 1","Jowisz 2","Tytan 1","Tytan 2","Węzeł 1","Węzeł 2","Koniec"];
const EPOKA_VALUES = ["Pas","Wenus","Jowisz","Tytan","Węzeł"];
const DIAMOND_COSTS = [4000,4200,4400,4600,4800,5200,5600,6000,6400,6800,7200,7600,8000,8800,9600,10400,11200,12000,12800,13600];
const STORAGE_KEY = "planer_web_v1";

let state = {

// === SUPABASE AUTH + CLOUD STORAGE ===
// Uzupełnij wartości SUPABASE_URL i SUPABASE_ANON_KEY w pliku settings.json lub bezpośrednio tutaj.
const SUPABASE_URL = window.SUPABASE_URL || "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "YOUR-ANON-KEY";
let sb = null;
let currentUser = null;
try {
  if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY && !/YOUR-PROJECT/.test(SUPABASE_URL)) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
} catch(e){ console.warn("Supabase init failed", e); }

const authStatusEl = document.getElementById('auth-status');
const emailEl = document.getElementById('auth-email');
const btnMagic = document.getElementById('btn-magic');
const btnGoogle = document.getElementById('btn-google');
const btnLogout = document.getElementById('btn-logout');

function setAuthUI(user){
  currentUser = user;
  if (authStatusEl){
    if (user){
      authStatusEl.textContent = user.email || '(konto)';
      btnLogout && (btnLogout.hidden = false);
      btnMagic && (btnMagic.hidden = true);
      btnGoogle && (btnGoogle.hidden = true);
      emailEl && (emailEl.hidden = true);
      loadPlannerData();
    } else {
      authStatusEl.textContent = 'Nie zalogowano';
      btnLogout && (btnLogout.hidden = true);
      btnMagic && (btnMagic.hidden = false);
      btnGoogle && (btnGoogle.hidden = false);
      emailEl && (emailEl.hidden = false);
    }
  }
}

btnMagic && btnMagic.addEventListener('click', async () => {
  if (!sb) return alert('Brak konfiguracji Supabase');
  const email = emailEl.value.trim();
  if (!email) return alert('Podaj email');
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href }});
  if (error) return alert(error.message);
  alert('Sprawdź skrzynkę – wysłałem link logowania.');
});

btnGoogle && btnGoogle.addEventListener('click', async () => {
  if (!sb) return alert('Brak konfiguracji Supabase');
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google' });
  if (error) return alert(error.message);
});

btnLogout && btnLogout.addEventListener('click', async () => {
  if (!sb) return;
  await sb.auth.signOut();
});

if (sb){
  sb.auth.onAuthStateChange((_event, session) => setAuthUI(session?.user || null));
  sb.auth.getSession().then(({ data }) => setAuthUI(data.session?.user || null));
} else {
  setAuthUI(null);
}

// Debounce zapisu w chmurze
let cloudSaveTimer = null;
function scheduleSaveCloud(){
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(savePlannerData, 2500);
}

async function loadPlannerData(){
  if (!sb || !currentUser) return;
  try {
    const { data, error } = await sb
      .from('plans')
      .select('id,payload')
      .eq('user_id', currentUser.id)
      .order('updated_at', { ascending:false })
      .limit(1)
      .maybeSingle();
    if (error && error.code !== 'PGRST116'){ console.error(error); return; }
    if (data?.payload){
      state = data.payload;
      if (!state.worlds || !Array.isArray(state.worlds)) state.worlds = [];
      renderAll();
    } else {
      // brak rekordu – nic nie robimy, pozostaje lokalny stan
    }
  } catch(e){ console.error(e); }
}

async function savePlannerData(){
  if (!sb || !currentUser) return;
  try {
    const payload = state; // cały stan
    const { error } = await sb.from('plans').insert({ user_id: currentUser.id, payload });
    if (error){ console.error(error); }
  } catch(e){ console.error(e); }
}

  worlds: [],
  groups: { Event:true, GPC:true, NK:true, WG:true, Zbiory:true, "Dane świata":true },
  lastEvent8: null,
  lastMidnight: null,
  lastWGDate: null
};

// ---- utils ----
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const fmtDate = d => d.toISOString();
const todayISO = () => (new Date()).toISOString().slice(0,10);

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw);
    if (!state.worlds || !Array.isArray(state.worlds)) state.worlds = [];
  } catch(e){ /* ignore */ }
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function ensureInitialWorlds() {
  if (state.worlds.length === 0) {
    for (const w of INITIAL_WORLDS) {
      state.worlds.push(makeWorld(w));
    }
  }
}

function makeWorld(name) {
  return {
    name,
    visible:true,
    zad:false, rywal:false, pl3:false, nr:"",
    trial:"", opor:"0", koniec:false,
    silver:"", gold:"",
    nk:false, nk_ts:"",
    wg: WG_VALUES[0],
    mot:false, pr:false,
    mapa: MAPA_VALUES[0],
    epoka: EPOKA_VALUES[0]
  };
}

// ---- UI render ----
function renderAll() {
  // grupy on/off
  for (const g of ["Event","GPC","NK","WG","Zbiory","Dane świata"]) {
    const el = $("#grp-"+(g==="Dane świata"?"Dane":"")+ (g!=="Dane świata"?g:""));
  }
  // checkboxy grup
  $("#grp-Event").checked = !!state.groups["Event"];
  $("#grp-GPC").checked = !!state.groups["GPC"];
  $("#grp-NK").checked = !!state.groups["NK"];
  $("#grp-WG").checked = !!state.groups["WG"];
  $("#grp-Zbiory").checked = !!state.groups["Zbiory"];
  $("#grp-Dane").checked = !!state.groups["Dane świata"];

  const rows = $("#rows");
  rows.innerHTML = "";

  const hiddenNames = [];
  state.worlds.forEach((w, idx) => {
    if (!w.visible) hiddenNames.push(w.name);
    const row = document.createElement("div");
    row.className = "row grid" + (w.visible ? "" : " hiddenRow");

    // kolumny:
    row.appendChild(cellCheckbox(w.visible, (val)=>{ w.visible = val; refreshHiddenSelect(); renderAll(); save(); }));
    row.appendChild(cellLabel(w.name));

    // Event
    const enableEvent = !!state.groups["Event"];
    row.appendChild(cellCheckbox(w.zad, v=>{ w.zad=v; save(); }, enableEvent));
    row.appendChild(cellCheckbox(w.rywal, v=>{ w.rywal=v; save(); }, enableEvent));
    row.appendChild(cellCheckbox(w.pl3, v=>{ w.pl3=v; save(); }, enableEvent));
    row.appendChild(cellText(w.nr, v=>{ w.nr=v; save(); }, enableEvent, 6));

    // GPC
    const enableGPC = !!state.groups["GPC"];
    row.appendChild(cellText(w.trial, v=>{ if(validTrial(v)) { w.trial=v; save(); } }, enableGPC, 4));
    const oporEntry = cellText(w.opor, v=>{ w.opor=v; save(); }, enableGPC && !w.koniec, 4);
    row.appendChild(oporEntry);
    row.appendChild(cellCheckbox(w.koniec, v=>{
      w.koniec = v;
      // blokuj/odblokuj opór
      renderAll(); save();
    }, enableGPC));

    const onSilverChange = (v)=>{
      w.silver = v; save();
      // odśwież tylko badge
      badgeS.textContent = "Pakiety: " + calcPacks(toInt(v));
      badgeS.style.color = calcPacks(toInt(v))>0 ? "green" : "gray";
    };
    const onGoldChange = (v)=>{
      w.gold = v; save();
      badgeG.textContent = "Pakiety: " + calcPacks(toInt(v));
      badgeG.style.color = calcPacks(toInt(v))>0 ? "green" : "gray";
    };
    row.appendChild(cellText(w.silver, onSilverChange, enableGPC, 8));
    const badgeS = cellBadge("Pakiety: " + calcPacks(toInt(w.silver)));
    row.appendChild(badgeS);
    row.appendChild(cellText(w.gold, onGoldChange, enableGPC, 8));
    const badgeG = cellBadge("Pakiety: " + calcPacks(toInt(w.gold)));
    row.appendChild(badgeG);

    // NK
    const enableNK = !!state.groups["NK"];
    row.appendChild(cellCheckbox(w.nk, v=>{
      w.nk = v;
      w.nk_ts = v ? new Date().toISOString() : "";
      save();
    }, enableNK));

    // WG
    const enableWG = !!state.groups["WG"];
    row.appendChild(cellSelect(WG_VALUES, w.wg, v=>{
      w.wg=v; save();
    }, enableWG));

    // Zbiory
    const enableZb = !!state.groups["Zbiory"];
    row.appendChild(cellCheckbox(w.mot, v=>{ w.mot=v; save(); }, enableZb));
    row.appendChild(cellCheckbox(w.pr,  v=>{ w.pr=v;  save(); }, enableZb));

    // Dane świata
    const enableDane = !!state.groups["Dane świata"];
    row.appendChild(cellSelect(MAPA_VALUES, w.mapa, v=>{ w.mapa=v; save(); }, enableDane));
    row.appendChild(cellSelect(EPOKA_VALUES, w.epoka, v=>{ w.epoka=v; save(); }, enableDane));

    rows.appendChild(row);
  });

  refreshHiddenSelect();
}

function cellLabel(text){
  const d = document.createElement("div");
  d.className = "cell";
  d.textContent = text;
  return d;
}
function cellCheckbox(checked, onChange, enabled=true){
  const d = document.createElement("div"); d.className="cell chk-green";
  const inp = document.createElement("input");
  inp.type="checkbox"; inp.checked=!!checked; inp.disabled=!enabled;
  inp.addEventListener("change", ()=> onChange(inp.checked));
  d.appendChild(inp);
  return d;
}
function cellText(value, onChange, enabled=true, size=6){
  const d = document.createElement("div"); d.className="cell";
  const inp = document.createElement("input");
  inp.type="text"; inp.value = value ?? ""; inp.disabled=!enabled;
  inp.size = size;
  inp.addEventListener("input", ()=> onChange(inp.value));
  d.appendChild(inp);
  return d;
}
function cellSelect(options, value, onChange, enabled=true){
  const d = document.createElement("div"); d.className="cell";
  const sel = document.createElement("select");
  sel.disabled = !enabled;
  options.forEach(o=>{
    const opt = document.createElement("option"); opt.value=o; opt.textContent=o;
    if (o===value) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.addEventListener("change", ()=> onChange(sel.value));
  d.appendChild(sel);
  return d;
}
function cellBadge(text){
  const d = document.createElement("div"); d.className="cell";
  const span = document.createElement("span");
  span.className="badge";
  span.textContent = text;
  span.style.color = (text.endsWith(" 0") ? "gray" : "green");
  d.appendChild(span);
  return d;
}

function refreshHiddenSelect(){
  const sel = $("#hidden-select");
  const hidden = state.worlds.filter(w=>!w.visible).map(w=>w.name);
  sel.innerHTML = "";
  hidden.forEach(n=>{
    const o = document.createElement("option"); o.value=n; o.textContent=n; sel.appendChild(o);
  });
}

// ---- obliczenia pakietów ----
const toInt = (s)=> {
  if(!s) return 0;
  return parseInt(String(s).replace(/\s|,/g, ""), 10) || 0;
};
function calcPacks(amount){
  let left = amount, packs=0;
  for(const c of DIAMOND_COSTS){
    if(left>=c){ left -= c; packs++; } else break;
  }
  return packs;
}
const validTrial = (v)=> v==="" || (/^\d+$/.test(v) && +v>=1 && +v<=50);

// ---- resetery czasu (strefa: lokalna przeglądarki) ----
function tickResets(){
  const now = new Date();
  const wd = now.getDay(); // 0 niedziela ... 2 wtorek itd. (wtorek = 2)
  const hh = now.getHours(), mm = now.getMinutes();

  // Event 08:00
  if (hh===8 && mm===0) {
    if (state.lastEvent8 !== todayISO()) {
      if (state.groups.Event){
        state.worlds.forEach(w=>{ w.zad=false; w.rywal=false; });
        save(); renderAll();
      }
      state.lastEvent8 = todayISO();
      save();
    }
  }
  // Północ
  if (hh===0 && mm===0) {
    if (state.lastMidnight !== todayISO()) {
      if (state.groups.Event){
        state.worlds.forEach(w=> w.pl3=false);
      }
      if (state.groups.GPC){
        state.worlds.forEach(w=>{ w.opor="0"; w.koniec=false; });
      }
      save(); renderAll();
      state.lastMidnight = todayISO();
      save();
    }
  }
  // WG: wtorek 08:00
  if (wd===2 && (hh>8 || (hh===8 && mm===0))) {
    if (state.groups.WG && state.lastWGDate !== todayISO()){
      state.worlds.forEach(w=> w.wg = WG_VALUES[0]);
      save(); renderAll();
      state.lastWGDate = todayISO();
      save();
    }
  }
  // NK: 10h od zaznaczenia
  const nowMs = now.getTime();
  state.worlds.forEach(w=>{
    if (w.nk && w.nk_ts){
      const ts = Date.parse(w.nk_ts);
      if (!isNaN(ts) && nowMs - ts >= 10*60*60*1000){
        w.nk = false; w.nk_ts = "";
      }
    }
  });
  save();
}

// ---- masowe akcje ----
function setupBulk(){
  const target = $("#bulk-target");
  const ctrlWG = $("#bulk-wg");
  const ctrlOnOff = $("#bulk-onoff");
  const ctrlText = $("#bulk-text");

  function updateCtrls(){
    ctrlWG.hidden = ctrlOnOff.hidden = ctrlText.hidden = true;
    const t = target.value;
    if (t==="WG") ctrlWG.hidden=false;
    else if (t==="Motywka" || t==="PR") ctrlOnOff.hidden=false;
    else if (t==="nr zadania") ctrlText.hidden=false;
  }
  target.addEventListener("change", updateCtrls);
  updateCtrls();

  $("#bulk-apply").addEventListener("click", ()=>{
    const t = target.value;
    if (t==="WG"){
      const v = ctrlWG.value || WG_VALUES[0];
      state.worlds.filter(w=>w.visible).forEach(w=> w.wg = v);
    } else if (t==="Motywka" || t==="PR"){
      const on = (ctrlOnOff.value==="Zaznacz");
      const key = (t==="Motywka"?"mot":"pr");
      state.worlds.filter(w=>w.visible).forEach(w=> w[key] = on);
    } else if (t==="nr zadania"){
      const txt = ctrlText.value || "";
      state.worlds.filter(w=>w.visible).forEach(w=> w.nr = txt);
    }
    save(); renderAll();
  });
}

// ---- zdarzenia UI górnego paska ----
function setupTopbar(){
  // grupy
  $("#grp-Event").addEventListener("change", e=>{ state.groups.Event = e.target.checked; save(); renderAll(); });
  $("#grp-GPC").addEventListener("change", e=>{ state.groups.GPC = e.target.checked; save(); renderAll(); });
  $("#grp-NK").addEventListener("change", e=>{ state.groups.NK = e.target.checked; save(); renderAll(); });
  $("#grp-WG").addEventListener("change", e=>{ state.groups.WG = e.target.checked; save(); renderAll(); });
  $("#grp-Zbiory").addEventListener("change", e=>{ state.groups.Zbiory = e.target.checked; save(); renderAll(); });
  $("#grp-Dane").addEventListener("change", e=>{ state.groups["Dane świata"] = e.target.checked; save(); renderAll(); });

  // dodaj/usuń/przywróć
  $("#btn-add").addEventListener("click", ()=>{
    const name = ($("#world-input").value||"").trim();
    if (!name) { alert("Podaj nazwę świata."); return; }
    if (state.worlds.some(w=>w.name.toLowerCase()===name.toLowerCase())) { alert("Świat już istnieje."); return; }
    state.worlds.push(makeWorld(name));
    $("#world-input").value="";
    save(); renderAll();
  });
  $("#btn-del").addEventListener("click", ()=>{
    const name = ($("#world-input").value||"").trim();
    if (!name) { alert("Podaj nazwę świata do usunięcia."); return; }
    const i = state.worlds.findIndex(w=> w.name.toLowerCase()===name.toLowerCase());
    if (i<0) { alert("Nie znaleziono świata."); return; }
    state.worlds.splice(i,1);
    save(); renderAll();
  });
  $("#btn-restore").addEventListener("click", ()=>{
    const name = $("#hidden-select").value;
    if (!name) return;
    const w = state.worlds.find(x=>x.name===name);
    if (w){ w.visible = true; save(); renderAll(); }
  });

  // export CSV
  $("#btn-export").addEventListener("click", ()=>{
    const rows = buildCSV();
    const blob = new Blob([rows], {type:"text/csv;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `status_${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

function buildCSV(){
  const header = [
    "Świat","Visible","Zadanie dzienne","Rywal","3 plansze","nr zadania",
    "Trial","Opór","Koniec GPC","Srebrne","Pakiety S","Złote","Pakiety Z",
    "NK_ts","NK_active","WG","Motywka","PR","Mapa","Epoka"
  ];
  const lines = [header.join(";")];
  state.worlds.forEach(w=>{
    const packsS = calcPacks(toInt(w.silver));
    const packsG = calcPacks(toInt(w.gold));
    lines.push([
      w.name, +!!w.visible, +!!w.zad, +!!w.rywal, +!!w.pl3, (w.nr||""),
      (w.trial||""), (w.opor||"0"), +!!w.koniec, (w.silver||""), packsS, (w.gold||""), packsG,
      (w.nk_ts||""), +!!w.nk, (w.wg||WG_VALUES[0]), +!!w.mot, +!!w.pr, (w.mapa||""), (w.epoka||"")
    ].join(";"));
  });
  return lines.join("\n");
}

// ---- start ----
load();
ensureInitialWorlds();
setupTopbar();
setupBulk();
renderAll();
setInterval(tickResets, 30 * 1000);

// Opcjonalna migracja lokalnych danych do chmury po zalogowaniu
async function migrateLocalToCloudIfAny(){
  if (!sb || !currentUser) return;
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw);
    await sb.from('plans').insert({ user_id: currentUser.id, payload });
    // localStorage.removeItem(STORAGE_KEY); // zostaw na razie
  }catch(e){}
}
