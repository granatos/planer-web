// auth-cloud.js — COMPACT COMPAT (nie rusza Twojego UI, używa istniejącego sb)
// Założenia: Twój app.js tworzy window.sb (lub masz <script src="supabase-js"> + okno sb).
(() => {
  if (window.__SYNC5_COMPAT__) return; window.__SYNC5_COMPAT__ = true;
  const log = (...a)=>console.log('[sync5-compat]',...a);
  const err = (...a)=>console.error('[sync5-compat]',...a);

  // ⚙️ 1) Użyj istniejącego klienta, a jeśli go nie ma – utwórz:
  (function ensureSb(){
    if (window.sb?.auth) { log('using existing sb client'); return; }
    const url = window.SUPABASE_URL, key = window.SUPABASE_ANON_KEY;
    if (!url || !key || typeof window.supabase!=='object') { err('no supabase or keys'); return; }
    window.sb = window.supabase.createClient(url, key, {
      auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }
    });
    log('created sb client (compat)');
  })();

  if (!window.sb?.auth) { err('sb not ready'); return; }

  // 🔑 2) NIE DOTYKAMY DOM-u. Tylko sync.
  const CLIENT_ID_KEY='planner_client_id';
  const CLIENT_ID = (()=>{ try{
      const k=localStorage.getItem(CLIENT_ID_KEY); if (k) return k;
      const n = crypto?.randomUUID?.() || (Math.random().toString(36).slice(2)+Date.now());
      localStorage.setItem(CLIENT_ID_KEY, n); return n;
    }catch{ return 'anon_'+Date.now(); } })();

  // Local helpers
  const jsonStable = v => { try{return JSON.stringify(v);}catch{return null;} };
  function setLocal(st){ try{ if (typeof window.STORAGE_KEY==='string') localStorage.setItem(window.STORAGE_KEY, JSON.stringify(st)); }catch{} }
  function getLocal(){ try{ if (typeof window.STORAGE_KEY==='string'){ const raw=localStorage.getItem(window.STORAGE_KEY); return raw?JSON.parse(raw):null; } }catch{} return null; }

  // 🔄 3) Sync core
  let cloudLoaded=false, lastCloudJSON=null, saveTimer=null, chan=null;
  const DEBOUNCE_MS = 1000;

  async function saveCloud(){
    if (!window.currentUser || !cloudLoaded) return;
    try{
      const payload = window.state ?? {};
      payload.__last_saved_by = CLIENT_ID;
      payload.__last_saved_at = new Date().toISOString();
      const { data, error } = await sb.from('plans')
        .upsert({ user_id: window.currentUser.id, payload }, { onConflict:'user_id' })
        .select('payload').single();
      if (error){ err('save', error); return; }
      lastCloudJSON = jsonStable(data?.payload ?? {});
      log('cloud saved');
    }catch(e){ err('save ex', e); }
  }
  function scheduleSave(){ clearTimeout(saveTimer); saveTimer=setTimeout(saveCloud, DEBOUNCE_MS); }

  async function loadCloud(){
    if (!window.currentUser) return;
    try{
      const { data, error } = await sb.from('plans')
        .select('payload').eq('user_id', window.currentUser.id).maybeSingle();
      if (error && error.code!=='PGRST116'){ err('load', error); return; }
      const cloud = data?.payload;
      if (cloud && typeof cloud==='object'){
        const js = jsonStable(cloud); if (js!==lastCloudJSON) lastCloudJSON=js;
        window.state = cloud;
        window.renderAll?.();
        setLocal(window.state);
        log('cloud loaded → applied');
      } else {
        const local = getLocal();
        if (local){
          window.state = local; window.renderAll?.(); log('no cloud row → used local & push');
          await saveCloud();
        } else {
          log('no cloud row, no local; starting empty');
        }
      }
      cloudLoaded = true;
    }catch(e){ err('load ex', e); }
  }

  async function subscribeRealtime(){
    try{
      if (chan) { sb.removeChannel(chan); chan=null; }
      const uid = window.currentUser?.id; if (!uid) return;
      chan = sb.channel('plans_user_'+uid)
        .on('postgres_changes', {event:'*', schema:'public', table:'plans', filter:`user_id=eq.${uid}`}, (pay)=>{
          try{
            const p = pay?.new?.payload; if (!p) return;
            if (p.__last_saved_by === CLIENT_ID) return; // ignoruj własne
            const inc = jsonStable(p);
            if (inc && inc !== lastCloudJSON){
              lastCloudJSON = inc;
              window.state = p;
              window.renderAll?.();
              setLocal(window.state);
              log('realtime → applied');
            }
          }catch(e){ err('rt handler', e); }
        })
        .subscribe((st)=>log('realtime:', st));
    }catch(e){ err('subscribe ex', e); }
  }

  // 🧩 4) Delikatny hook na Twoje save() (nie zmienia logiki)
  (function hookSave(){
    const orig = window.save;
    window.save = function(){
      try{ if (typeof orig==='function') orig.apply(this, arguments); }catch(e){ err('orig save', e); }
      try{ setLocal(window.state); }catch{}
      scheduleSave(); // tylko dopina zapis do chmury
    };
    log('hooked save() with debounce');
  })();

  // 👤 5) Sesja – nic nie dotykamy w UI, tylko reagujemy
  if (window.__SYNC5_AUTH_BOUND__) return; window.__SYNC5_AUTH_BOUND__ = true;
  sb.auth.onAuthStateChange(async (_e, session) => {
    window.currentUser = session?.user || null;
    if (window.currentUser){ cloudLoaded=false; await loadCloud(); await subscribeRealtime(); }
    else { if (chan) { sb.removeChannel(chan); chan=null; } }
  });
  sb.auth.getSession().then(async ({data})=>{
    window.currentUser = data?.session?.user || null;
    if (window.currentUser){ cloudLoaded=false; await loadCloud(); await subscribeRealtime(); }
  });

  log('compat ready, clientId=', CLIENT_ID);
})();
